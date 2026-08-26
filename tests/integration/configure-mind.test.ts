import { describe, expect, it, vi } from 'vitest'

import { ensureMindsAliases } from '../../scripts/configure-mind.js'

describe('Mind alias configuration', () => {
  it('ensures only the stable reasoning-engine alias against the configured Mind', async () => {
    const ensureAlias = vi.fn().mockResolvedValue({})

    await ensureMindsAliases(
      { ensureAlias },
      {
        mindId: '7b2a503e-f36b-1410-8465-00039ce7df11',
        engineAlias: 'vibecheck-engine',
      },
    )

    expect(ensureAlias.mock.calls).toEqual([
      ['vibecheck-engine', '7b2a503e-f36b-1410-8465-00039ce7df11'],
    ])
  })

  it('is idempotent when run repeatedly', async () => {
    const ensureAlias = vi.fn().mockResolvedValue({})

    await ensureMindsAliases(
      { ensureAlias },
      {
        mindId: '7b2a503e-f36b-1410-8465-00039ce7df11',
        engineAlias: 'vibecheck-engine',
      },
    )
    await ensureMindsAliases(
      { ensureAlias },
      {
        mindId: '7b2a503e-f36b-1410-8465-00039ce7df11',
        engineAlias: 'vibecheck-engine',
      },
    )

    expect(ensureAlias.mock.calls).toEqual([
      ['vibecheck-engine', '7b2a503e-f36b-1410-8465-00039ce7df11'],
      ['vibecheck-engine', '7b2a503e-f36b-1410-8465-00039ce7df11'],
    ])
  })
})
