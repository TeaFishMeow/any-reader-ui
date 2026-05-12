import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAnonKey, getSupabaseUrl } from './env'
import { buildAuthCallbackPath } from './web-routing'

let supabaseClient: SupabaseClient | null = null

export function hasSupabaseAuthConfig() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey())
}

export function getSupabaseClient() {
  if (!hasSupabaseAuthConfig()) {
    return null
  }

  if (!supabaseClient) {
    supabaseClient = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    })
  }

  return supabaseClient
}

export async function primeSupabaseAuthSession() {
  const client = getSupabaseClient()
  if (!client) {
    return null
  }

  const { data, error } = await client.auth.getSession()
  if (error) {
    throw error
  }

  return data.session
}

export async function getSupabaseAccessToken() {
  const session = await primeSupabaseAuthSession()
  return session?.access_token ?? null
}

export async function sendSupabaseMagicLink(email: string, nextPath: string) {
  const client = getSupabaseClient()
  if (!client) {
    throw new Error('Supabase Auth is not configured in the frontend environment')
  }

  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: new URL(buildAuthCallbackPath(nextPath), window.location.origin).toString()
    }
  })

  if (error) {
    throw error
  }
}

export async function signOutSupabaseSession() {
  const client = getSupabaseClient()
  if (!client) {
    return
  }

  const { error } = await client.auth.signOut()
  if (error) {
    throw error
  }
}
