import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import {
  runCanonicalRehearsal,
  type RehearsalResult,
} from './rehearse-demo.js'

export async function seedCanonicalDatabase(databasePath: string): Promise<RehearsalResult> {
  if (existsSync(databasePath)) {
    throw new Error(`Refusing to overwrite existing database: ${databasePath}`)
  }
  return runCanonicalRehearsal(databasePath)
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1]
  return entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href
}

if (isDirectExecution()) {
  const databasePath = process.argv[2]
  if (!databasePath) {
    process.stderr.write('Usage: npm run demo:seed -- <database-path>\n')
    process.exitCode = 1
  } else {
    seedCanonicalDatabase(databasePath)
      .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unknown seed failure'
        process.stderr.write(`Canonical seed failed: ${message}\n`)
        process.exitCode = 1
      })
  }
}
