import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

interface RenderService {
  type: string
  name: string
  runtime: string
  plan: string
  buildCommand: string
  startCommand: string
  healthCheckPath: string
  disk?: { mountPath: string; sizeGB: number }
  envVars: Array<{ key: string; value?: string; sync?: boolean; generateValue?: boolean }>
}

describe('production deployment contract', () => {
  it('defines a free Render demo service with fail-closed secrets', async () => {
    const packageManifest = JSON.parse(await readFile('package.json', 'utf8')) as {
      engines?: { node?: string }
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const blueprint = parse(await readFile('infra/render.yaml', 'utf8')) as { services: RenderService[] }
    const service = blueprint.services[0]
    if (!service) throw new Error('Render Blueprint must define one service')
    const variables = new Map(service.envVars.map((entry) => [entry.key, entry]))

    expect(service).toMatchObject({
      type: 'web',
      name: 'vibecheck-recovery',
      runtime: 'node',
      plan: 'free',
      buildCommand: 'npm ci --include=dev && npm run build',
      startCommand: 'npm run start',
      healthCheckPath: '/api/health',
    })
    expect(service.disk).toBeUndefined()
    expect(variables.get('DATABASE_PATH')).toEqual({
      key: 'DATABASE_PATH',
      value: '/opt/render/project/src/data/vibecheck.sqlite',
    })
    expect(variables.get('SESSION_SECRET')).toEqual({ key: 'SESSION_SECRET', generateValue: true })
    expect(variables.get('TELEGRAM_WEBHOOK_SECRET')).toEqual({ key: 'TELEGRAM_WEBHOOK_SECRET', generateValue: true })
    for (const secret of ['APP_BASE_URL', 'TELEGRAM_BOT_TOKEN', 'MINDS_BUILDER_API_KEY', 'MINDS_MIND_ID']) {
      expect(variables.get(secret)).toEqual({ key: secret, sync: false })
    }
    expect(packageManifest.engines?.node).toBe('>=22.13.0')
    expect(packageManifest.dependencies).toMatchObject({
      tsx: expect.any(String),
      vite: expect.any(String),
    })
    expect(packageManifest.devDependencies?.tsx).toBeUndefined()
    expect(packageManifest.devDependencies?.vite).toBeUndefined()
    expect(packageManifest.scripts?.['verify:live-demo']).toBe(
      'node --env-file-if-exists=.env --import tsx scripts/verify-live-demo.ts',
    )
  })
})
