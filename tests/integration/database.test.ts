import type { DatabaseSync } from 'node:sqlite'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDatabase } from '../../src/server/db/database.js'
import { migrate } from '../../src/server/db/migrations.js'
import { CaseEventRepository } from '../../src/server/db/repositories/case-event-repository.js'
import { CommunityContextRepository } from '../../src/server/db/repositories/community-context-repository.js'
import { CreatorIdentityRepository } from '../../src/server/db/repositories/creator-identity-repository.js'
import { IngestionCursorRepository } from '../../src/server/db/repositories/ingestion-cursor-repository.js'
import { InterventionRepository } from '../../src/server/db/repositories/intervention-repository.js'
import { NotificationDeliveryRepository } from '../../src/server/db/repositories/notification-delivery-repository.js'
import { ObservationRepository } from '../../src/server/db/repositories/observation-repository.js'
import { ReasoningRunRepository } from '../../src/server/db/repositories/reasoning-run-repository.js'
import { RecoveryCaseRepository } from '../../src/server/db/repositories/recovery-case-repository.js'
import { SessionRepository } from '../../src/server/db/repositories/session-repository.js'

let database: DatabaseSync

beforeEach(() => {
  database = createDatabase(':memory:')
  migrate(database)
})

afterEach(() => {
  database.close()
})

function insertCommunity(): string {
  const id = crypto.randomUUID()
  database
    .prepare(
      `INSERT INTO communities
       (id, telegram_chat_ref, display_name, minds_source_alias, observation_status, timing_profile)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, 'group-ref', 'Staged Creators', 'community-source', 'learning', 'demo')
  return id
}

function insertCase(communityId: string, fractureKey = 'fracture-one'): string {
  const id = crypto.randomUUID()
  database
    .prepare(
      `INSERT INTO recovery_cases
       (id, community_id, fracture_key, trigger, state, confidence, uncertainty, opened_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      communityId,
      fractureKey,
      'escalating_conflict',
      'needs_review',
      0.82,
      'The exchange is staged but intent remains uncertain.',
      1_000,
      1_000,
      1,
    )
  return id
}

function insertCaseEvent(caseId: string): string {
  const id = crypto.randomUUID()
  database
    .prepare(
      `INSERT INTO case_events
       (id, case_id, idempotency_key, event_type, actor, provenance, summary, evidence_refs_json, from_state, to_state, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      caseId,
      'case-opened',
      'case_opened',
      'mind',
      'mind_inference',
      'A relationship fracture met the evidence gate.',
      '[]',
      null,
      'needs_review',
      1_000,
    )
  return id
}

describe('database invariants', () => {
  it('upgrades legacy observation sources without losing evidence', () => {
    database.close()
    database = createDatabase(':memory:')
    database.exec(`
      CREATE TABLE communities (
        id TEXT PRIMARY KEY, telegram_chat_ref TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL, minds_source_alias TEXT NOT NULL UNIQUE,
        observation_status TEXT NOT NULL, timing_profile TEXT NOT NULL,
        last_observed_at INTEGER, last_error TEXT
      ) STRICT;
      CREATE TABLE member_references (
        id TEXT PRIMARY KEY, community_id TEXT NOT NULL REFERENCES communities(id),
        external_ref_hash TEXT NOT NULL, display_label TEXT NOT NULL,
        first_seen_at INTEGER NOT NULL, last_active_at INTEGER NOT NULL,
        activity_count INTEGER NOT NULL DEFAULT 0,
        UNIQUE (community_id, external_ref_hash)
      ) STRICT;
      CREATE TABLE observations (
        id TEXT PRIMARY KEY, community_id TEXT NOT NULL REFERENCES communities(id),
        source TEXT NOT NULL CHECK (source IN ('minds_telegram_group', 'minds_creator_chat', 'scheduler')),
        source_fingerprint TEXT UNIQUE, session_ref TEXT NOT NULL,
        member_ref_id TEXT REFERENCES member_references(id), occurred_at INTEGER NOT NULL,
        ingested_at INTEGER NOT NULL, evidence_excerpt TEXT NOT NULL,
        content_digest TEXT NOT NULL, visibility TEXT NOT NULL
      ) STRICT;
      INSERT INTO communities VALUES
        ('community', '-100123', 'Community', 'vibecheck-engine', 'learning', 'demo', NULL, NULL);
      INSERT INTO observations VALUES
        ('legacy', 'community', 'minds_telegram_group', 'legacy-fingerprint', 'legacy', NULL,
         1000, 1001, 'Retained evidence', 'digest', 'internal');
    `)

    migrate(database)
    database
      .prepare(
        `INSERT INTO observations
         (id, community_id, source, source_fingerprint, session_ref, member_ref_id,
          occurred_at, ingested_at, evidence_excerpt, content_digest, visibility)
         VALUES ('webhook', 'community', 'telegram_webhook_group', 'webhook-fingerprint',
                 'telegram:-100123', NULL, 2000, 2001, 'New evidence', 'digest-2', 'internal')`,
      )
      .run()

    expect(
      database.prepare('SELECT id, source FROM observations ORDER BY occurred_at').all(),
    ).toEqual([
      { id: 'legacy', source: 'minds_telegram_group' },
      { id: 'webhook', source: 'telegram_webhook_group' },
    ])
  })

  it('enforces foreign keys', () => {
    const enabled = database.prepare('PRAGMA foreign_keys').get() as {
      foreign_keys: number
    }
    expect(enabled.foreign_keys).toBe(1)

    expect(() => insertCase(crypto.randomUUID())).toThrow(/FOREIGN KEY/)
  })

  it('deduplicates source observations by fingerprint', () => {
    const communityId = insertCommunity()
    const statement = database.prepare(
      `INSERT INTO observations
       (id, community_id, source, source_fingerprint, session_ref, occurred_at, ingested_at, evidence_excerpt, content_digest, visibility)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )

    const values = [
      communityId,
      'minds_telegram_group',
      'fingerprint-1',
      'session-1',
      1_000,
      1_001,
      'A bounded excerpt',
      'digest-1',
      'internal',
    ] as const
    statement.run(crypto.randomUUID(), ...values)

    expect(() => statement.run(crypto.randomUUID(), ...values)).toThrow(/UNIQUE/)
  })

  it('allows only one active case for a fracture key', () => {
    const communityId = insertCommunity()
    insertCase(communityId)

    expect(() => insertCase(communityId)).toThrow(/UNIQUE/)

    database
      .prepare('UPDATE recovery_cases SET state = ? WHERE fracture_key = ?')
      .run('resolved', 'fracture-one')
    expect(() => insertCase(communityId)).not.toThrow()
  })

  it('prevents case events from being updated or deleted', () => {
    const caseId = insertCase(insertCommunity())
    const eventId = insertCaseEvent(caseId)

    expect(() =>
      database.prepare('UPDATE case_events SET summary = ? WHERE id = ?').run('Changed', eventId),
    ).toThrow(/append-only/)
    expect(() =>
      database.prepare('DELETE FROM case_events WHERE id = ?').run(eventId),
    ).toThrow(/append-only/)
  })

  it('deduplicates semantic notification deliveries', () => {
    const eventId = insertCaseEvent(insertCase(insertCommunity()))
    const statement = database.prepare(
      `INSERT INTO notification_deliveries
       (id, case_event_id, kind, recipient_telegram_id, payload_digest, status, attempt_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    const values = [
      eventId,
      'initial_alert',
      '123456789',
      'payload-digest',
      'pending',
      0,
    ] as const

    statement.run(crypto.randomUUID(), ...values)
    expect(() => statement.run(crypto.randomUUID(), ...values)).toThrow(/UNIQUE/)
  })

  it('commits an observation and its cursor atomically', () => {
    const communityId = insertCommunity()
    const observations = new ObservationRepository(database)
    const cursors = new IngestionCursorRepository(database)
    const observation = {
      id: crypto.randomUUID(),
      communityId,
      source: 'minds_telegram_group' as const,
      sourceFingerprint: 'source-fingerprint-1',
      sessionRef: 'session-one',
      memberRefId: null,
      occurredAt: 1_000,
      ingestedAt: 1_001,
      evidenceExcerpt: 'A bounded human message.',
      contentDigest: 'content-digest-1',
      visibility: 'internal' as const,
    }

    expect(
      observations.appendWithCursor(observation, {
        alias: 'community-source',
        lastFingerprint: 'source-fingerprint-1',
        updatedAt: 1_001,
      }),
    ).toBe('inserted')
    expect(cursors.findByAlias('community-source')).toEqual({
      alias: 'community-source',
      lastFingerprint: 'source-fingerprint-1',
      updatedAt: 1_001,
    })

    expect(
      observations.appendWithCursor(
        { ...observation, id: crypto.randomUUID() },
        {
          alias: 'community-source',
          lastFingerprint: 'should-not-advance',
          updatedAt: 2_000,
        },
      ),
    ).toBe('duplicate')
    expect(cursors.findByAlias('community-source')?.lastFingerprint).toBe(
      'source-fingerprint-1',
    )
  })

  it('rolls back the cursor when its observation is invalid', () => {
    const observations = new ObservationRepository(database)
    const communityId = insertCommunity()

    expect(() =>
      observations.appendWithCursor(
        {
          id: crypto.randomUUID(),
          communityId,
          source: 'minds_telegram_group',
          sourceFingerprint: 'invalid-observation',
          sessionRef: 'session-one',
          memberRefId: null,
          occurredAt: 1_000,
          ingestedAt: 1_001,
          evidenceExcerpt: 'x'.repeat(501),
          contentDigest: 'content-digest-invalid',
          visibility: 'internal',
        },
        {
          alias: 'community-source',
          lastFingerprint: 'invalid-observation',
          updatedAt: 1_001,
        },
      ),
    ).toThrow()
    expect(
      new IngestionCursorRepository(database).findByAlias('community-source'),
    ).toBeNull()
  })

  it('stores creator identity and resolves only active authorized sessions', () => {
    const identities = new CreatorIdentityRepository(database)
    const sessions = new SessionRepository(database)
    identities.upsert({
      telegramUserId: '123456789',
      displayName: 'Ada',
      username: 'ada',
      photoUrl: null,
      lastAuthenticatedAt: 1_000,
    })
    sessions.create({
      id: crypto.randomUUID(),
      tokenHash: 'session-hash',
      telegramUserId: '123456789',
      createdAt: 1_000,
      expiresAt: 2_000,
    })

    expect(
      sessions.findActive('session-hash', '123456789', 1_500)?.telegramUserId,
    ).toBe('123456789')
    expect(sessions.findActive('session-hash', '987654321', 1_500)).toBeNull()
    sessions.revoke('session-hash', 1_600)
    expect(sessions.findActive('session-hash', '123456789', 1_700)).toBeNull()
  })

  it('stores evidence-backed context and reasoning outcomes', () => {
    const communityId = insertCommunity()
    const observations = new ObservationRepository(database)
    const observationId = crypto.randomUUID()
    observations.appendWithCursor(
      {
        id: observationId,
        communityId,
        source: 'minds_telegram_group',
        sourceFingerprint: 'context-evidence',
        sessionRef: 'session-one',
        memberRefId: null,
        occurredAt: 1_000,
        ingestedAt: 1_001,
        evidenceExcerpt: 'Members repair disagreements by restating shared intent.',
        contentDigest: 'context-digest',
        visibility: 'case_evidence',
      },
      { alias: 'community-source', lastFingerprint: 'context-evidence', updatedAt: 1_001 },
    )

    const contexts = new CommunityContextRepository(database)
    contexts.create({
      id: crypto.randomUUID(),
      communityId,
      kind: 'norm',
      statement: 'Members restate shared intent during disagreements.',
      memberRefs: [],
      evidenceObservationIds: [observationId],
      confidence: 0.8,
      status: 'active',
      createdAt: 1_100,
      supersededAt: null,
    })
    expect(contexts.listActive(communityId)).toHaveLength(1)

    const reasoning = new ReasoningRunRepository(database)
    const reasoningId = crypto.randomUUID()
    reasoning.create({
      id: reasoningId,
      inputDigest: 'reasoning-digest',
      analysisKind: 'baseline',
      engineAlias: 'vibecheck-engine',
      inputObservationIds: [observationId],
      startedAt: 1_200,
    })
    reasoning.complete(reasoningId, {
      status: 'failed',
      response: null,
      errorCode: 'mind_unavailable',
      completedAt: 1_300,
    })
    expect(reasoning.findByInputDigest('reasoning-digest')).toMatchObject({
      status: 'failed',
      errorCode: 'mind_unavailable',
    })
  })

  it('rejects context evidence from another community', () => {
    const evidenceCommunityId = insertCommunity()
    const targetCommunityId = crypto.randomUUID()
    database
      .prepare(
        `INSERT INTO communities
         (id, telegram_chat_ref, display_name, minds_source_alias, observation_status, timing_profile)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        targetCommunityId,
        'other-group-ref',
        'Other Staged Community',
        'other-community-source',
        'learning',
        'demo',
      )
    const observationId = crypto.randomUUID()
    new ObservationRepository(database).appendWithCursor(
      {
        id: observationId,
        communityId: evidenceCommunityId,
        source: 'minds_telegram_group',
        sourceFingerprint: 'cross-community-evidence',
        sessionRef: 'session-one',
        memberRefId: null,
        occurredAt: 1_000,
        ingestedAt: 1_001,
        evidenceExcerpt: 'Evidence from a different community.',
        contentDigest: 'cross-community-digest',
        visibility: 'internal',
      },
      {
        alias: 'community-source',
        lastFingerprint: 'cross-community-evidence',
        updatedAt: 1_001,
      },
    )

    expect(() =>
      new CommunityContextRepository(database).create({
        id: crypto.randomUUID(),
        communityId: targetCommunityId,
        kind: 'norm',
        statement: 'This must not borrow evidence from another community.',
        memberRefs: [],
        evidenceObservationIds: [observationId],
        confidence: 0.7,
        status: 'active',
        createdAt: 1_100,
        supersededAt: null,
      }),
    ).toThrow(/community/i)
  })

  it('rejects unresolved reasoning input references', () => {
    expect(() =>
      new ReasoningRunRepository(database).create({
        id: crypto.randomUUID(),
        inputDigest: 'unknown-evidence-digest',
        analysisKind: 'fracture',
        engineAlias: 'vibecheck-engine',
        inputObservationIds: [crypto.randomUUID()],
        startedAt: 1_000,
      }),
    ).toThrow(/observation/i)
  })

  it('allows repository case creation only in the initial state', () => {
    const cases = new RecoveryCaseRepository(database)
    expect(() =>
      cases.create({
        id: crypto.randomUUID(),
        communityId: insertCommunity(),
        fractureKey: 'invalid-initial-state',
        trigger: 'escalating_conflict',
        state: 'monitoring',
        confidence: 0.8,
        uncertainty: 'This row bypassed the initial state.',
        openedAt: 1_000,
        updatedAt: 1_000,
        monitoringStartedAt: 1_000,
        resolutionDueAt: 2_000,
        dismissedUntil: null,
        outcomeSummary: null,
        version: 1,
      }),
    ).toThrow(/needs_review/i)
  })

  it('rejects case events with unknown evidence references', () => {
    const caseId = insertCase(insertCommunity())
    expect(() =>
      new CaseEventRepository(database).append({
        id: crypto.randomUUID(),
        caseId,
        idempotencyKey: 'unknown-evidence-event',
        eventType: 'evidence_appended',
        actor: 'mind',
        provenance: 'mind_inference',
        summary: 'This event cites evidence that does not exist.',
        evidenceRefs: [crypto.randomUUID()],
        fromState: 'needs_review',
        toState: 'needs_review',
        occurredAt: 1_100,
      }),
    ).toThrow(/evidence/i)
  })

  it('stores a case timeline, intervention, and one semantic delivery', () => {
    const communityId = insertCommunity()
    const cases = new RecoveryCaseRepository(database)
    const caseId = crypto.randomUUID()
    cases.create({
      id: caseId,
      communityId,
      fractureKey: 'repository-fracture',
      trigger: 'escalating_conflict',
      state: 'needs_review',
      confidence: 0.82,
      uncertainty: 'Intent remains uncertain.',
      openedAt: 1_000,
      updatedAt: 1_000,
      monitoringStartedAt: null,
      resolutionDueAt: null,
      dismissedUntil: null,
      outcomeSummary: null,
      version: 1,
    })
    expect(cases.findById(caseId)?.state).toBe('needs_review')

    const events = new CaseEventRepository(database)
    const eventId = crypto.randomUUID()
    events.append({
      id: eventId,
      caseId,
      idempotencyKey: 'repository-case-opened',
      eventType: 'case_opened',
      actor: 'mind',
      provenance: 'mind_inference',
      summary: 'The verified evidence gate opened a recovery case.',
      evidenceRefs: [],
      fromState: null,
      toState: 'needs_review',
      occurredAt: 1_000,
    })
    expect(events.listForCase(caseId)).toHaveLength(1)

    const interventions = new InterventionRepository(database)
    interventions.create({
      id: crypto.randomUUID(),
      caseId,
      suggestedText: 'Ask privately how the exchange landed.',
    })
    interventions.finalize(caseId, 'edit', 'Check in privately and listen first.', 1_100)
    expect(interventions.findByCaseId(caseId)?.finalizedBy).toBe('edit')

    const deliveries = new NotificationDeliveryRepository(database)
    expect(
      deliveries.enqueue({
        id: crypto.randomUUID(),
        caseEventId: eventId,
        kind: 'initial_alert',
        recipientTelegramId: '123456789',
        payloadDigest: 'payload-digest',
      }),
    ).toBe('inserted')
    expect(
      deliveries.enqueue({
        id: crypto.randomUUID(),
        caseEventId: eventId,
        kind: 'initial_alert',
        recipientTelegramId: '123456789',
        payloadDigest: 'payload-digest',
      }),
    ).toBe('duplicate')
  })
})
