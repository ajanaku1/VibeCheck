import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

interface VercelConfig {
  framework: string
  buildCommand: string
  outputDirectory: string
  rewrites: Array<{ source: string; destination: string }>
}

describe('frontend deployment contract', () => {
  it('deploys the Vite dashboard on Vercel and proxies API requests to Render', async () => {
    const config = JSON.parse(await readFile('vercel.json', 'utf8')) as VercelConfig
    const viteConfig = await readFile('vite.config.ts', 'utf8')

    expect(config).toMatchObject({
      framework: 'vite',
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
    })
    expect(config.rewrites).toEqual([
      {
        source: '/api/:path*',
        destination: 'https://vibecheck-recovery.onrender.com/api/:path*',
      },
      { source: '/:path*', destination: '/index.html' },
    ])
    expect(viteConfig).toContain('publicDir: false')
    expect(viteConfig).not.toContain('video/out')
  })
})
