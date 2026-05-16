import type { AppConfig, CanvasState, QARecord } from '../domain'
import {
  deleteRemoteQaRecord,
  fetchRemoteWorkspaceSnapshot,
  saveRemoteWorkspaceState,
  saveRemoteQaRecord
} from './api'

export async function bootstrapWorkspace() {
  const requestedLibraryId = new URLSearchParams(window.location.search).get('libraryId') ?? undefined
  return fetchRemoteWorkspaceSnapshot(requestedLibraryId)
}

export async function saveWorkspaceState(args: { config: AppConfig; canvas: CanvasState; version: number }) {
  return saveRemoteWorkspaceState(args)
}

export async function saveQaRecord(record: QARecord) {
  await saveRemoteQaRecord(record)
}

export async function deleteQaRecord(record: QARecord) {
  await deleteRemoteQaRecord(record)
}
