import type { AppConfig, CanvasState, QARecord, WorkspaceSnapshot } from '../domain'
import { useRemoteWorkspaceStore } from './env'

interface BootstrapModule {
  bootstrapWorkspace(): Promise<WorkspaceSnapshot>
  saveWorkspaceState(args: { config: AppConfig; canvas: CanvasState; version: number }): Promise<number>
  saveQaRecord(record: QARecord): Promise<void>
  deleteQaRecord(record: QARecord): Promise<void>
}

let localBootstrapModulePromise: Promise<BootstrapModule> | null = null
let remoteBootstrapModulePromise: Promise<BootstrapModule> | null = null

function loadLocalBootstrapModule() {
  if (!localBootstrapModulePromise) {
    localBootstrapModulePromise = import('./bootstrap-local').then((module) => module as BootstrapModule)
  }

  return localBootstrapModulePromise
}

function loadRemoteBootstrapModule() {
  if (!remoteBootstrapModulePromise) {
    remoteBootstrapModulePromise = import('./bootstrap-remote').then((module) => module as BootstrapModule)
  }

  return remoteBootstrapModulePromise
}

function loadBootstrapModule() {
  return useRemoteWorkspaceStore() ? loadRemoteBootstrapModule() : loadLocalBootstrapModule()
}

export async function bootstrapWorkspace() {
  return (await loadBootstrapModule()).bootstrapWorkspace()
}

export async function saveWorkspaceState(args: { config: AppConfig; canvas: CanvasState; version: number }) {
  return (await loadBootstrapModule()).saveWorkspaceState(args)
}

export async function saveQaRecord(record: QARecord) {
  await (await loadBootstrapModule()).saveQaRecord(record)
}

export async function deleteQaRecord(record: QARecord) {
  await (await loadBootstrapModule()).deleteQaRecord(record)
}
