import type {
  AppConfig,
  CanvasState,
  DocumentCatalogEntry,
  DocumentNode,
  QARecord,
  RepoMeta,
  RepositoryBinding,
  SidebarNode,
  WorkspaceSnapshot
} from '../types/domain'
import { getApiUrl } from './env'

export interface ProfileSummary {
  id: string
  email: string | null
  displayName: string | null
  isPlatformAdmin: boolean
}

export interface LibraryPermissions {
  canRead: boolean
  canViewAdmin: boolean
  canManageLibrary: boolean
  canManageMemberships: boolean
  canImport: boolean
  canPublish: boolean
  canManageErrata: boolean
  canCreateInternalComments: boolean
}

export interface RemoteLibrarySummary {
  id: string
  slug?: string
  libraryRowId?: string
  title: string
  description?: string
  visibility?: 'private' | 'invite_only' | 'public'
  revisionId?: string | null
  currentRevisionId?: string | null
  currentDocumentId?: string | null
  rootDocumentIds: string[]
  documentCount: number
  sourceLabel?: string
  myRole?: string | null
  permissions?: LibraryPermissions
  createdAt?: string
  updatedAt?: string
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

export interface PaginationArgs {
  limit?: number
  offset?: number
}

interface RemoteLibraryWorkspaceState {
  dataRoot: string
  sidebarNodes: SidebarNode[]
  config: AppConfig
  canvas: CanvasState
  qaRecords: QARecord[]
  qaRecordCount?: number
  repositoryBinding: RepositoryBinding
}

export interface RemoteLibraryMembership {
  id: string
  libraryId: string
  userId: string
  role: 'owner' | 'admin' | 'editor' | 'viewer'
  createdBy: string | null
  createdAt: string
  userProfile: ProfileSummary | null
  createdByProfile: ProfileSummary | null
}

export interface RemoteAdminUserSummary {
  id: string
  email: string | null
  displayName: string | null
  isPlatformAdmin: boolean
  creditBalance: number
  subscription: RemoteCreditState['subscription']
  libraryCount: number
  createdAt: string | null
  updatedAt: string | null
}

export interface RemoteAdminUserMembership {
  id: string
  libraryId: string
  libraryTitle: string
  libraryVisibility: 'private' | 'invite_only' | 'public'
  role: 'owner' | 'admin' | 'editor' | 'viewer'
  createdBy: string | null
  createdAt: string
  createdByProfile: ProfileSummary | null
}

export interface RemoteAdminUserDetails {
  profile: RemoteAdminUserSummary
  memberships: RemoteAdminUserMembership[]
  creditState: RemoteCreditState
}

export interface RemoteAdminSubscriptionTier {
  code: 'free' | 'vip1' | 'vip2' | 'vip3' | 'vip4'
  displayName: string
  dailyQuota: number
  isPurchaseEnabled: boolean
  sortOrder: number
  updatedAt: string | null
}

export interface RemoteLibraryRevision {
  id: string
  libraryId: string
  versionNo: number
  label: string | null
  status: 'draft' | 'importing' | 'ready' | 'published' | 'failed' | 'archived'
  manifest: Record<string, unknown>
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface RemoteLibraryImportJob {
  id: string
  libraryId: string
  requestedBy: string
  requestedByProfile?: ProfileSummary | null
  requestedRevisionLabel?: string | null
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
  sourceBucket: string
  sourceObjectPath: string
  sourceFilename: string
  sourceBytes: number
  attemptCount: number
  startedAt: string | null
  finishedAt: string | null
  errorMessage: string | null
  logExcerpt: string | null
  createdAt: string
  updatedAt: string
}

export interface RemoteLibraryImportReconcileResult {
  outcome: 'noop' | 'marked-succeeded' | 'marked-failed' | 'marked-failed-with-revision'
  job: RemoteLibraryImportJob
  revision: RemoteLibraryRevision | null
}

export interface RemoteAdminLlmProxySettings {
  models: Array<{
    id: string
    provider: 'openai-compatible' | 'deepseek'
    presetKey: string | null
    baseUrl: string
    displayName: string
    model: string
    cost: number
    displayOrder?: number
    hasApiKey: boolean
    isDefault: boolean
    source: 'database' | 'legacy-runtime'
  }>
  providerOptions: {
    providers: Array<'openai-compatible' | 'deepseek'>
    deepseekPresets: Array<{
      key: string
      label: string
      displayName: string
    }>
  }
  rateLimitWindowMs: number
  rateLimitMaxRequests: number
  bodyLimitBytes: number
  isConfigured: boolean
  runtimeOnly: boolean
}

export interface RemoteAdminLlmModelTestResult {
  ok: boolean
  displayName?: string
  model: string
  baseUrl: string
  status: number | null
  statusText: string | null
  latencyMs: number
  error: string | null
}

export interface RemoteCreditState {
  creditBalance: number
  permanentBalance: number
  dailyQuota: number
  dailyUsed: number
  dailyRemaining: number
  quotaDate: string | null
  subscription: {
    configuredTier: 'free' | 'vip1' | 'vip2' | 'vip3' | 'vip4'
    effectiveTier: 'free' | 'vip1' | 'vip2' | 'vip3' | 'vip4'
    expiresAt: string | null
    isExpired: boolean
  }
}

export interface RemoteBillingCatalog {
  tiers: Array<{
    code: 'free' | 'vip1' | 'vip2' | 'vip3' | 'vip4'
    displayName: string
    dailyQuota: number | null
    isPurchaseEnabled: boolean
    sortOrder: number
    priceLabel: string
    note: string | null
  }>
  products: Array<{
    code: 'vip1' | 'vip2' | 'vip3' | 'credit_pack_100'
    kind: 'subscription' | 'credit_pack'
    tierCode: 'vip1' | 'vip2' | 'vip3' | null
    displayName: string
    amountCents: number
    amount: string
    permanentCredits: number
    dailyQuota: number | null
    isPurchaseEnabled: boolean
  }>
  payTypes: Array<{
    code: RemoteBillingPayType
    displayName: string
  }>
  creditState: RemoteCreditState
}

export type RemoteBillingPayType = 'alipay' | 'wxpay'

export interface RemoteBillingOrder {
  id: string
  outTradeNo: string
  userId: string
  productCode: string
  productKind: 'subscription' | 'credit_pack'
  tierCode: 'vip1' | 'vip2' | 'vip3' | 'vip4' | null
  permanentCredits: number
  amountCents: number
  amount: string
  status: 'created' | 'paid' | 'fulfilled' | 'failed' | 'closed'
  gateway: 'ezfpy'
  gatewayTradeNo: string | null
  payType: string | null
  createdAt: string
  paidAt: string | null
  fulfilledAt: string | null
  updatedAt: string
}

export interface RemoteAdminBillingOrder extends RemoteBillingOrder {
  userProfile: ProfileSummary | null
  clientIp: string | null
  hasNotifyPayload: boolean
  hasReturnPayload: boolean
}

export interface RemoteAdminBillingOrderDetails extends RemoteAdminBillingOrder {
  notifyPayload: Record<string, unknown> | null
  returnPayload: Record<string, unknown> | null
}

export interface RemoteBillingOrderCheckout {
  order: RemoteBillingOrder
  gateway: 'ezfpy'
  method: 'POST' | 'GET'
  action: string
  fields: Record<string, string>
}

export interface RemoteLibraryIncidentSummary {
  total: number
  staleWorkspaceRejects: number
  duplicateTicketReplays: number
  duplicateCommentReplays: number
}

export interface RemoteLibraryIncident {
  id: string
  libraryId: string
  action: string
  actorId: string | null
  actorProfile: ProfileSummary | null
  targetTable: string
  targetId: string | null
  details: Record<string, unknown>
  createdAt: string
}

export interface RemoteLibraryIncidentFeed {
  summary: RemoteLibraryIncidentSummary
  incidents: RemoteLibraryIncident[]
}

export interface RemoteLibraryErrataTicket {
  id: string
  libraryId: string
  revisionId: string | null
  documentId: string | null
  documentPath: string
  title: string
  description: string
  selectionQuote: string | null
  selectionContext: string | null
  proposedFix: string | null
  severity: 'low' | 'medium' | 'high'
  status: 'open' | 'accepted' | 'rejected' | 'fixed' | 'closed'
  createdBy: string
  assignedTo: string | null
  createdByProfile?: ProfileSummary | null
  assignedToProfile?: ProfileSummary | null
  permissions?: {
    canManage: boolean
    canComment: boolean
  }
  createdAt: string
  updatedAt: string
  closedAt: string | null
}

export interface RemoteErrataComment {
  id: string
  ticketId: string
  authorId: string
  authorProfile: ProfileSummary | null
  body: string
  isInternal: boolean
  createdAt: string
}

export interface RepairEditorSelection {
  startOffset: number | null
  endOffset: number | null
  startLine: number | null
  startColumn: number | null
  endLine: number | null
  endColumn: number | null
  selectedText: string
}

export interface RepairImpactSummary {
  qaRecordCount: number
  affectedWorkspaceCount: number
  affectedWidgetCount: number
  activeTicketCount: number
}

export interface RepairTicketSummary {
  id: string
  libraryId: string
  revisionId: string | null
  documentId: string | null
  documentPath: string
  title: string
  description: string
  severity: 'low' | 'medium' | 'high'
  status: 'open' | 'accepted' | 'rejected' | 'fixed' | 'closed'
  createdBy: string
  assignedTo: string | null
  createdByProfile?: ProfileSummary | null
  assignedToProfile?: ProfileSummary | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
}

export interface RepairSessionDetail {
  id: string
  libraryId: string
  libraryTitle: string
  revisionId: string
  documentId: string
  documentPath: string
  documentTitle: string
  status: 'draft' | 'published'
  baseChecksum: string
  currentDocumentChecksum: string
  publishedChecksum: string | null
  draftMarkdown: string
  createdBy: string
  createdByProfile: ProfileSummary | null
  lastSavedBy: string | null
  lastSavedByProfile: ProfileSummary | null
  lockOwnerId: string | null
  lockOwnerProfile: ProfileSummary | null
  lockExpiresAt: string | null
  publishedBy: string | null
  publishedByProfile: ProfileSummary | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  isLocked: boolean
  isLockedByCurrentUser: boolean
  canEdit: boolean
  canPublish: boolean
  impact: RepairImpactSummary
  tickets: RepairTicketSummary[]
}

export interface RepairLogEntry {
  id: string
  sessionId: string
  libraryId: string
  revisionId: string
  documentId: string
  actorId: string | null
  actorProfile: ProfileSummary | null
  action: 'session.created' | 'draft.saved' | 'ai.invoked' | 'ai.applied' | 'published' | 'restored_to_draft' | 'lock.taken_over'
  beforeMarkdown: string
  afterMarkdown: string
  selection: RepairEditorSelection | Record<string, unknown>
  promptText: string | null
  responseText: string | null
  modelInfo: Record<string, unknown>
  publishNote: string | null
  impact: Record<string, unknown>
  metadata: Record<string, unknown>
  createdAt: string
}

export interface RepairPublishResult {
  session: RepairSessionDetail
  deletedQaRecordCount: number
  updatedWorkspaceCount: number
  affectedWidgetCount: number
  resolvedTicketCount: number
  logId: string | null
}

export interface RepairAiRewriteResult {
  content: string
  modelInfo: {
    provider: string
    displayName?: string
    model: string
    temperature: number
  }
}

let activeRemoteLibraryId = ''
let activeRemoteRevisionId = ''

interface ApiRuntimeOverrides {
  fetch?: typeof fetch
  getApiUrl?: typeof getApiUrl
  getSupabaseAccessToken?: () => Promise<string | null>
}

let apiRuntimeOverrides: ApiRuntimeOverrides | null = null

export interface RemoteResolvedAsset {
  id: string
  libraryId: string
  revisionId: string
  path: string
  mimeType: string
  byteSize: number
  revisionAssetUrl: string
  signedUrl: string
  expiresAt: number
}

export class ApiRequestError extends Error {
  status: number
  path: string
  details: unknown
  retryAfterMs: number | null

  constructor(args: { status: number; path: string; message: string; details?: unknown; retryAfterMs?: number | null }) {
    super(args.message)
    this.name = 'ApiRequestError'
    this.status = args.status
    this.path = args.path
    this.details = args.details ?? null
    this.retryAfterMs =
      typeof args.retryAfterMs === 'number' && Number.isFinite(args.retryAfterMs) && args.retryAfterMs > 0
        ? args.retryAfterMs
        : null
  }
}

function createEmptyRemoteLibraryIncidentFeed(): RemoteLibraryIncidentFeed {
  return {
    summary: {
      total: 0,
      staleWorkspaceRejects: 0,
      duplicateTicketReplays: 0,
      duplicateCommentReplays: 0
    },
    incidents: []
  }
}

function isNotFoundApiError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError && error.status === 404
}

async function resolveSupabaseAccessToken() {
  if (apiRuntimeOverrides?.getSupabaseAccessToken) {
    return apiRuntimeOverrides.getSupabaseAccessToken()
  }

  const { getSupabaseAccessToken } = await import('./auth')
  return getSupabaseAccessToken()
}

function resolveApiUrl(path: string) {
  return (apiRuntimeOverrides?.getApiUrl ?? getApiUrl)(path)
}

function resolveApiFetch() {
  return apiRuntimeOverrides?.fetch ?? fetch
}

function extractRetryAfterMsFromDetails(details: unknown) {
  if (!details || typeof details !== 'object') {
    return null
  }

  const retryAfterMs = 'retryAfterMs' in details ? details.retryAfterMs : null
  return typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : null
}

function extractRetryAfterMsFromHeaders(headers: Headers) {
  const retryAfterHeader = headers.get('Retry-After')
  if (!retryAfterHeader) {
    return null
  }

  const retryAfterSeconds = Number.parseInt(retryAfterHeader, 10)
  return Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : null
}

export function configureApiRuntimeForTests(overrides: ApiRuntimeOverrides | null) {
  apiRuntimeOverrides = overrides
}

async function buildApiHeaders(init?: RequestInit, requireAuth = true) {
  const headers = new Headers(init?.headers ?? {})
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (requireAuth) {
    const accessToken = await resolveSupabaseAccessToken()
    if (!accessToken) {
      throw new Error('Authenticated Supabase session is required')
    }
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  return headers
}

async function requestJson<T>(path: string, init?: RequestInit, options?: { requireAuth?: boolean }) {
  const url = resolveApiUrl(path)
  if (!url) {
    throw new Error(`Missing API base URL for ${path}`)
  }

  const responseHeaders = await buildApiHeaders(init, options?.requireAuth ?? true)
  const response = await resolveApiFetch()(url, {
    cache: 'no-store',
    ...init,
    headers: responseHeaders
  })

  if (!response.ok) {
    const errorText = await response.text()
    let details: unknown = null
    let message = `API request failed: ${response.status} ${path}`

    if (errorText) {
      try {
        details = JSON.parse(errorText)
        const payloadMessage =
          details && typeof details === 'object' && 'error' in details && typeof details.error === 'string'
            ? details.error
            : null
        message = payloadMessage ?? message
      } catch {
        details = errorText
        message = errorText
      }
    }

    throw new ApiRequestError({
      status: response.status,
      path,
      message,
      details,
      retryAfterMs: extractRetryAfterMsFromDetails(details) ?? extractRetryAfterMsFromHeaders(response.headers)
    })
  }

  return (await response.json()) as T
}

function encodeRouteSegment(value: string) {
  return encodeURIComponent(value)
}

function appendPagination(path: string, pagination?: PaginationArgs) {
  if (!pagination || (pagination.limit === undefined && pagination.offset === undefined)) {
    return path
  }

  const params = new URLSearchParams()
  if (pagination.limit !== undefined) {
    params.set('limit', String(pagination.limit))
  }
  if (pagination.offset !== undefined) {
    params.set('offset', String(pagination.offset))
  }
  return `${path}?${params.toString()}`
}

function resolveCurrentDocumentId(repo: RepoMeta, documents: DocumentNode[], preferredPath?: string) {
  const preferredDocument = preferredPath
    ? documents.find((document) => document.path === preferredPath || document.id === preferredPath) ?? null
    : null

  if (preferredDocument) {
    return preferredDocument.id
  }

  if (documents.some((document) => document.id === repo.currentDocumentId)) {
    return repo.currentDocumentId
  }

  return repo.rootDocumentIds.find((documentId) => documents.some((document) => document.id === documentId)) ?? documents[0]?.id ?? ''
}

function mergeDocumentCatalog(catalog: DocumentCatalogEntry[], documentDetails: DocumentNode[]) {
  const detailMap = new Map(documentDetails.map((document) => [document.id, document]))

  return catalog.map(
    (entry) =>
      detailMap.get(entry.id) ?? {
        ...entry,
        contentMd: '',
        isContentLoaded: false
      }
  )
}

export async function fetchRemoteWorkspaceSnapshot(libraryId?: string) {
  const path = libraryId
    ? `/api/v1/workspace/bootstrap?libraryId=${encodeURIComponent(libraryId)}`
    : '/api/v1/workspace/bootstrap'
  const snapshot = await requestJson<WorkspaceSnapshot>(path)
  activeRemoteLibraryId = snapshot.repositoryBinding.libraryId ?? snapshot.repo.libraryId ?? ''
  activeRemoteRevisionId = snapshot.repositoryBinding.revisionId ?? snapshot.repo.revisionId ?? ''
  if (!activeRemoteLibraryId) {
    return snapshot
  }

  const qaRecordCount = Math.max(snapshot.qaRecordCount ?? snapshot.qaRecords.length, snapshot.qaRecords.length)
  if (qaRecordCount <= snapshot.qaRecords.length) {
    return snapshot
  }

  const qaRecords = await fetchAllRemoteWorkspaceQaRecords(activeRemoteLibraryId)
  return {
    ...snapshot,
    qaRecords,
    qaRecordCount
  }
}

function resolveActiveRemoteLibraryId(libraryId?: string) {
  const resolved = libraryId ?? activeRemoteLibraryId
  if (!resolved) {
    throw new Error('Remote workspace library context is not initialized')
  }
  return resolved
}

export async function fetchRemoteDocument(documentId: string, libraryId?: string) {
  const resolvedLibraryId = resolveActiveRemoteLibraryId(libraryId)
  return requestJson<DocumentNode>(
    `/api/v1/libraries/${encodeRouteSegment(resolvedLibraryId)}/documents/${encodeRouteSegment(documentId)}`
  )
}

export async function fetchRemoteLibraryDocuments(libraryId: string) {
  return requestJson<DocumentNode[]>(`/api/v1/libraries/${encodeRouteSegment(libraryId)}/documents`)
}

export async function fetchRemoteWorkspaceQaRecords(libraryId: string, pagination?: PaginationArgs) {
  return requestJson<PaginatedResult<QARecord>>(
    appendPagination(`/api/v1/libraries/${encodeRouteSegment(libraryId)}/workspace/qa-records`, pagination)
  )
}

export async function fetchRemoteLibraries() {
  return requestJson<RemoteLibrarySummary[]>('/api/v1/libraries')
}

export async function fetchAdminLlmProxySettings() {
  return requestJson<RemoteAdminLlmProxySettings>('/api/v1/admin/llm-proxy')
}

export async function fetchAdminUsers(args?: PaginationArgs & { q?: string }) {
  const params = new URLSearchParams()
  if (args?.limit !== undefined) {
    params.set('limit', String(args.limit))
  }
  if (args?.offset !== undefined) {
    params.set('offset', String(args.offset))
  }
  if (args?.q) {
    params.set('q', args.q)
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  return requestJson<PaginatedResult<RemoteAdminUserSummary>>(`/api/v1/admin/users${suffix}`)
}

export async function fetchAdminUser(userId: string) {
  return requestJson<RemoteAdminUserDetails>(`/api/v1/admin/users/${encodeRouteSegment(userId)}`)
}

export async function fetchAdminSubscriptionTiers() {
  return requestJson<RemoteAdminSubscriptionTier[]>('/api/v1/admin/subscription-tiers')
}

export async function updateAdminSubscriptionTiers(payload: {
  tiers: Array<{
    code: RemoteAdminSubscriptionTier['code']
    dailyQuota: number
  }>
}) {
  return requestJson<RemoteAdminSubscriptionTier[]>('/api/v1/admin/subscription-tiers', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
}

export async function updateAdminUser(
  userId: string,
  payload: Partial<{
    isPlatformAdmin: boolean
    creditBalance: number
    subscriptionTier: RemoteAdminSubscriptionTier['code']
    subscriptionExpiresAt: string | null
    subscription: {
      tierCode?: RemoteAdminSubscriptionTier['code']
      expiresAt?: string | null
    }
  }>
) {
  return requestJson<RemoteAdminUserDetails>(`/api/v1/admin/users/${encodeRouteSegment(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
}

export async function upsertAdminUserMembership(
  userId: string,
  payload: {
    libraryId: string
    role: 'owner' | 'admin' | 'editor' | 'viewer'
  }
) {
  return requestJson<RemoteLibraryMembership>(`/api/v1/admin/users/${encodeRouteSegment(userId)}/memberships`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export async function removeAdminUserMembership(userId: string, membershipId: string) {
  return requestJson<{ ok: true }>(
    `/api/v1/admin/users/${encodeRouteSegment(userId)}/memberships/${encodeRouteSegment(membershipId)}`,
    {
      method: 'DELETE'
    }
  )
}

export async function updateAdminLlmProxySettings(
  payload: Partial<{
    models: Array<{
      id?: string
      provider: 'openai-compatible' | 'deepseek'
      presetKey?: string | null
      baseUrl?: string
      displayName?: string
      model?: string
      cost: string | number
      apiKey?: string
      clearApiKey?: boolean
      isDefault?: boolean
    }>
    rateLimitWindowMs: string | number
    rateLimitMaxRequests: string | number
    bodyLimitBytes: string | number
  }>
) {
  return requestJson<RemoteAdminLlmProxySettings>('/api/v1/admin/llm-proxy', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
}

export async function testAdminLlmProxyModel(payload: {
  id?: string
  provider?: 'openai-compatible' | 'deepseek'
  presetKey?: string | null
  baseUrl?: string
  displayName?: string
  model?: string
  apiKey?: string
  clearApiKey?: boolean
}) {
  return requestJson<RemoteAdminLlmModelTestResult>('/api/v1/admin/llm-proxy/test', {
    method: 'POST',
    body: JSON.stringify({ model: payload })
  })
}

export async function fetchBillingCatalog() {
  return requestJson<RemoteBillingCatalog>('/api/v1/billing/catalog')
}

export async function createBillingOrder(payload: {
  productCode: 'vip1' | 'vip2' | 'vip3' | 'credit_pack_100'
  payType: RemoteBillingPayType
}) {
  return requestJson<RemoteBillingOrderCheckout>('/api/v1/billing/orders', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export async function fetchBillingOrder(orderId: string) {
  return requestJson<RemoteBillingOrder>(`/api/v1/billing/orders/${encodeRouteSegment(orderId)}`)
}

export async function reconcileBillingOrder(orderId: string) {
  return requestJson<{ order: RemoteBillingOrder; reconciled: boolean; gatewayResult: unknown }>(
    `/api/v1/billing/orders/${encodeRouteSegment(orderId)}/reconcile`,
    {
      method: 'POST'
    }
  )
}

export async function fetchAdminBillingOrders(
  args?: PaginationArgs & {
    status?: 'all' | RemoteBillingOrder['status']
    productKind?: RemoteBillingOrder['productKind']
    userId?: string
  }
) {
  const params = new URLSearchParams()
  if (args?.limit !== undefined) {
    params.set('limit', String(args.limit))
  }
  if (args?.offset !== undefined) {
    params.set('offset', String(args.offset))
  }
  if (args?.status && args.status !== 'all') {
    params.set('status', args.status)
  }
  if (args?.productKind) {
    params.set('productKind', args.productKind)
  }
  if (args?.userId) {
    params.set('userId', args.userId)
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  return requestJson<PaginatedResult<RemoteAdminBillingOrder>>(`/api/v1/admin/billing/orders${suffix}`)
}

export async function fetchAdminBillingOrder(orderId: string) {
  return requestJson<RemoteAdminBillingOrderDetails>(`/api/v1/admin/billing/orders/${encodeRouteSegment(orderId)}`)
}

export async function fetchRemoteLibraryRevisions(libraryId: string, pagination?: PaginationArgs) {
  return requestJson<PaginatedResult<RemoteLibraryRevision>>(
    appendPagination(`/api/v1/libraries/${encodeRouteSegment(libraryId)}/revisions`, pagination)
  )
}

export async function fetchRemoteLibraryImportJobs(libraryId: string, pagination?: PaginationArgs) {
  return requestJson<PaginatedResult<RemoteLibraryImportJob>>(
    appendPagination(`/api/v1/libraries/${encodeRouteSegment(libraryId)}/import-jobs`, pagination)
  )
}

export async function fetchRemoteLibraryConsistencyIncidents(libraryId: string) {
  try {
    return await requestJson<RemoteLibraryIncidentFeed>(
      `/api/v1/admin/libraries/${encodeRouteSegment(libraryId)}/incidents`
    )
  } catch (error) {
    if (isNotFoundApiError(error)) {
      return createEmptyRemoteLibraryIncidentFeed()
    }
    throw error
  }
}

export async function fetchRemoteLibraryMemberships(libraryId: string, pagination?: PaginationArgs) {
  return requestJson<PaginatedResult<RemoteLibraryMembership>>(
    appendPagination(`/api/v1/libraries/${encodeRouteSegment(libraryId)}/memberships`, pagination)
  )
}

export async function fetchRemoteLibraryErrataTickets(libraryId: string, pagination?: PaginationArgs) {
  return requestJson<PaginatedResult<RemoteLibraryErrataTicket>>(
    appendPagination(`/api/v1/libraries/${encodeRouteSegment(libraryId)}/errata-tickets`, pagination)
  )
}

export async function fetchRemoteErrataComments(libraryId: string, ticketId: string, pagination?: PaginationArgs) {
  return requestJson<PaginatedResult<RemoteErrataComment>>(
    appendPagination(
      `/api/v1/libraries/${encodeRouteSegment(libraryId)}/errata-tickets/${encodeRouteSegment(ticketId)}/comments`,
      pagination
    )
  )
}

async function fetchAllRemoteWorkspaceQaRecords(libraryId: string) {
  const pageSize = 100
  let offset = 0
  const records: QARecord[] = []

  while (true) {
    const page = await fetchRemoteWorkspaceQaRecords(libraryId, {
      limit: pageSize,
      offset
    })
    records.push(...page.items)
    if (!page.hasMore) {
      return records
    }
    offset += page.limit
  }
}

export async function resolveRemoteAsset(args: {
  libraryId: string
  revisionId: string
  documentPath?: string
  src: string
}) {
  const params = new URLSearchParams()
  params.set('src', args.src)
  if (args.documentPath) {
    params.set('documentPath', args.documentPath)
  }

  const path = `/api/v1/libraries/${encodeRouteSegment(args.libraryId)}/revisions/${encodeRouteSegment(args.revisionId)}/assets/resolve?${params.toString()}`
  try {
    return await requestJson<RemoteResolvedAsset>(path)
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return null
    }
    throw error
  }
}

export async function saveRemoteConfig(config: AppConfig) {
  void config
  throw new Error('Legacy remote workspace config saves are deprecated. Use saveRemoteWorkspaceState().')
}

export async function saveRemoteCanvas(canvas: CanvasState) {
  void canvas
  throw new Error('Legacy remote workspace canvas saves are deprecated. Use saveRemoteWorkspaceState().')
}

export async function saveRemoteWorkspaceState(args: {
  config: AppConfig
  canvas: CanvasState
  version: number
}) {
  const libraryId = resolveActiveRemoteLibraryId(args.config.repository.libraryId)
  const response = await requestJson<{ ok: true; version: number }>(
    `/api/v1/libraries/${encodeRouteSegment(libraryId)}/workspace/state`,
    {
      method: 'PUT',
      body: JSON.stringify({
        config: args.config,
        canvas: args.canvas,
        version: args.version
      })
    }
  )

  return response.version
}

export async function saveRemoteQaRecord(record: QARecord) {
  const libraryId = resolveActiveRemoteLibraryId()
  await requestJson<{ ok: true }>(`/api/v1/libraries/${encodeRouteSegment(libraryId)}/workspace/qa-record`, {
    method: 'PUT',
    body: JSON.stringify({ record })
  })
}

export async function deleteRemoteQaRecord(record: QARecord) {
  const libraryId = resolveActiveRemoteLibraryId()
  await requestJson<{ ok: true }>(
    `/api/v1/libraries/${encodeRouteSegment(libraryId)}/workspace/qa-record/delete`,
    {
      method: 'POST',
      body: JSON.stringify({ record })
    }
  )
}

export async function purgeRemoteQaRecord(recordId: string) {
  const libraryId = resolveActiveRemoteLibraryId()
  await requestJson<{ ok: true }>(
    `/api/v1/libraries/${encodeRouteSegment(libraryId)}/workspace/qa-record/purge`,
    {
      method: 'POST',
      body: JSON.stringify({ recordId })
    }
  )
}

export async function createManagedLibrary(payload: {
  title: string
  slug?: string
  description?: string
  visibility: 'private' | 'invite_only' | 'public'
}) {
  return requestJson<RemoteLibrarySummary>('/api/v1/admin/libraries', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export async function updateManagedLibrary(
  libraryId: string,
  payload: Partial<{
    title: string
    description: string
    visibility: 'private' | 'invite_only' | 'public'
  }>
) {
  return requestJson<RemoteLibrarySummary>(`/api/v1/admin/libraries/${encodeRouteSegment(libraryId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
}

export async function deleteManagedLibrary(
  libraryId: string,
  payload: {
    confirmSlug: string
  }
) {
  return requestJson<{
    ok: true
    deletedLibraryId: string
    deletedLibrarySlug: string
    deletedLibraryTitle: string
    deletedRowCounts: Record<string, number>
    deletedObjectCounts: Record<string, number | boolean>
  }>(`/api/v1/admin/libraries/${encodeRouteSegment(libraryId)}`, {
    method: 'DELETE',
    body: JSON.stringify(payload)
  })
}

export async function upsertManagedLibraryMembership(
  libraryId: string,
  payload: {
    userId?: string
    email?: string
    role: 'owner' | 'admin' | 'editor' | 'viewer'
  }
) {
  return requestJson<RemoteLibraryMembership>(
    `/api/v1/admin/libraries/${encodeRouteSegment(libraryId)}/memberships`,
    {
      method: 'POST',
      body: JSON.stringify(payload)
    }
  )
}

export async function removeManagedLibraryMembership(libraryId: string, membershipId: string) {
  return requestJson<{ ok: true }>(
    `/api/v1/admin/libraries/${encodeRouteSegment(libraryId)}/memberships/${encodeRouteSegment(membershipId)}`,
    {
      method: 'DELETE'
    }
  )
}

export async function uploadManagedLibraryArchive(args: {
  libraryId: string
  file: File
  label?: string
}) {
  const url = getApiUrl(`/api/v1/admin/libraries/${encodeRouteSegment(args.libraryId)}/import-jobs`)
  if (!url) {
    throw new Error('Missing API base URL for import upload')
  }

  const headers = await buildApiHeaders(
    {
      headers: {
        'Content-Type': args.file.type || 'application/zip',
        'X-AnyReader-Upload-Filename': args.file.name,
        ...(args.label ? { 'X-AnyReader-Revision-Label': args.label } : {})
      }
    },
    true
  )
  const response = await fetch(url, {
    method: 'POST',
    cache: 'no-store',
    headers,
    body: await args.file.arrayBuffer()
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new ApiRequestError({
      status: response.status,
      path: `/api/v1/admin/libraries/${args.libraryId}/import-jobs`,
      message: errorText || `API request failed: ${response.status}`,
      details: errorText
    })
  }

  return (await response.json()) as {
    job: RemoteLibraryImportJob
    revision: RemoteLibraryRevision | null
  }
}

export async function reconcileManagedLibraryImportJob(libraryId: string, importJobId: string) {
  return requestJson<RemoteLibraryImportReconcileResult>(
    `/api/v1/admin/libraries/${encodeRouteSegment(libraryId)}/import-jobs/${encodeRouteSegment(importJobId)}/reconcile`,
    {
      method: 'POST'
    }
  )
}

export async function publishManagedLibraryRevision(libraryId: string, revisionId: string) {
  return requestJson<RemoteLibraryRevision>(
    `/api/v1/admin/libraries/${encodeRouteSegment(libraryId)}/revisions/${encodeRouteSegment(revisionId)}/publish`,
    {
      method: 'POST'
    }
  )
}

export async function createLibraryErrataTicket(
  libraryId: string,
  payload: {
    idempotencyKey: string
    revisionId?: string
    documentId?: string
    documentPath?: string
    title: string
    description: string
    severity: 'low' | 'medium' | 'high'
    selectionQuote?: string
    selectionContext?: string
    proposedFix?: string
  }
) {
  return requestJson<RemoteLibraryErrataTicket>(
    `/api/v1/libraries/${encodeRouteSegment(libraryId)}/errata-tickets`,
    {
      method: 'POST',
      body: JSON.stringify(payload)
    }
  )
}

export async function updateManagedErrataTicket(
  libraryId: string,
  ticketId: string,
  payload: Partial<{
    title: string
    description: string
    proposedFix: string
    severity: 'low' | 'medium' | 'high'
    status: 'open' | 'accepted' | 'rejected' | 'fixed' | 'closed'
    assignedToEmail: string
  }>
) {
  return requestJson<RemoteLibraryErrataTicket>(
    `/api/v1/admin/libraries/${encodeRouteSegment(libraryId)}/errata-tickets/${encodeRouteSegment(ticketId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }
  )
}

export async function createErrataCommentForLibrary(
  libraryId: string,
  ticketId: string,
  payload: {
    idempotencyKey: string
    body: string
    isInternal?: boolean
  }
) {
  return requestJson<RemoteErrataComment>(
    `/api/v1/libraries/${encodeRouteSegment(libraryId)}/errata-tickets/${encodeRouteSegment(ticketId)}/comments`,
    {
      method: 'POST',
      body: JSON.stringify(payload)
    }
  )
}

export async function createRepairSessionForLibrary(
  libraryId: string,
  payload: {
    documentId: string
  }
) {
  return requestJson<RepairSessionDetail>(
    `/api/v1/admin/libraries/${encodeRouteSegment(libraryId)}/repair/sessions`,
    {
      method: 'POST',
      body: JSON.stringify(payload)
    }
  )
}

export async function fetchRepairSessionForLibrary(libraryId: string, sessionId: string) {
  return requestJson<RepairSessionDetail>(
    `/api/v1/admin/libraries/${encodeRouteSegment(libraryId)}/repair/sessions/${encodeRouteSegment(sessionId)}`
  )
}

export async function saveRepairSessionForLibrary(
  libraryId: string,
  sessionId: string,
  payload: {
    draftMarkdown: string
    action?: 'draft.saved' | 'ai.invoked' | 'ai.applied'
    selection?: RepairEditorSelection
    promptText?: string
    responseText?: string
    modelInfo?: Record<string, unknown>
  }
) {
  return requestJson<RepairSessionDetail>(
    `/api/v1/admin/libraries/${encodeRouteSegment(libraryId)}/repair/sessions/${encodeRouteSegment(sessionId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload)
    }
  )
}

export async function fetchRepairSessionLogsForLibrary(libraryId: string, sessionId: string) {
  return requestJson<RepairLogEntry[]>(
    `/api/v1/admin/libraries/${encodeRouteSegment(libraryId)}/repair/sessions/${encodeRouteSegment(sessionId)}/logs`
  )
}

export async function publishRepairSessionForLibrary(
  libraryId: string,
  sessionId: string,
  payload: {
    expectedBaseChecksum: string
    resolvedTicketIds: string[]
    publishNote?: string
  }
) {
  return requestJson<RepairPublishResult>(
    `/api/v1/admin/libraries/${encodeRouteSegment(libraryId)}/repair/sessions/${encodeRouteSegment(sessionId)}/publish`,
    {
      method: 'POST',
      body: JSON.stringify(payload)
    }
  )
}

export async function restoreRepairLogToDraftForLibrary(
  libraryId: string,
  sessionId: string,
  payload: {
    logId: string
  }
) {
  return requestJson<RepairSessionDetail>(
    `/api/v1/admin/libraries/${encodeRouteSegment(libraryId)}/repair/sessions/${encodeRouteSegment(sessionId)}/restore-log`,
    {
      method: 'POST',
      body: JSON.stringify(payload)
    }
  )
}

export async function requestRepairAiRewrite(payload: {
  documentPath: string
  documentTitle?: string
  selectedText: string
  promptText: string
}) {
  const response = await requestJson<{
    content?: string
    modelDisplayName?: string
    model?: string
  }>('/api/v1/llm/answer', {
    method: 'POST',
    body: JSON.stringify({
      qaRecord: {
        systemStatePrompt:
          'You are editing a markdown document inside the AnyReader repair workbench. Rewrite only the selected markdown fragment and return only the replacement markdown. Do not wrap the answer in code fences or add explanations.',
        fullPrompt: [
          `Document title: ${payload.documentTitle?.trim() || 'Untitled document'}`,
          `Document path: ${payload.documentPath}`,
          '',
          'Selected markdown:',
          '<<<SELECTED_MARKDOWN',
          payload.selectedText,
          'SELECTED_MARKDOWN',
          '',
          'Rewrite instruction:',
          payload.promptText
        ].join('\n')
      },
      provider: {
        temperature: 0.2
      }
    })
  })

  const content = response.content?.trim()
  if (!content) {
    throw new Error('Backend proxy returned an empty answer')
  }

  return {
    content,
    modelInfo: {
      provider: 'Backend Proxy',
      displayName: response.modelDisplayName?.trim() || response.model?.trim() || 'server-managed',
      model: response.model?.trim() || 'server-managed',
      temperature: 0.2
    }
  } satisfies RepairAiRewriteResult
}
