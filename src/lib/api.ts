import type { AppConfig, CanvasState, DocumentNode, QARecord, WorkspaceSnapshot } from '../domain'
import { getApiUrl } from './env'

interface PaginatedResult<T> {
  items: T[]
  limit: number
  hasMore: boolean
}

let activeRemoteLibraryId = ''

async function requestJson<T>(path: string, init?: RequestInit) {
  const url = getApiUrl(path)
  if (!url) throw new Error(`Missing API base URL for ${path}`)

  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')

  const { getSupabaseAccessToken } = await import('./auth')
  const token = await getSupabaseAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(url, { cache: 'no-store', ...init, headers })
  if (!response.ok) {
    const message = (await response.text().catch(() => '')).trim()
    throw new Error(message || `API request failed: ${response.status} ${path}`)
  }
  return (await response.json()) as T
}

const segment = (value: string) => encodeURIComponent(value)

function activeLibraryId(libraryId = activeRemoteLibraryId) {
  if (!libraryId) throw new Error('Remote workspace library context is not initialized')
  return libraryId
}

async function fetchRemoteWorkspaceQaRecords(libraryId: string, offset = 0) {
  return requestJson<PaginatedResult<QARecord>>(
    `/api/v1/libraries/${segment(libraryId)}/workspace/qa-records?limit=100&offset=${offset}`
  )
}

async function fetchAllRemoteWorkspaceQaRecords(libraryId: string) {
  const records: QARecord[] = []
  for (let offset = 0; ; ) {
    const page = await fetchRemoteWorkspaceQaRecords(libraryId, offset)
    records.push(...page.items)
    if (!page.hasMore) return records
    offset += page.limit
  }
}

export async function fetchRemoteWorkspaceSnapshot(libraryId?: string) {
  const path = libraryId
    ? `/api/v1/workspace/bootstrap?libraryId=${segment(libraryId)}`
    : '/api/v1/workspace/bootstrap'
  const snapshot = await requestJson<WorkspaceSnapshot>(path)
  activeRemoteLibraryId = snapshot.repositoryBinding.libraryId ?? snapshot.repo.libraryId ?? ''

  const count = Math.max(snapshot.qaRecordCount ?? snapshot.qaRecords.length, snapshot.qaRecords.length)
  return activeRemoteLibraryId && count > snapshot.qaRecords.length
    ? { ...snapshot, qaRecords: await fetchAllRemoteWorkspaceQaRecords(activeRemoteLibraryId), qaRecordCount: count }
    : snapshot
}

export function fetchRemoteDocument(documentId: string, libraryId?: string) {
  const id = activeLibraryId(libraryId)
  return requestJson<DocumentNode>(`/api/v1/libraries/${segment(id)}/documents/${segment(documentId)}`)
}

export async function saveRemoteWorkspaceState(args: { config: AppConfig; canvas: CanvasState; version: number }) {
  const id = activeLibraryId(args.config.repository.libraryId)
  const response = await requestJson<{ version: number }>(`/api/v1/libraries/${segment(id)}/workspace/state`, {
    method: 'PUT',
    body: JSON.stringify(args)
  })
  return response.version
}

export function saveRemoteQaRecord(record: QARecord) {
  return requestJson<{ ok: true }>(`/api/v1/libraries/${segment(activeLibraryId())}/workspace/qa-record`, {
    method: 'PUT',
    body: JSON.stringify({ record })
  })
}

export function deleteRemoteQaRecord(record: QARecord) {
  return requestJson<{ ok: true }>(`/api/v1/libraries/${segment(activeLibraryId())}/workspace/qa-record/delete`, {
    method: 'POST',
    body: JSON.stringify({ record })
  })
}
