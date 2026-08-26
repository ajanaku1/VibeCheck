import { pathToFileURL } from 'node:url'

import { createMindsClient } from '@animocabrands/minds-client-lib'

import { loadLiveProbeConfig } from '../src/server/config.js'
import {
  runLivePrerequisiteProbe,
  TelegramIntegrationProbe,
} from '../src/server/live-probe.js'

export async function main(): Promise<void> {
  const config = loadLiveProbeConfig(process.env)
  const minds = createMindsClient({ builderApiKey: config.mindsBuilderApiKey })
  const telegram = new TelegramIntegrationProbe({
    botToken: config.telegramBotToken,
    communityChatId: config.telegramCommunityChatId,
    authorizedUserId: config.authorizedTelegramUserId,
    authorizedChatId: config.authorizedTelegramChatId,
  })

  process.stdout.write('Checking the app-owned Telegram webhook and stable Minds engine.\n')
  const result = await runLivePrerequisiteProbe(
    {
      engineAlias: config.mindsEngineAlias,
      expectedWebhookUrl: `${config.appBaseUrl}/api/telegram/webhook`,
    },
    minds,
    telegram,
  )
  process.stdout.write(`${JSON.stringify({ status: 'passed', ...result })}\n`)
}

function isDirectExecution(): boolean {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href
}

if (isDirectExecution()) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown live probe failure'
    process.stderr.write(`Live prerequisite probe failed: ${message}\n`)
    process.exitCode = 1
  })
}
