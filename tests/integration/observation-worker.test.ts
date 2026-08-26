import type { DatabaseSync } from 'node:sqlite'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDatabase } from '../../src/server/db/database.js'
import { migrate } from '../../src/server/db/migrations.js'
import { ObservationRepository } from '../../src/server/db/repositories/observation-repository.js'
import { ObservationWorkRepository } from '../../src/server/db/repositories/observation-work-repository.js'
import { ObservationWorker } from '../../src/server/services/observation-worker.js'

const COMMUNITY_ID = '11111111-1111-4111-8111-111111111111'
const NOW = Date.parse('2026-08-19T12:00:00.000Z')

describe('ObservationWorker', () => {
  let database: DatabaseSync
  let observations: ObservationRepository

  beforeEach(() => {
    database = createDatabase(':memory:')
    migrate(database)
    database
      .prepare(
        `INSERT INTO communities
         (id, telegram_chat_ref, display_name, minds_source_alias, observation_status,
          timing_profile)
         VALUES (?, '-100123', 'Staged Creators', 'vibecheck-engine', 'learning', 'demo')`,
      )
      .run(COMMUNITY_ID)
    observations = new ObservationRepository(database)
  })

  afterEach(() => database.close())

  it('dispatches each persisted kind and marks the durable work complete', async () => {
    observations.appendWithWork(observation('group-observation', 'telegram_webhook_group'), 'community')
    observations.appendWithWork(observation('creator-observation', 'telegram_webhook_creator'), 'creator')
    const community = { handle: vi.fn().mockResolvedValue(undefined) }
    const creator = { handle: vi.fn().mockResolvedValue(undefined) }
    const worker = new ObservationWorker({
      work: new ObservationWorkRepository(database),
      community,
      creator,
      now: () => NOW,
    })

    await expect(worker.drain()).resolves.toEqual({ completed: 2, failed: 0 })

    expect(community.handle).toHaveBeenCalledWith('group-observation')
    expect(creator.handle).toHaveBeenCalledWith('creator-observation')
    expect(database.prepare("SELECT COUNT(*) AS count FROM observation_jobs WHERE status = 'completed'").get())
      .toEqual({ count: 2 })
  })

  it('requeues failed work with a bounded delay and error code', async () => {
    observations.appendWithWork(observation('group-observation', 'telegram_webhook_group'), 'community')
    const onError = vi.fn()
    const worker = new ObservationWorker({
      work: new ObservationWorkRepository(database),
      community: { handle: vi.fn().mockRejectedValue(new Error('Minds unavailable')) },
      creator: { handle: vi.fn() },
      now: () => NOW,
      onError,
    })

    await expect(worker.drain()).resolves.toEqual({ completed: 0, failed: 1 })

    expect(database.prepare('SELECT status, attempt_count, available_at, last_error_code FROM observation_jobs').get())
      .toEqual({
        status: 'pending',
        attempt_count: 1,
        available_at: NOW + 1_000,
        last_error_code: 'observation_processing_failed',
      })
    expect(onError).toHaveBeenCalledOnce()
  })

  it('reclaims a stale processing claim after a process restart', async () => {
    observations.appendWithWork(observation('group-observation', 'telegram_webhook_group'), 'community')
    const work = new ObservationWorkRepository(database)
    expect(work.claimNext(NOW)).toMatchObject({ observationId: 'group-observation' })
    const community = { handle: vi.fn().mockResolvedValue(undefined) }
    const worker = new ObservationWorker({
      work,
      community,
      creator: { handle: vi.fn() },
      now: () => NOW + 300_001,
    })

    await expect(worker.drain()).resolves.toEqual({ completed: 1, failed: 0 })

    expect(community.handle).toHaveBeenCalledWith('group-observation')
    expect(
      database.prepare('SELECT status, attempt_count FROM observation_jobs').get(),
    ).toEqual({ status: 'completed', attempt_count: 2 })
  })
})

function observation(
  id: string,
  source: 'telegram_webhook_group' | 'telegram_webhook_creator',
) {
  return {
    id,
    communityId: COMMUNITY_ID,
    source,
    sourceFingerprint: id,
    sessionRef: 'telegram:test',
    memberRefId: null,
    occurredAt: NOW,
    ingestedAt: NOW,
    evidenceExcerpt: 'test',
    contentDigest: id,
    visibility: 'internal' as const,
  }
}
