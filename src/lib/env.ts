function readFlag(name: string, fallback: boolean) {
  const value = import.meta.env[name]
  if (value === undefined) {
    return fallback
  }
  return value === 'true'
}

export function getSupabaseUrl() {
  return (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '')
}

export function getSupabaseAnonKey() {
  return (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
}

export function getApiBaseUrl() {
  return (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '')
}

export function getApiUrl(path: string) {
  const baseUrl = getApiBaseUrl()
  if (!baseUrl) {
    return ''
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${baseUrl}${normalizedPath}`
}

export function useBackendLlmProxy() {
  return readFlag('VITE_USE_BACKEND_LLM_PROXY', true) && Boolean(getApiBaseUrl())
}

export function useRemoteWorkspaceStore() {
  return readFlag('VITE_USE_REMOTE_WORKSPACE', true) && Boolean(getApiBaseUrl())
}
