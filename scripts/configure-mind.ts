import { pathToFileURL } from 'node:url'

import { loadConfig } from '../src/server/config.js'
import { createMindsAdapter } from '../src/server/integrations/minds-adapter.js'

interface AliasConfigurator {
  ensureAlias(alias: string, mindId: string): Promise<unknown>
}

export interface MindsAliasConfig {
  mindId: string
  engineAlias: string
}

export async function ensureMindsAliases(
  configurator: AliasConfigurator,
  config: MindsAliasConfig,
): Promise<void> {
  await configurator.ensureAlias(config.engineAlias, config.mindId)
}

async function main(): Promise<void> {
  const config = loadConfig(process.env)
  const adapter = createMindsAdapter(config.mindsBuilderApiKey)
  await ensureMindsAliases(adapter, {
    mindId: config.mindsMindId,
    engineAlias: config.mindsEngineAlias,
  })
  process.stdout.write('Minds aliases are configured.\n')
}

const entrypoint = process.argv[1]
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown configuration error'
    process.stderr.write(`Mind configuration failed: ${message}\n`)
    process.exitCode = 1
  })
}
