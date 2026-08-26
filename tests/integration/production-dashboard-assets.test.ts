import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { afterAll, expect, test } from 'vitest'
import { build } from 'vite'

const projectRoot = resolve(import.meta.dirname, '../..')
let outputDirectory = ''

afterAll(async () => {
  if (outputDirectory) await rm(outputDirectory, { recursive: true, force: true })
})

test('production dashboard references only emitted static assets', async () => {
  outputDirectory = await mkdtemp(join(tmpdir(), 'vibecheck-dashboard-'))
  await build({
    configFile: false,
    root: join(projectRoot, 'src/dashboard'),
    publicDir: join(projectRoot, 'video/out'),
    logLevel: 'silent',
    build: { outDir: outputDirectory, emptyOutDir: true },
  })

  const assetDirectory = join(outputDirectory, 'assets')
  const assetFiles = await readdir(assetDirectory)
  const javascriptFile = assetFiles.find((file) => file.endsWith('.js'))
  if (!javascriptFile) throw new Error('Production build did not emit a JavaScript bundle')

  const javascript = await readFile(join(assetDirectory, javascriptFile), 'utf8')
  const referencedAssets = [...javascript.matchAll(/["'](\/assets\/[^"']+)["']/g)]
    .map((match) => basename(match[0].slice(1, -1)))

  for (const referencedAsset of referencedAssets) {
    expect(assetFiles, `missing emitted asset: ${referencedAsset}`).toContain(referencedAsset)
  }
})
