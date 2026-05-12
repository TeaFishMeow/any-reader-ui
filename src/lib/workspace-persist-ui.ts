export interface WorkspacePersistUiState {
  isDirty: boolean
  isSaving: boolean
  failureMessage: string | null
  reloadedFromConflict: boolean
}

export interface WorkspacePersistBannerContent {
  kind: 'error' | 'info'
  title: string
  body: string
  detail: string | null
  canRetry: boolean
}

export function createWorkspacePersistUiState(): WorkspacePersistUiState {
  return {
    isDirty: false,
    isSaving: false,
    failureMessage: null,
    reloadedFromConflict: false
  }
}

export function markWorkspacePersistDirty(state: WorkspacePersistUiState): WorkspacePersistUiState {
  return {
    ...state,
    isDirty: true,
    reloadedFromConflict: false
  }
}

export function markWorkspacePersistStarted(state: WorkspacePersistUiState): WorkspacePersistUiState {
  return {
    ...state,
    isSaving: true,
    failureMessage: null,
    reloadedFromConflict: false
  }
}

export function markWorkspacePersistSucceeded(): WorkspacePersistUiState {
  return createWorkspacePersistUiState()
}

export function markWorkspacePersistFailed(
  state: WorkspacePersistUiState,
  failureMessage: string
): WorkspacePersistUiState {
  return {
    ...state,
    isDirty: true,
    isSaving: false,
    failureMessage,
    reloadedFromConflict: false
  }
}

export function markWorkspacePersistConflictReloaded(): WorkspacePersistUiState {
  return {
    isDirty: false,
    isSaving: false,
    failureMessage: null,
    reloadedFromConflict: true
  }
}

export function resolveWorkspacePersistBanner(
  state: WorkspacePersistUiState,
  copy: {
    failedTitle: string
    failedBody: string
    failedDetail: string | null
    conflictTitle: string
    conflictBody: string
  }
): WorkspacePersistBannerContent | null {
  if (state.failureMessage) {
    return {
      kind: 'error',
      title: copy.failedTitle,
      body: copy.failedBody,
      detail: copy.failedDetail,
      canRetry: state.isDirty
    }
  }

  if (state.reloadedFromConflict) {
    return {
      kind: 'info',
      title: copy.conflictTitle,
      body: copy.conflictBody,
      detail: null,
      canRetry: false
    }
  }

  return null
}
