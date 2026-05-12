import type { DirEntryPayload } from '../types/domain'

const STORAGE_PREFIX = 'anyreader-dev-fs:'
const ROOT_KEY = `${STORAGE_PREFIX}root`
const LOCAL_BROWSER_VAULT_PATH = 'any-reader-ui-local-vault'
const mountedVaultBlobUrlCache = new Map<string, string>()
let tauriCorePromise: Promise<typeof import('@tauri-apps/api/core')> | null = null

export function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

async function invokeTauri<T>(command: string, payload?: Record<string, unknown>) {
  if (!tauriCorePromise) {
    tauriCorePromise = import('@tauri-apps/api/core')
  }

  const { invoke } = await tauriCorePromise
  return invoke<T>(command, payload)
}

function normalizeRelativePath(relativePath: string) {
  return relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
}

function encodeVaultAssetUrl(relativePath: string) {
  return `/vault/${normalizeRelativePath(relativePath)
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`
}

function isLocalBrowserVault(vaultPath?: string) {
  return !isTauriRuntime() && (!vaultPath || vaultPath === LOCAL_BROWSER_VAULT_PATH)
}

async function browserGetDataRoot() {
  const existing = window.localStorage.getItem(ROOT_KEY)
  if (existing) {
    return existing
  }
  const root = 'browser://anyreader-data'
  window.localStorage.setItem(ROOT_KEY, root)
  return root
}

async function browserRead(relativePath: string) {
  return window.localStorage.getItem(`${STORAGE_PREFIX}${normalizeRelativePath(relativePath)}`)
}

async function browserWrite(relativePath: string, contents: string) {
  window.localStorage.setItem(`${STORAGE_PREFIX}${normalizeRelativePath(relativePath)}`, contents)
}

async function browserExists(relativePath: string) {
  return window.localStorage.getItem(`${STORAGE_PREFIX}${normalizeRelativePath(relativePath)}`) !== null
}

async function browserList(relativePath: string) {
  const prefix = normalizeRelativePath(relativePath)
  const normalizedPrefix = prefix.length > 0 ? `${prefix}/` : ''
  const keys = Object.keys(window.localStorage)
  const children = new Map<string, DirEntryPayload>()

  for (const key of keys) {
    if (!key.startsWith(STORAGE_PREFIX)) {
      continue
    }

    const relative = key.slice(STORAGE_PREFIX.length)
    if (!relative.startsWith(normalizedPrefix)) {
      continue
    }

    const remainder = relative.slice(normalizedPrefix.length)
    if (!remainder) {
      continue
    }

    const [head, ...rest] = remainder.split('/')
    children.set(head, {
      name: head,
      path: `${normalizedPrefix}${head}`.replace(/\/$/, ''),
      isDir: rest.length > 0
    })
  }

  return [...children.values()].sort((left, right) => left.name.localeCompare(right.name))
}

async function browserMoveToTrash(relativePath: string) {
  const normalized = normalizeRelativePath(relativePath)
  const value = await browserRead(normalized)
  if (value === null) {
    return
  }
  const fileName = normalized.split('/').pop() ?? 'entry.json'
  const trashPath = `trash/${Date.now()}-${fileName}`
  await browserWrite(trashPath, value)
  window.localStorage.removeItem(`${STORAGE_PREFIX}${normalized}`)
}

async function browserRemove(relativePath: string) {
  const normalized = normalizeRelativePath(relativePath)
  const exactKey = `${STORAGE_PREFIX}${normalized}`
  const prefixKey = `${exactKey}/`
  const keys = Object.keys(window.localStorage)

  for (const key of keys) {
    if (key === exactKey || key.startsWith(prefixKey)) {
      window.localStorage.removeItem(key)
    }
  }
}

async function browserPickVaultDirectory() {
  return null
}

async function browserMountedVaultExists(_vaultPath?: string, _relativePath?: string) {
  return true
}

async function browserReadMountedVaultTextFile(_vaultPath?: string, relativePath?: string) {
  if (!relativePath) {
    return null
  }

  const response = await fetch(encodeVaultAssetUrl(relativePath))
  return response.ok ? response.text() : null
}

async function browserReadMountedVaultBinaryFile(_vaultPath?: string, relativePath?: string) {
  if (!relativePath) {
    return null
  }

  const response = await fetch(encodeVaultAssetUrl(relativePath))
  if (!response.ok) {
    return null
  }

  return [...new Uint8Array(await response.arrayBuffer())]
}

async function browserListMountedVaultEntries(_vaultPath?: string, _relativePath?: string) {
  return [] as DirEntryPayload[]
}

async function browserResolveMountedVaultAbsolutePath(_vaultPath?: string, _relativePath?: string) {
  return null
}

export async function getDataRoot() {
  if (!isTauriRuntime()) {
    return browserGetDataRoot()
  }
  return invokeTauri<string>('get_data_root')
}

export async function readTextFile(relativePath: string) {
  if (!isTauriRuntime()) {
    return browserRead(relativePath)
  }
  return invokeTauri<string | null>('read_text_file', { relativePath })
}

export async function writeTextFile(relativePath: string, contents: string) {
  if (!isTauriRuntime()) {
    return browserWrite(relativePath, contents)
  }
  return invokeTauri<void>('write_text_file', { relativePath, contents })
}

export async function pathExists(relativePath: string) {
  if (!isTauriRuntime()) {
    return browserExists(relativePath)
  }
  return invokeTauri<boolean>('path_exists', { relativePath })
}

export async function listDirEntries(relativePath: string) {
  if (!isTauriRuntime()) {
    return browserList(relativePath)
  }
  return invokeTauri<DirEntryPayload[]>('list_dir_entries', { relativePath })
}

export async function movePathToTrash(relativePath: string) {
  if (!isTauriRuntime()) {
    return browserMoveToTrash(relativePath)
  }
  return invokeTauri<void>('move_path_to_trash', { relativePath })
}

export async function removePath(relativePath: string) {
  if (!isTauriRuntime()) {
    return browserRemove(relativePath)
  }
  return invokeTauri<void>('remove_path', { relativePath })
}

export async function pickVaultDirectory() {
  if (!isTauriRuntime()) {
    return browserPickVaultDirectory()
  }
  return invokeTauri<string | null>('pick_vault_directory')
}

export async function mountedVaultExists(vaultPath: string, relativePath = '') {
  if (!isTauriRuntime()) {
    return browserMountedVaultExists()
  }
  return invokeTauri<boolean>('mounted_vault_exists', { vaultPath, relativePath })
}

export async function readMountedVaultTextFile(vaultPath: string, relativePath: string) {
  if (!isTauriRuntime()) {
    return browserReadMountedVaultTextFile()
  }
  return invokeTauri<string | null>('read_mounted_vault_text_file', { vaultPath, relativePath })
}

export async function readMountedVaultBinaryFile(vaultPath: string, relativePath: string) {
  if (!isTauriRuntime()) {
    return browserReadMountedVaultBinaryFile()
  }
  return invokeTauri<number[] | null>('read_mounted_vault_binary_file', { vaultPath, relativePath })
}

export async function listMountedVaultEntries(vaultPath: string, relativePath = '') {
  if (!isTauriRuntime()) {
    return browserListMountedVaultEntries()
  }
  return invokeTauri<DirEntryPayload[]>('list_mounted_vault_entries', { vaultPath, relativePath })
}

export async function resolveMountedVaultAbsolutePath(vaultPath: string, relativePath: string) {
  if (!isTauriRuntime()) {
    return browserResolveMountedVaultAbsolutePath()
  }
  return invokeTauri<string | null>('resolve_mounted_vault_absolute_path', { vaultPath, relativePath })
}

export async function resolveMountedVaultAssetUrl(vaultPath: string, relativePath: string) {
  if (isLocalBrowserVault(vaultPath)) {
    return encodeVaultAssetUrl(relativePath)
  }

  const cacheKey = `${vaultPath}::${normalizeRelativePath(relativePath)}`
  const cachedUrl = mountedVaultBlobUrlCache.get(cacheKey)
  if (cachedUrl) {
    return cachedUrl
  }

  const bytes = await readMountedVaultBinaryFile(vaultPath, relativePath)
  if (!bytes) {
    return null
  }

  const blobUrl = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: guessMimeTypeFromPath(relativePath) }))
  mountedVaultBlobUrlCache.set(cacheKey, blobUrl)
  return blobUrl
}

export function guessMimeTypeFromPath(path: string) {
  const normalized = normalizeRelativePath(path).toLowerCase()
  if (normalized.endsWith('.png')) {
    return 'image/png'
  }
  if (normalized.endsWith('.gif')) {
    return 'image/gif'
  }
  if (normalized.endsWith('.webp')) {
    return 'image/webp'
  }
  if (normalized.endsWith('.svg')) {
    return 'image/svg+xml'
  }
  if (normalized.endsWith('.bmp')) {
    return 'image/bmp'
  }
  if (normalized.endsWith('.avif')) {
    return 'image/avif'
  }
  return 'image/jpeg'
}
