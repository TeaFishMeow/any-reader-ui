import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAnonKey, getSupabaseUrl } from './env'

let client: SupabaseClient | null = null

function supabaseClient() {
  if (!getSupabaseUrl() || !getSupabaseAnonKey()) return null
  client ??= createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
  })
  return client
}

export async function getSupabaseAccessToken() {
  const { data } = (await supabaseClient()?.auth.getSession()) ?? { data: { session: null } }
  return data.session?.access_token ?? null
}
