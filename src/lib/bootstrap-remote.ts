import type { AppConfig, CanvasState, QARecord } from '../types/domain'
import {
  deleteRemoteQaRecord,
  fetchRemoteWorkspaceSnapshot,
  purgeRemoteQaRecord,
  saveRemoteWorkspaceState,
  saveRemoteQaRecord
} from './api'

export async function bootstrapWorkspace() {
  const requestedLibraryId = new URLSearchParams(window.location.search).get('libraryId') ?? undefined
  return fetchRemoteWorkspaceSnapshot(requestedLibraryId)
}

export async function saveConfig(config: AppConfig) {
  void config
  throw new Error('Legacy remote workspace config saves are deprecated. Use saveWorkspaceState().')
}

export async function saveCanvas(canvas: CanvasState) {
  void canvas
  throw new Error('Legacy remote workspace canvas saves are deprecated. Use saveWorkspaceState().')
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

export async function purgeQaRecord(recordId: string) {
  await purgeRemoteQaRecord(recordId)
}
