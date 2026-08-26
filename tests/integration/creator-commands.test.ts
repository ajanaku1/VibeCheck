import { describe, expect, it } from 'vitest'

import {
  transitionCase,
  type CaseAction,
  type CaseState,
} from '../../src/domain/case-state.js'
import {
  CommandService,
  type ActionableCase,
  type CreatorActionGateway,
  type ResolvedCreatorCommand,
} from '../../src/server/services/command-service.js'

const CREATOR_ID = '123456789'
const CASE_ID = '11111111-1111-4111-8111-111111111111'
const SECOND_CASE_ID = '22222222-2222-4222-8222-222222222222'

interface MutableCase extends ActionableCase {
  suggestedText: string
  finalText: string | null
  hasRecoveryEvidence: boolean
}

class InMemoryCaseGateway implements CreatorActionGateway {
  readonly commands: ResolvedCreatorCommand[] = []

  constructor(readonly cases: MutableCase[]) {}

  listCases(): Promise<ActionableCase[]> {
    return Promise.resolve(this.cases.map(toActionableCase))
  }

  execute(command: ResolvedCreatorCommand): Promise<{ state: CaseState; finalText?: string }> {
    this.commands.push(command)
    const recoveryCase = this.cases.find(({ id }) => id === command.caseId)
    if (!recoveryCase) throw new Error('Missing test case')
    const action = toCaseAction(command.action)
    const transition = transitionCase({
      state: recoveryCase.state,
      action,
      hasFinalOutreach: recoveryCase.finalText !== null,
      hasRecoveryEvidence: recoveryCase.hasRecoveryEvidence,
    })
    if (command.action === 'approve') recoveryCase.finalText = recoveryCase.suggestedText
    if (command.action === 'edit') recoveryCase.finalText = command.replacement
    recoveryCase.state = transition.toState
    return Promise.resolve({
      state: recoveryCase.state,
      ...(recoveryCase.finalText ? { finalText: recoveryCase.finalText } : {}),
    })
  }
}

describe('CommandService creator journey', () => {
  it('approves suggested copy without leaving Needs Review', async () => {
    const { service, gateway } = createService([newCase()])

    const result = await service.handle({ senderTelegramUserId: CREATOR_ID, text: `Approve ${CASE_ID}` })

    expect(result).toMatchObject({ status: 'applied', caseId: CASE_ID, state: 'needs_review' })
    expect(gateway.cases[0]?.finalText).toBe('Suggested private outreach.')
  })

  it('edits copy with case-insensitive syntax and keeps Needs Review', async () => {
    const { service, gateway } = createService([newCase()])

    const result = await service.handle({
      senderTelegramUserId: CREATOR_ID,
      text: `eDiT ${CASE_ID}:  My revised outreach.  `,
    })

    expect(result).toMatchObject({
      status: 'applied',
      caseId: CASE_ID,
      state: 'needs_review',
      finalText: 'My revised outreach.',
    })
    expect(gateway.cases[0]?.finalText).toBe('My revised outreach.')
  })

  it('requires finalized copy before Sent and then begins Monitoring', async () => {
    const { service, gateway } = createService([newCase()])

    await expect(
      service.handle({ senderTelegramUserId: CREATOR_ID, text: `Sent ${CASE_ID}` }),
    ).resolves.toMatchObject({ status: 'help', code: 'invalid_state' })
    gateway.cases[0]!.finalText = 'Approved outreach.'
    await expect(
      service.handle({ senderTelegramUserId: CREATOR_ID, text: `Sent ${CASE_ID}` }),
    ).resolves.toMatchObject({ status: 'applied', state: 'monitoring' })
  })

  it('dismisses a Needs Review case', async () => {
    const { service } = createService([newCase()])

    await expect(
      service.handle({ senderTelegramUserId: CREATOR_ID, text: `Dismiss ${CASE_ID}` }),
    ).resolves.toMatchObject({ status: 'applied', state: 'dismissed' })
  })

  it('confirms recovery only for a detected case with retained evidence', async () => {
    const { service } = createService([
      newCase({ state: 'recovery_detected', hasRecoveryEvidence: true }),
    ])

    await expect(
      service.handle({
        senderTelegramUserId: CREATOR_ID,
        text: `Confirm recovery ${CASE_ID}`,
      }),
    ).resolves.toMatchObject({ status: 'applied', state: 'resolved' })
  })

  it('returns Not recovered to Monitoring', async () => {
    const { service } = createService([
      newCase({ state: 'recovery_detected', hasRecoveryEvidence: true }),
    ])

    await expect(
      service.handle({ senderTelegramUserId: CREATOR_ID, text: `Not recovered ${CASE_ID}` }),
    ).resolves.toMatchObject({ status: 'applied', state: 'monitoring' })
  })

  it.each(['monitoring', 'recovery_detected'] as const)(
    'marks a %s case unresolved',
    async (state) => {
      const { service } = createService([newCase({ state, hasRecoveryEvidence: true })])

      await expect(
        service.handle({
          senderTelegramUserId: CREATOR_ID,
          text: `Still unresolved ${CASE_ID}`,
        }),
      ).resolves.toMatchObject({ status: 'applied', state: 'unresolved' })
    },
  )

  it('resolves an omitted case ID only when exactly one case is eligible', async () => {
    const { service, gateway } = createService([
      newCase(),
      newCase({ id: SECOND_CASE_ID, state: 'monitoring', finalText: 'Already sent.' }),
    ])

    await expect(
      service.handle({ senderTelegramUserId: CREATOR_ID, text: 'Approve' }),
    ).resolves.toMatchObject({ status: 'applied', caseId: CASE_ID })
    expect(gateway.commands).toHaveLength(1)
  })

  it('returns minimal disambiguation without evidence when multiple cases are eligible', async () => {
    const { service, gateway } = createService([
      newCase(),
      newCase({ id: SECOND_CASE_ID, affectedLabels: ['Taylor', 'Morgan'] }),
    ])

    const result = await service.handle({ senderTelegramUserId: CREATOR_ID, text: 'Approve' })

    expect(result).toEqual({
      status: 'help',
      code: 'ambiguous_case',
      message: 'More than one case can use Approve. Include a case ID.',
      cases: [
        { shortId: '11111111', state: 'needs_review', affectedLabels: ['Alex', 'Sam'] },
        { shortId: '22222222', state: 'needs_review', affectedLabels: ['Taylor', 'Morgan'] },
      ],
    })
    expect(gateway.commands).toHaveLength(0)
  })

  it('rejects unauthorized senders and unsupported commands without dispatch', async () => {
    const { service, gateway } = createService([newCase()])

    await expect(
      service.handle({ senderTelegramUserId: '987654321', text: `Approve ${CASE_ID}` }),
    ).resolves.toMatchObject({ status: 'help', code: 'forbidden' })
    await expect(
      service.handle({ senderTelegramUserId: CREATOR_ID, text: `Delete ${CASE_ID}` }),
    ).resolves.toMatchObject({ status: 'help', code: 'unsupported_command' })
    expect(gateway.commands).toHaveLength(0)
  })

  it('rejects empty or overlong edited outreach before dispatch', async () => {
    const { service, gateway } = createService([newCase()])

    await expect(
      service.handle({ senderTelegramUserId: CREATOR_ID, text: `Edit ${CASE_ID}:   ` }),
    ).resolves.toMatchObject({ status: 'help', code: 'invalid_edit' })
    await expect(
      service.handle({
        senderTelegramUserId: CREATOR_ID,
        text: `Edit ${CASE_ID}: ${'x'.repeat(2_001)}`,
      }),
    ).resolves.toMatchObject({ status: 'help', code: 'invalid_edit' })
    expect(gateway.commands).toHaveLength(0)
  })

  it('does not misreport an operational gateway failure as an invalid command', async () => {
    const gateway: CreatorActionGateway = {
      listCases: async () => [toActionableCase(newCase())],
      execute: async () => {
        throw new Error('database unavailable')
      },
    }
    const service = new CommandService({ authorizedTelegramUserId: CREATOR_ID, gateway })

    await expect(
      service.handle({ senderTelegramUserId: CREATOR_ID, text: `Approve ${CASE_ID}` }),
    ).rejects.toThrow('database unavailable')
  })

  it('records invalid-state and ambiguous commands without dispatching them', async () => {
    const gateway = new InMemoryCaseGateway([
      newCase(),
      newCase({ id: SECOND_CASE_ID, affectedLabels: ['Taylor', 'Morgan'] }),
    ])
    const rejected: Array<{ code: string; caseIds: string[] }> = []
    Object.assign(gateway, {
      recordRejectedCommand: async (record: { code: string; caseIds: string[] }) => {
        rejected.push(record)
      },
    })
    const service = new CommandService({ authorizedTelegramUserId: CREATOR_ID, gateway })

    await service.handle({ senderTelegramUserId: CREATOR_ID, text: `Sent ${CASE_ID}` })
    await service.handle({ senderTelegramUserId: CREATOR_ID, text: 'Approve' })

    expect(rejected).toEqual([
      { code: 'invalid_state', caseIds: [CASE_ID] },
      { code: 'ambiguous_case', caseIds: [CASE_ID, SECOND_CASE_ID] },
    ])
    expect(gateway.commands).toHaveLength(0)
  })
})

function createService(cases: MutableCase[]) {
  const gateway = new InMemoryCaseGateway(cases)
  return {
    gateway,
    service: new CommandService({ authorizedTelegramUserId: CREATOR_ID, gateway }),
  }
}

function newCase(overrides: Partial<MutableCase> = {}): MutableCase {
  return {
    id: CASE_ID,
    state: 'needs_review',
    affectedLabels: ['Alex', 'Sam'],
    suggestedText: 'Suggested private outreach.',
    finalText: null,
    hasRecoveryEvidence: false,
    allowedActions: ['approve', 'edit', 'dismiss'],
    ...overrides,
  }
}

function toActionableCase(recoveryCase: MutableCase): ActionableCase {
  return {
    id: recoveryCase.id,
    state: recoveryCase.state,
    affectedLabels: recoveryCase.affectedLabels,
    allowedActions: allowedActions(recoveryCase),
  }
}

function allowedActions(recoveryCase: MutableCase): ResolvedCreatorCommand['action'][] {
  if (recoveryCase.state === 'needs_review') {
    return recoveryCase.finalText
      ? ['approve', 'edit', 'sent', 'dismiss']
      : ['approve', 'edit', 'dismiss']
  }
  if (recoveryCase.state === 'monitoring') return ['still_unresolved']
  if (recoveryCase.state === 'recovery_detected') {
    return ['confirm_recovery', 'not_recovered', 'still_unresolved']
  }
  return []
}

function toCaseAction(action: ResolvedCreatorCommand['action']): CaseAction {
  const actions: Record<ResolvedCreatorCommand['action'], CaseAction> = {
    approve: 'approve',
    edit: 'edit',
    sent: 'sent',
    dismiss: 'dismiss',
    confirm_recovery: 'confirm_recovery',
    not_recovered: 'reject_recovery',
    still_unresolved: 'mark_unresolved',
  }
  return actions[action]
}
