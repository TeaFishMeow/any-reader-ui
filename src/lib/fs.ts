import type { DirEntryPayload } from '../types/domain'

const LOCAL_API_PREFIX = '/__any-reader-local'
const VAULT_ASSET_PREFIX = '/vault'
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

function joinLocalPath(...parts: Array<string | undefined>) {
  return parts
    .map((part) => normalizeRelativePath(part ?? ''))
    .filter(Boolean)
    .join('/')
}

function localApiUrl(route: string, relativePath: string) {
  const params = new URLSearchParams({ path: normalizeRelativePath(relativePath) })
  return `${LOCAL_API_PREFIX}/${route}?${params.toString()}`
}

function encodeVaultAssetUrl(relativePath: string) {
  return `${VAULT_ASSET_PREFIX}/${normalizeRelativePath(relativePath)
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`
}

async function readErrorText(response: Response) {
  const text = await response.text().catch(() => '')
  return text.trim() || `Local file request failed with ${response.status}`
}

async function fetchTextOrNull(url: string) {
  const response = await fetch(url)
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error(await readErrorText(response))
  }
  return response.text()
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(await readErrorText(response))
  }
  return (await response.json()) as T
}

async function browserGetDataRoot() {
  return 'any-reader-data'
}

async function browserRead(relativePath: string) {
  return fetchTextOrNull(localApiUrl('text', relativePath))
}

async function browserWrite(relativePath: string, contents: string) {
  const response = await fetch(localApiUrl('text', relativePath), {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    },
    body: contents
  })
  if (!response.ok) {
    throw new Error(await readErrorText(response))
  }
}

async function browserExists(relativePath: string) {
  const response = await fetch(localApiUrl('text', relativePath))
  if (response.status === 404) {
    return false
  }
  if (!response.ok) {
    throw new Error(await readErrorText(response))
  }
  return true
}

async function browserList(relativePath: string) {
  const response = await fetch(localApiUrl('list', relativePath))
  if (response.status === 404) {
    return [] as DirEntryPayload[]
  }
  if (!response.ok) {
    throw new Error(await readErrorText(response))
  }
  return (await response.json()) as DirEntryPayload[]
}

async function browserMoveToTrash(relativePath: string) {
  const response = await fetch(`${LOCAL_API_PREFIX}/trash`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ path: normalizeRelativePath(relativePath) })
  })
  if (!response.ok && response.status !== 404) {
    throw new Error(await readErrorText(response))
  }
}

async function browserRemove(relativePath: string) {
  const response = await fetch(localApiUrl('path', relativePath), {
    method: 'DELETE'
  })
  if (!response.ok && response.status !== 404) {
    throw new Error(await readErrorText(response))
  }
}

async function browserPickVaultDirectory() {
  return null
}

async function browserMountedVaultExists(vaultPath: string, relativePath = '') {
  const response = await fetch(localApiUrl('list', joinLocalPath(vaultPath, relativePath)))
  if (response.status === 404) {
    return false
  }
  if (!response.ok) {
    throw new Error(await readErrorText(response))
  }
  return true
}

async function browserReadMountedVaultTextFile(vaultPath: string, relativePath: string) {
  return fetchTextOrNull(localApiUrl('text', joinLocalPath(vaultPath, relativePath)))
}

async function browserReadMountedVaultBinaryFile(vaultPath: string, relativePath: string) {
  const response = await fetch(localApiUrl('binary', joinLocalPath(vaultPath, relativePath)))
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error(await readErrorText(response))
  }
  return [...new Uint8Array(await response.arrayBuffer())]
}

async function browserListMountedVaultEntries(vaultPath: string, relativePath = '') {
  return fetchJson<DirEntryPayload[]>(localApiUrl('list', joinLocalPath(vaultPath, relativePath)))
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
    return browserMountedVaultExists(vaultPath, relativePath)
  }
  return invokeTauri<boolean>('mounted_vault_exists', { vaultPath, relativePath })
}

export async function readMountedVaultTextFile(vaultPath: string, relativePath: string) {
  if (!isTauriRuntime()) {
    return browserReadMountedVaultTextFile(vaultPath, relativePath)
  }
  return invokeTauri<string | null>('read_mounted_vault_text_file', { vaultPath, relativePath })
}

export async function readMountedVaultBinaryFile(vaultPath: string, relativePath: string) {
  if (!isTauriRuntime()) {
    return browserReadMountedVaultBinaryFile(vaultPath, relativePath)
  }
  return invokeTauri<number[] | null>('read_mounted_vault_binary_file', { vaultPath, relativePath })
}

export async function listMountedVaultEntries(vaultPath: string, relativePath = '') {
  if (!isTauriRuntime()) {
    return browserListMountedVaultEntries(vaultPath, relativePath)
  }
  return invokeTauri<DirEntryPayload[]>('list_mounted_vault_entries', { vaultPath, relativePath })
}

export async function resolveMountedVaultAbsolutePath(vaultPath: string, relativePath: string) {
  if (!isTauriRuntime()) {
    return browserResolveMountedVaultAbsolutePath(vaultPath, relativePath)
  }
  return invokeTauri<string | null>('resolve_mounted_vault_absolute_path', { vaultPath, relativePath })
}

export async function resolveMountedVaultAssetUrl(vaultPath: string, relativePath: string) {
  if (!isTauriRuntime()) {
    void vaultPath
    const url = encodeVaultAssetUrl(relativePath)
    const response = await fetch(url, { method: 'HEAD' })
    return response.ok ? url : null
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
