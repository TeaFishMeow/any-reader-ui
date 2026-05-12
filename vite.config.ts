import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, relative } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const DEFAULT_VAULT_DIR = resolve(process.cwd(), '微积分二层次下')
const VAULT_ROUTE_PREFIX = '/vault/'
const VAULT_MANIFEST_ROUTE = '/vault-manifest.json'

interface VaultManifestDocument {
  path: string
  title: string
  parentPath: string | null
  order: number
  level: number
  contentMd: string
  contentVersion: string
  contentPlainText: string
}

interface VaultManifest {
  vaultName: string
  vaultDir: string
  generatedAt: string
  documents: VaultManifestDocument[]
  folderPaths: string[]
}

interface SafeVaultFile {
  absolutePath: string
  mimeType: string
}

const IGNORED_FOLDER_NAMES = new Set([
  '.git',
  '.github',
  '.codex-tmp',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'tmp',
  'temp',
  'attachments'
])

function normalizeVaultRelativePath(input: string) {
  return input.replace(/\\/g, '/').replace(/^\/+/, '')
}

function stripMarkdownExtension(path: string) {
  return path.replace(/\.md$/i, '')
}

function basenameFromPath(path: string) {
  const segments = normalizeVaultRelativePath(path).split('/').filter(Boolean)
  return segments.at(-1) ?? ''
}

function dirnameFromPath(path: string) {
  const segments = normalizeVaultRelativePath(path).split('/').filter(Boolean)
  segments.pop()
  return segments.join('/') || null
}

function guessMimeType(path: string) {
  const lower = path.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.bmp')) return 'image/bmp'
  if (lower.endsWith('.avif')) return 'image/avif'
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8'
  if (lower.endsWith('.css')) return 'text/css; charset=utf-8'
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'text/javascript; charset=utf-8'
  if (lower.endsWith('.html')) return 'text/html; charset=utf-8'
  if (lower.endsWith('.md')) return 'text/markdown; charset=utf-8'
  return 'application/octet-stream'
}

function safeResolveVaultFile(vaultDir: string, requestPath: string): SafeVaultFile | null {
  const normalized = normalizeVaultRelativePath(requestPath)
  if (!normalized || normalized.includes('..')) {
    return null
  }

  const absolutePath = resolve(vaultDir, normalized)
  const relativeToVault = relative(vaultDir, absolutePath)
  if (relativeToVault.startsWith('..') || relativeToVault === '' && normalized === '') {
    return null
  }

  return {
    absolutePath,
    mimeType: guessMimeType(absolutePath)
  }
}

async function readVaultDocuments(vaultDir: string): Promise<VaultManifest> {
  const documents: VaultManifestDocument[] = []
  const folderPaths = new Set<string>()

  async function walk(relativeDir: string) {
    const absoluteDir = resolve(vaultDir, relativeDir)
    const entries = await readdir(absoluteDir, { withFileTypes: true })
    entries.sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) {
        return left.isDirectory() ? -1 : 1
      }
      return left.name.localeCompare(right.name, 'zh-Hans-CN')
    })

    let documentOrder = 0
    for (const entry of entries) {
      const nextRelative = normalizeVaultRelativePath(join(relativeDir, entry.name))
      if (entry.isDirectory()) {
        if (IGNORED_FOLDER_NAMES.has(entry.name.toLowerCase()) || entry.name.startsWith('.')) {
          continue
        }

        folderPaths.add(nextRelative)
        await walk(nextRelative)
        continue
      }

      if (!entry.name.toLowerCase().endsWith('.md')) {
        continue
      }

      const absolutePath = resolve(vaultDir, nextRelative)
      const contentMd = await readFile(absolutePath, 'utf8')
      documents.push({
        path: nextRelative,
        title: basenameFromPath(stripMarkdownExtension(nextRelative)),
        parentPath: dirnameFromPath(nextRelative),
        order: documentOrder++,
        level: nextRelative.split('/').length,
        contentMd,
        contentVersion: createHash('sha1').update(contentMd).digest('hex').slice(0, 12),
        contentPlainText: contentMd
      })
    }
  }

  await walk('')

  documents.sort((left, right) => left.path.localeCompare(right.path, 'zh-Hans-CN'))

  return {
    vaultName: basenameFromPath(vaultDir) || 'AnyReader Vault',
    vaultDir,
    generatedAt: new Date().toISOString(),
    documents,
    folderPaths: [...folderPaths].sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
  }
}

async function copyVaultToDist(vaultDir: string, distDir: string) {
  async function walkCopy(sourceDir: string, targetDir: string) {
    await mkdir(targetDir, { recursive: true })
    const entries = await readdir(sourceDir, { withFileTypes: true })
    for (const entry of entries) {
      const sourcePath = join(sourceDir, entry.name)
      const targetPath = join(targetDir, entry.name)
      if (entry.isDirectory()) {
        await walkCopy(sourcePath, targetPath)
      } else {
        await mkdir(dirname(targetPath), { recursive: true })
        await copyFile(sourcePath, targetPath)
      }
    }
  }

  await walkCopy(vaultDir, join(distDir, 'vault'))
}

function vaultPlugin(): Plugin {
  const vaultDir = process.env.ANY_READER_VAULT_DIR ? resolve(process.env.ANY_READER_VAULT_DIR) : DEFAULT_VAULT_DIR
  let rootDir = process.cwd()
  let outDir = 'dist'

  return {
    name: 'any-reader-ui-vault',
    configResolved(config) {
      rootDir = config.root
      outDir = config.build.outDir
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ? new URL(req.url, 'http://localhost') : null
        if (!url) {
          next()
          return
        }

        if (url.pathname === VAULT_MANIFEST_ROUTE) {
          try {
            const manifest = await readVaultDocuments(vaultDir)
            const body = JSON.stringify(manifest, null, 2)
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(body)
          } catch (error) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to read vault' }))
          }
          return
        }

        if (!url.pathname.startsWith(VAULT_ROUTE_PREFIX)) {
          next()
          return
        }

        const requestPath = decodeURIComponent(url.pathname.slice(VAULT_ROUTE_PREFIX.length))
        const file = safeResolveVaultFile(vaultDir, requestPath)
        if (!file) {
          res.statusCode = 404
          res.end('Not found')
          return
        }

        try {
          const contents = await readFile(file.absolutePath)
          res.statusCode = 200
          res.setHeader('Content-Type', file.mimeType)
          res.end(contents)
        } catch (error) {
          res.statusCode = 404
          res.end(error instanceof Error ? error.message : 'Not found')
        }
      })
    },
    async writeBundle() {
      const manifest = await readVaultDocuments(vaultDir)
      const distDir = resolve(rootDir, outDir)
      await mkdir(distDir, { recursive: true })
      await writeFile(join(distDir, 'vault-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
      await copyVaultToDist(vaultDir, distDir)
    }
  }
}

export default defineConfig({
  plugins: [react(), vaultPlugin()],
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true
  },
  build: {
    target: ['es2022', 'chrome105', 'safari13'],
    outDir: 'dist',
    emptyOutDir: true
  }
})
