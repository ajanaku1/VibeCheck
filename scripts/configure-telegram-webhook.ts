import { pathToFileURL } from 'node:url'

import { z } from 'zod'

import { loadConfig } from '../src/server/config.js'

interface TelegramWebhookSetupConfig {
  botToken: string
  appBaseUrl: string
  webhookSecret: string
}

type FetchProbe = (url: string, init: RequestInit) => Promise<Response>

const telegramSuccessSchema = z.object({ ok: z.literal(true), result: z.literal(true) })

export async function setTelegramWebhook(
  config: TelegramWebhookSetupConfig,
  fetchProbe: FetchProbe = fetch,
): Promise<void> {
  const webhookUrl = `${config.appBaseUrl.replace(/\/$/, '')}/api/telegram/webhook`
  const response = await fetchProbe(
    `https://api.telegram.org/bot${config.botToken}/setWebhook`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: config.webhookSecret,
        allowed_updates: ['message'],
        drop_pending_updates: false,
      }),
    },
  )
  if (!response.ok || !telegramSuccessSchema.safeParse(await response.json()).success) {
    throw new Error(`Telegram setWebhook failed with status ${response.status}`)
  }
}

async function main(): Promise<void> {
  const config = loadConfig(process.env)
  await setTelegramWebhook({
    botToken: config.telegramBotToken,
    appBaseUrl: config.appBaseUrl,
    webhookSecret: config.telegramWebhookSecret,
  })
  process.stdout.write('Telegram webhook is configured.\n')
}

const entrypoint = process.argv[1]
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown Telegram setup error'
    process.stderr.write(`Telegram webhook configuration failed: ${message}\n`)
    process.exitCode = 1
  })
}
