import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, dirname, join, relative, resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const LOCAL_API_ROUTE_PREFIX = '/__any-reader-local/'
const VAULT_ROUTE_PREFIX = '/vault/'
const DEFAULT_VAULT_DIR_NAME = '微积分二层次下'
const LOCAL_STATE_DIR_NAME = 'any-reader-data'

interface SafeLocalPath {
  absolutePath: string
  payloadRelativePath: string
  kind: 'state' | 'vault'
}

function normalizeLocalPath(input: string) {
  return input
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment && segment !== '.')
    .join('/')
}

function safeResolve(baseDir: string, relativePath: string) {
  const normalized = normalizeLocalPath(relativePath)
  if (normalized.split('/').includes('..')) {
    return null
  }

  const absolutePath = resolve(baseDir, normalized)
  const relativeToBase = relative(baseDir, absolutePath)
  if (relativeToBase.startsWith('..') || resolve(absolutePath) === resolve(baseDir, '..')) {
    return null
  }

  return absolutePath
}

function resolveApiPath(args: {
  requestPath: string
  stateDir: string
  vaultDir: string
  forWrite?: boolean
}): SafeLocalPath | null {
  const normalized = normalizeLocalPath(args.requestPath)
  const vaultPrefix = `${DEFAULT_VAULT_DIR_NAME}/`
  const isVaultPath = normalized === DEFAULT_VAULT_DIR_NAME || normalized.startsWith(vaultPrefix)
  const kind = isVaultPath ? 'vault' : 'state'

  if (args.forWrite && kind !== 'state') {
    return null
  }

  const baseDir = kind === 'vault' ? args.vaultDir : args.stateDir
  const payloadRelativePath = kind === 'vault' ? normalized.slice(DEFAULT_VAULT_DIR_NAME.length).replace(/^\/+/, '') : normalized
  const absolutePath = safeResolve(baseDir, payloadRelativePath)

  return absolutePath
    ? {
        absolutePath,
        payloadRelativePath,
        kind
      }
    : null
}

function safeResolveVaultAsset(vaultDir: string, requestPath: string) {
  return safeResolve(vaultDir, requestPath)
}

function guessMimeType(path: string) {
  const lower = path.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
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

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function sendText(res: ServerResponse, statusCode: number, text: string) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.end(text)
}

function sendNoContent(res: ServerResponse) {
  res.statusCode = 204
  res.end()
}

function readRequestBody(req: IncomingMessage) {
  return new Promise<string>((resolveBody, rejectBody) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')))
    req.on('error', rejectBody)
  })
}

function toPayloadPath(parentPath: string, name: string) {
  return normalizeLocalPath(join(parentPath, name))
}

async function listDirPayload(localPath: SafeLocalPath) {
  const entries = await readdir(localPath.absolutePath, { withFileTypes: true })
  return entries
    .map((entry) => ({
      name: entry.name,
      path: toPayloadPath(localPath.payloadRelativePath, entry.name),
      isDir: entry.isDirectory()
    }))
    .sort((left, right) => {
      if (left.isDir !== right.isDir) {
        return left.isDir ? -1 : 1
      }
      return left.name.localeCompare(right.name, 'zh-Hans-CN')
    })
}

async function moveStatePathToTrash(localPath: SafeLocalPath, stateDir: string) {
  await stat(localPath.absolutePath)
  const fileName = basename(localPath.payloadRelativePath) || 'entry'
  const trashDir = resolve(stateDir, 'trash')
  const trashPath = resolve(trashDir, `${Date.now()}-${fileName}`)
  await mkdir(trashDir, { recursive: true })
  await rename(localPath.absolutePath, trashPath)
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

function localFilePlugin(): Plugin {
  let rootDir = process.cwd()
  let outDir = 'dist'
  let vaultDir = process.env.ANY_READER_VAULT_DIR
    ? resolve(process.env.ANY_READER_VAULT_DIR)
    : resolve(rootDir, DEFAULT_VAULT_DIR_NAME)
  let stateDir = process.env.ANY_READER_DATA_DIR
    ? resolve(process.env.ANY_READER_DATA_DIR)
    : resolve(rootDir, LOCAL_STATE_DIR_NAME)

  async function handleLocalRequest(req: IncomingMessage, res: ServerResponse, next: () => void) {
    const url = req.url ? new URL(req.url, 'http://localhost') : null
    if (!url) {
      next()
      return
    }

    if (url.pathname.startsWith(VAULT_ROUTE_PREFIX)) {
      const requestPath = decodeURIComponent(url.pathname.slice(VAULT_ROUTE_PREFIX.length))
      const absolutePath = safeResolveVaultAsset(vaultDir, requestPath)
      if (!absolutePath) {
        sendText(res, 404, 'Not found')
        return
      }

      try {
        if (req.method === 'HEAD') {
          await stat(absolutePath)
          res.statusCode = 200
          res.setHeader('Content-Type', guessMimeType(absolutePath))
          res.end()
          return
        }

        const contents = await readFile(absolutePath)
        res.statusCode = 200
        res.setHeader('Content-Type', guessMimeType(absolutePath))
        res.end(contents)
      } catch (error) {
        sendText(res, 404, error instanceof Error ? error.message : 'Not found')
      }
      return
    }

    if (!url.pathname.startsWith(LOCAL_API_ROUTE_PREFIX)) {
      next()
      return
    }

    const route = url.pathname.slice(LOCAL_API_ROUTE_PREFIX.length)
    const requestPath = url.searchParams.get('path') ?? ''

    try {
      if (route === 'list' && req.method === 'GET') {
        const localPath = resolveApiPath({ requestPath, stateDir, vaultDir })
        if (!localPath) {
          sendText(res, 404, 'Not found')
          return
        }
        try {
          sendJson(res, 200, await listDirPayload(localPath))
        } catch (error) {
          if (localPath.kind === 'state' && error instanceof Error && /ENOENT|ENOTDIR/.test(error.message)) {
            sendJson(res, 200, [])
            return
          }
          throw error
        }
        return
      }

      if (route === 'text' && req.method === 'GET') {
        const localPath = resolveApiPath({ requestPath, stateDir, vaultDir })
        if (!localPath) {
          sendText(res, 404, 'Not found')
          return
        }
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end(await readFile(localPath.absolutePath, 'utf8'))
        return
      }

      if (route === 'binary' && req.method === 'GET') {
        const localPath = resolveApiPath({ requestPath, stateDir, vaultDir })
        if (!localPath) {
          sendText(res, 404, 'Not found')
          return
        }
        const contents = await readFile(localPath.absolutePath)
        res.statusCode = 200
        res.setHeader('Content-Type', guessMimeType(localPath.absolutePath))
        res.end(contents)
        return
      }

      if (route === 'text' && req.method === 'PUT') {
        const localPath = resolveApiPath({ requestPath, stateDir, vaultDir, forWrite: true })
        if (!localPath) {
          sendText(res, 403, 'Writes are limited to the local state directory')
          return
        }
        await mkdir(dirname(localPath.absolutePath), { recursive: true })
        await writeFile(localPath.absolutePath, await readRequestBody(req), 'utf8')
        sendNoContent(res)
        return
      }

      if (route === 'path' && req.method === 'DELETE') {
        const localPath = resolveApiPath({ requestPath, stateDir, vaultDir, forWrite: true })
        if (!localPath) {
          sendText(res, 403, 'Deletes are limited to the local state directory')
          return
        }
        await rm(localPath.absolutePath, { recursive: true, force: true })
        sendNoContent(res)
        return
      }

      if (route === 'trash' && req.method === 'POST') {
        const payload = JSON.parse((await readRequestBody(req)) || '{}') as { path?: string }
        const localPath = resolveApiPath({ requestPath: payload.path ?? '', stateDir, vaultDir, forWrite: true })
        if (!localPath) {
          sendText(res, 403, 'Trash moves are limited to the local state directory')
          return
        }
        await moveStatePathToTrash(localPath, stateDir)
        sendNoContent(res)
        return
      }

      sendText(res, 404, 'Unknown local file route')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Local file request failed'
      sendText(res, /ENOENT/.test(message) ? 404 : 500, message)
    }
  }

  return {
    name: 'any-reader-ui-local-files',
    configResolved(config) {
      rootDir = config.root
      outDir = config.build.outDir
      vaultDir = process.env.ANY_READER_VAULT_DIR
        ? resolve(process.env.ANY_READER_VAULT_DIR)
        : resolve(rootDir, DEFAULT_VAULT_DIR_NAME)
      stateDir = process.env.ANY_READER_DATA_DIR
        ? resolve(process.env.ANY_READER_DATA_DIR)
        : resolve(rootDir, LOCAL_STATE_DIR_NAME)
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleLocalRequest(req, res, next)
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleLocalRequest(req, res, next)
      })
    },
    async writeBundle() {
      const distDir = resolve(rootDir, outDir)
      await mkdir(distDir, { recursive: true })
      await copyVaultToDist(vaultDir, distDir)
    }
  }
}

export default defineConfig({
  plugins: [react(), localFilePlugin()],
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: false
  },
  build: {
    target: ['es2022', 'chrome105', 'safari13'],
    outDir: 'dist',
    emptyOutDir: true
  }
})
