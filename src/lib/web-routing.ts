export const HOME_PATH = '/'
export const READER_PATH = '/reader'
export const LIBRARIES_PATH = '/libraries'
export const ADMIN_PATH = '/admin'
export const ADMIN_REPAIR_PATH = '/admin/repair'
export const SUBSCRIPTION_PATH = '/subscription'
export const LOGIN_PATH = '/login'
export const AUTH_CALLBACK_PATH = '/auth/callback'
export const DEFAULT_AUTH_NEXT_PATH = LIBRARIES_PATH

export type WebRouteKind = 'home' | 'reader' | 'libraries' | 'admin' | 'admin-repair' | 'subscription' | 'login' | 'auth-callback'

export function normalizeWebPath(pathname: string) {
  const normalized = pathname.replace(/\/+$/, '')
  return normalized || HOME_PATH
}

export function resolveWebRoute(pathname: string): WebRouteKind {
  const normalized = normalizeWebPath(pathname)

  if (normalized === HOME_PATH) {
    return 'home'
  }

  if (normalized === READER_PATH) {
    return 'reader'
  }

  if (normalized === ADMIN_PATH) {
    return 'admin'
  }

  if (normalized === ADMIN_REPAIR_PATH) {
    return 'admin-repair'
  }

  if (normalized === SUBSCRIPTION_PATH) {
    return 'subscription'
  }

  if (normalized === LIBRARIES_PATH) {
    return 'libraries'
  }

  if (normalized === LOGIN_PATH) {
    return 'login'
  }

  if (normalized === AUTH_CALLBACK_PATH) {
    return 'auth-callback'
  }

  return 'home'
}

export function sanitizeNextPath(rawNextPath: string | null | undefined, fallback = '/') {
  if (typeof rawNextPath !== 'string') {
    return fallback
  }

  const trimmed = rawNextPath.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return fallback
  }

  return trimmed
}

export function readNextPathFromSearch(search: string, fallback = '/') {
  return sanitizeNextPath(new URLSearchParams(search).get('next'), fallback)
}

export function buildLoginPath(nextPath = DEFAULT_AUTH_NEXT_PATH) {
  const params = new URLSearchParams()
  params.set('next', sanitizeNextPath(nextPath, DEFAULT_AUTH_NEXT_PATH))
  return `${LOGIN_PATH}?${params.toString()}`
}

export function buildLibrariesPath(libraryId?: string | null) {
  const normalizedLibraryId = typeof libraryId === 'string' ? libraryId.trim() : ''
  if (!normalizedLibraryId) {
    return LIBRARIES_PATH
  }

  const params = new URLSearchParams()
  params.set('libraryId', normalizedLibraryId)
  return `${LIBRARIES_PATH}?${params.toString()}`
}

export function buildAuthCallbackPath(nextPath: string) {
  const params = new URLSearchParams()
  params.set('next', sanitizeNextPath(nextPath, DEFAULT_AUTH_NEXT_PATH))
  return `${AUTH_CALLBACK_PATH}?${params.toString()}`
}

export function buildAdminRepairPath(args?: {
  libraryId?: string | null
  documentId?: string | null
  sessionId?: string | null
}) {
  const params = new URLSearchParams()
  const normalizedLibraryId = typeof args?.libraryId === 'string' ? args.libraryId.trim() : ''
  const normalizedDocumentId = typeof args?.documentId === 'string' ? args.documentId.trim() : ''
  const normalizedSessionId = typeof args?.sessionId === 'string' ? args.sessionId.trim() : ''

  if (normalizedLibraryId) {
    params.set('libraryId', normalizedLibraryId)
  }
  if (normalizedDocumentId) {
    params.set('documentId', normalizedDocumentId)
  }
  if (normalizedSessionId) {
    params.set('sessionId', normalizedSessionId)
  }

  const query = params.toString()
  return query ? `${ADMIN_REPAIR_PATH}?${query}` : ADMIN_REPAIR_PATH
}

export function buildReaderPath(libraryId?: string | null) {
  const normalizedLibraryId = typeof libraryId === 'string' ? libraryId.trim() : ''
  if (!normalizedLibraryId) {
    return READER_PATH
  }

  const params = new URLSearchParams()
  params.set('libraryId', normalizedLibraryId)
  return `${READER_PATH}?${params.toString()}`
}

export function buildSubscriptionPath(args?: {
  orderId?: string | null
  outTradeNo?: string | null
  payment?: string | null
}) {
  const params = new URLSearchParams()
  const orderId = typeof args?.orderId === 'string' ? args.orderId.trim() : ''
  const outTradeNo = typeof args?.outTradeNo === 'string' ? args.outTradeNo.trim() : ''
  const payment = typeof args?.payment === 'string' ? args.payment.trim() : ''
  if (orderId) {
    params.set('orderId', orderId)
  }
  if (outTradeNo) {
    params.set('outTradeNo', outTradeNo)
  }
  if (payment) {
    params.set('payment', payment)
  }
  const query = params.toString()
  return query ? `${SUBSCRIPTION_PATH}?${query}` : SUBSCRIPTION_PATH
}

export function readAuthCallbackError(search: string, hash = '') {
  const searchParams = new URLSearchParams(search)
  const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)

  const rawError =
    searchParams.get('error_description') ??
    searchParams.get('error') ??
    hashParams.get('error_description') ??
    hashParams.get('error')

  return rawError ? rawError.replace(/\+/g, ' ') : null
}
