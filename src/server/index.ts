import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'

import { ensureMindsAliases } from '../../scripts/configure-mind.js'
import type { TimingProfile } from '../domain/timing-profile.js'
import { buildApp } from './app.js'
import { loadConfig, type AppConfig } from './config.js'
import { createDatabase } from './db/database.js'
import { migrate } from './db/migrations.js'
import { CommunityContextRepository } from './db/repositories/community-context-repository.js'
import { CommunityStatusRepository } from './db/repositories/community-status-repository.js'
import { NotificationDeliveryRepository } from './db/repositories/notification-delivery-repository.js'
import { ObservationRepository } from './db/repositories/observation-repository.js'
import { ObservationWorkRepository } from './db/repositories/observation-work-repository.js'
import { ReasoningRunRepository } from './db/repositories/reasoning-run-repository.js'
import { createMindsAdapter } from './integrations/minds-adapter.js'
import { TelegramAdapter } from './integrations/telegram-adapter.js'
import { StructuredLogger } from './logger.js'
import { ServerRuntime } from './runtime.js'
import { CaseService } from './services/case-service.js'
import { CommandService } from './services/command-service.js'
import { DeadlineScheduler } from './services/deadline-scheduler.js'
import { NotificationService } from './services/notification-service.js'
import { ObservationWorker } from './services/observation-worker.js'
import { ReasoningService } from './services/reasoning-service.js'
import {
  CommunityObservationCoordinator,
  CreatorObservationCoordinator,
} from './services/runtime-coordinator.js'
import { TelegramWebhookReceiver } from './services/telegram-webhook-receiver.js'

interface CommunityBootstrapConfig {
  telegramChatRef: string
  engineAlias: string
  timingProfile: TimingProfile
}

export function ensureCommunity(
  database: DatabaseSync,
  config: CommunityBootstrapConfig,
): string {
  const existing = database
    .prepare('SELECT id FROM communities WHERE telegram_chat_ref = ?')
    .get(config.telegramChatRef) as { id: string } | undefined
  const id = existing?.id ?? randomUUID()
  database
    .prepare(
      `INSERT INTO communities
       (id, telegram_chat_ref, display_name, minds_source_alias, observation_status,
        timing_profile)
       VALUES (?, ?, 'VibeCheck Community', ?, 'learning', ?)
       ON CONFLICT(telegram_chat_ref) DO UPDATE SET
         minds_source_alias = excluded.minds_source_alias,
         timing_profile = excluded.timing_profile`,
    )
    .run(id, config.telegramChatRef, config.engineAlias, config.timingProfile)
  return id
}

export async function createApplicationRuntime(
  config: AppConfig,
  logger = new StructuredLogger(),
): Promise<ServerRuntime> {
  const database = createDatabase(config.databasePath)
  try {
    migrate(database)
    const minds = createMindsAdapter(config.mindsBuilderApiKey)
    await ensureMindsAliases(minds, {
      mindId: config.mindsMindId,
      engineAlias: config.mindsEngineAlias,
    })
    const communityId = ensureCommunity(database, {
      telegramChatRef: config.telegramCommunityChatId,
      engineAlias: config.mindsEngineAlias,
      timingProfile: config.timingProfile,
    })
    const observations = new ObservationRepository(database)
    const telegram = new TelegramAdapter({
      botToken: config.telegramBotToken,
      authorizedTelegramUserId: config.authorizedTelegramUserId,
      authorizedTelegramChatId: config.authorizedTelegramChatId,
    })
    const notifications = new NotificationService({
      repository: new NotificationDeliveryRepository(database),
      messenger: telegram,
    })
    const cases = new CaseService({ database, timingProfile: config.timingProfile })
    const reasoning = new ReasoningService({
      transport: minds,
      store: new ReasoningRunRepository(database),
      engineAlias: config.mindsEngineAlias,
    })
    const communityCoordinator = new CommunityObservationCoordinator({
      database,
      communityId,
      analysisBatch: () =>
        observations.listRecentCommunityEvidence(communityId, 50).map((observation) => ({
          id: observation.id,
          memberRefId: observation.memberRefId,
          senderType: 1,
          occurredAt: new Date(observation.occurredAt).toISOString(),
          evidenceExcerpt: observation.evidenceExcerpt,
        })),
      reasoning,
      cases,
      contexts: new CommunityContextRepository(database),
      notifications,
      recipientTelegramId: config.authorizedTelegramUserId,
      replyTimeoutMs: config.mindsReplyTimeoutMs,
    })
    const commands = new CommandService({
      authorizedTelegramUserId: config.authorizedTelegramUserId,
      gateway: cases,
    })
    const creatorCoordinator = new CreatorObservationCoordinator({
      observations,
      commands,
      messenger: telegram,
      authorizedTelegramUserId: config.authorizedTelegramUserId,
    })
    const webhook = new TelegramWebhookReceiver({
      observations,
      status: new CommunityStatusRepository(database),
      communityId,
      communityChatId: config.telegramCommunityChatId,
      authorizedCreatorUserId: config.authorizedTelegramUserId,
      authorizedCreatorChatId: config.authorizedTelegramChatId,
      memberHashKey: config.sessionSecret,
    })
    const observationWorker = new ObservationWorker({
      work: new ObservationWorkRepository(database),
      community: communityCoordinator,
      creator: creatorCoordinator,
      onError: (error, observationId) =>
        logger.error('observation_processing_failed', { error, observationId }),
    })
    const scheduler = new DeadlineScheduler({
      database,
      handlers: {
        onSilenceDue: async (deadline) => {
          logger.info('silence_deadline_due', { deadlineId: deadline.id })
        },
        onCoolingExpired: async (deadline) => {
          logger.info('cooling_deadline_completed', { deadlineId: deadline.id })
        },
        onUnresolvedDue: async (deadline) => {
          if (deadline.caseId) {
            await cases.expireCase(deadline.caseId, deadline.idempotencyKey)
          }
        },
      },
    })
    const staticRoot = resolve('dist')
    const app = buildApp({
      database,
      logger,
      dashboard: {
        telegramBotToken: config.telegramBotToken,
        telegramBotUsername: config.telegramBotUsername,
        authorizedTelegramUserId: config.authorizedTelegramUserId,
        nodeEnv: config.nodeEnv,
        communityId,
      },
      telegramWebhook: {
        secretToken: config.telegramWebhookSecret,
        receive: (update) => webhook.receive(update).then(() => undefined),
      },
      ...(existsSync(staticRoot) ? { staticRoot } : {}),
    })
    return new ServerRuntime({
      drainObservations: () => observationWorker.drain(),
      reconcileDeadlines: () => scheduler.reconcile(),
      drainNotifications: () => notifications.drain(),
      app,
      database,
      pollIntervalMs: 1_000,
      onBackgroundError: (error) => logger.error('background_task_failed', { error }),
    })
  } catch (error) {
    database.close()
    throw error
  }
}

async function main(): Promise<void> {
  const logger = new StructuredLogger()
  const config = loadConfig(process.env)
  const runtime = await createApplicationRuntime(config, logger)
  await runtime.start({ port: config.port, host: '0.0.0.0' })
  logger.info('server_started', { port: config.port })

  const stop = async (signal: NodeJS.Signals): Promise<void> => {
    logger.info('server_stopping', { signal })
    await runtime.stop()
  }
  const requestStop = (signal: NodeJS.Signals): void => {
    void stop(signal).catch((error: unknown) => {
      logger.error('server_stop_failed', { error, signal })
      process.exitCode = 1
    })
  }
  process.once('SIGINT', () => requestStop('SIGINT'))
  process.once('SIGTERM', () => requestStop('SIGTERM'))
}

const entrypoint = process.argv[1]
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  main().catch((error: unknown) => {
    const logger = new StructuredLogger()
    logger.error('server_start_failed', { error })
    process.exitCode = 1
  })
}
