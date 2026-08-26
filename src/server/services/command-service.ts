import { InvalidTransitionError, type CaseState } from '../../domain/case-state.js'

export type CreatorAction =
  | 'approve'
  | 'edit'
  | 'sent'
  | 'dismiss'
  | 'confirm_recovery'
  | 'not_recovered'
  | 'still_unresolved'

export interface ActionableCase {
  id: string
  state: CaseState
  affectedLabels: string[]
  allowedActions: CreatorAction[]
}

export type ResolvedCreatorCommand =
  | { action: 'edit'; caseId: string; replacement: string }
  | { action: Exclude<CreatorAction, 'edit'>; caseId: string }

export interface CreatorActionGateway {
  listCases(): Promise<ActionableCase[]>
  execute(command: ResolvedCreatorCommand): Promise<{
    state: CaseState
    finalText?: string
  }>
  recordRejectedCommand?(rejection: RejectedCreatorCommand): Promise<void>
}

export interface RejectedCreatorCommand {
  code: 'invalid_state' | 'ambiguous_case'
  caseIds: string[]
}

interface CommandServiceDependencies {
  authorizedTelegramUserId: string
  gateway: CreatorActionGateway
}

export interface CreatorCommandInput {
  senderTelegramUserId: string
  text: string
}

interface AppliedCommandResult {
  status: 'applied'
  caseId: string
  state: CaseState
  finalText?: string
}

interface HelpCase {
  shortId: string
  state: CaseState
  affectedLabels: string[]
}

interface CommandHelpResult {
  status: 'help'
  code:
    | 'forbidden'
    | 'unsupported_command'
    | 'invalid_edit'
    | 'case_not_found'
    | 'ambiguous_case'
    | 'invalid_state'
  message: string
  cases?: HelpCase[]
}

export type CreatorCommandResult = AppliedCommandResult | CommandHelpResult

type ParsedCommand =
  | { action: 'edit'; caseRef?: string; replacement: string }
  | { action: Exclude<CreatorAction, 'edit'>; caseRef?: string }

export class CommandService {
  constructor(private readonly dependencies: CommandServiceDependencies) {}

  async handle(input: CreatorCommandInput): Promise<CreatorCommandResult> {
    if (input.senderTelegramUserId !== this.dependencies.authorizedTelegramUserId) {
      return help('forbidden', 'This private workflow is available only to the configured creator.')
    }

    const parsed = parseCommand(input.text)
    if ('result' in parsed) return parsed.result
    const cases = await this.dependencies.gateway.listCases()
    const selected = selectCase(cases, parsed.command)
    if ('result' in selected) {
      await this.recordRejectedCommand(selected.result, selected.caseIds)
      return selected.result
    }

    return this.execute(parsed.command, selected.recoveryCase)
  }

  private async execute(
    parsed: ParsedCommand,
    recoveryCase: ActionableCase,
  ): Promise<CreatorCommandResult> {
    const command = resolveCommand(parsed, recoveryCase.id)
    try {
      const outcome = await this.dependencies.gateway.execute(command)
      return {
        status: 'applied',
        caseId: command.caseId,
        state: outcome.state,
        ...(outcome.finalText ? { finalText: outcome.finalText } : {}),
      }
    } catch (error) {
      if (error instanceof InvalidTransitionError) {
        return invalidState(recoveryCase, parsed.action)
      }
      throw error
    }
  }

  private async recordRejectedCommand(
    result: CommandHelpResult,
    caseIds: string[],
  ): Promise<void> {
    if (caseIds.length === 0 || !isRecordableRejection(result.code)) return
    await this.dependencies.gateway.recordRejectedCommand?.({ code: result.code, caseIds })
  }
}

function parseCommand(
  text: string,
): { command: ParsedCommand } | { result: CommandHelpResult } {
  const normalized = text.trim()
  const edit = /^edit(?:\s+([^:\s]+))?\s*:\s*(.*)$/is.exec(normalized)
  if (edit) {
    const replacement = edit[2]?.trim() ?? ''
    if (replacement.length < 1 || replacement.length > 2_000) {
      return { result: help('invalid_edit', 'Edited outreach must be 1–2,000 characters.') }
    }
    return {
      command: { action: 'edit', caseRef: edit[1], replacement },
    }
  }
  if (/^edit\b/i.test(normalized)) {
    return { result: help('invalid_edit', 'Use Edit <case-id>: <replacement outreach>.') }
  }

  const simple = parseSimpleCommand(normalized)
  if (simple) return { command: simple }
  return {
    result: help(
      'unsupported_command',
      'Use Approve, Edit, Sent, Dismiss, Confirm recovery, Not recovered, or Still unresolved.',
    ),
  }
}

function parseSimpleCommand(text: string): ParsedCommand | null {
  const patterns: Array<[RegExp, Exclude<CreatorAction, 'edit'>]> = [
    [/^confirm\s+recovery(?:\s+(\S+))?$/i, 'confirm_recovery'],
    [/^not\s+recovered(?:\s+(\S+))?$/i, 'not_recovered'],
    [/^still\s+unresolved(?:\s+(\S+))?$/i, 'still_unresolved'],
    [/^approve(?:\s+(\S+))?$/i, 'approve'],
    [/^sent(?:\s+(\S+))?$/i, 'sent'],
    [/^dismiss(?:\s+(\S+))?$/i, 'dismiss'],
  ]
  for (const [pattern, action] of patterns) {
    const match = pattern.exec(text)
    if (match) return { action, caseRef: match[1] }
  }
  return null
}

function selectCase(
  cases: ActionableCase[],
  command: ParsedCommand,
): { recoveryCase: ActionableCase } | { result: CommandHelpResult; caseIds: string[] } {
  if (command.caseRef) return selectReferencedCase(cases, command, command.caseRef)
  const eligible = cases.filter(({ allowedActions }) => allowedActions.includes(command.action))
  if (eligible.length === 1) return { recoveryCase: eligible[0]! }
  if (eligible.length === 0) {
    return {
      result: help('invalid_state', `No current case can use ${actionLabel(command.action)}.`),
      caseIds: [],
    }
  }
  return {
    result: help(
      'ambiguous_case',
      `More than one case can use ${actionLabel(command.action)}. Include a case ID.`,
      eligible,
    ),
    caseIds: eligible.map(({ id }) => id),
  }
}

function selectReferencedCase(
  cases: ActionableCase[],
  command: ParsedCommand,
  caseRef: string,
): { recoveryCase: ActionableCase } | { result: CommandHelpResult; caseIds: string[] } {
  const normalizedRef = caseRef.toLowerCase()
  const matches = cases.filter(({ id }) => id.toLowerCase().startsWith(normalizedRef))
  if (matches.length === 0) {
    return { result: help('case_not_found', 'No recovery case matches that ID.'), caseIds: [] }
  }
  if (matches.length > 1) {
    return {
      result: help('ambiguous_case', 'That case ID matches more than one case.', matches),
      caseIds: matches.map(({ id }) => id),
    }
  }
  const recoveryCase = matches[0]!
  if (!recoveryCase.allowedActions.includes(command.action)) {
    return { result: invalidState(recoveryCase, command.action), caseIds: [recoveryCase.id] }
  }
  return { recoveryCase }
}

function isRecordableRejection(
  code: CommandHelpResult['code'],
): code is RejectedCreatorCommand['code'] {
  return code === 'invalid_state' || code === 'ambiguous_case'
}

function resolveCommand(command: ParsedCommand, caseId: string): ResolvedCreatorCommand {
  if (command.action === 'edit') {
    return { action: 'edit', caseId, replacement: command.replacement }
  }
  return { action: command.action, caseId }
}

function invalidState(recoveryCase: ActionableCase, action: CreatorAction): CommandHelpResult {
  const allowed = recoveryCase.allowedActions.map(actionLabel).join(', ') || 'no further actions'
  return help(
    'invalid_state',
    `${actionLabel(action)} is not allowed while case ${shortId(recoveryCase.id)} is ${recoveryCase.state}. Allowed: ${allowed}.`,
    [recoveryCase],
  )
}

function help(
  code: CommandHelpResult['code'],
  message: string,
  cases?: ActionableCase[],
): CommandHelpResult {
  return {
    status: 'help',
    code,
    message,
    ...(cases ? { cases: cases.map(toHelpCase) } : {}),
  }
}

function toHelpCase(recoveryCase: ActionableCase): HelpCase {
  return {
    shortId: shortId(recoveryCase.id),
    state: recoveryCase.state,
    affectedLabels: recoveryCase.affectedLabels,
  }
}

function shortId(id: string): string {
  return id.slice(0, 8)
}

function actionLabel(action: CreatorAction): string {
  const labels: Record<CreatorAction, string> = {
    approve: 'Approve',
    edit: 'Edit',
    sent: 'Sent',
    dismiss: 'Dismiss',
    confirm_recovery: 'Confirm recovery',
    not_recovered: 'Not recovered',
    still_unresolved: 'Still unresolved',
  }
  return labels[action]
}
