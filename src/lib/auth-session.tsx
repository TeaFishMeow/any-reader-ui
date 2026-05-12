import { createContext, startTransition, useContext, useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabaseAnonKey, getSupabaseUrl } from './env'

export type AuthStatus = 'loading' | 'signed_in' | 'signed_out' | 'misconfigured'

interface AuthSessionState {
  status: AuthStatus
  session: Session | null
  user: User | null
  error: string | null
}

interface AuthSessionContextValue extends AuthSessionState {
  hasConfig: boolean
  requestMagicLink: (email: string, nextPath: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null)

function hasSupabaseFrontendConfig() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey())
}

function buildStateFromSession(session: Session | null): AuthSessionState {
  return {
    status: session ? 'signed_in' : 'signed_out',
    session,
    user: session?.user ?? null,
    error: null
  }
}

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  const hasConfig = hasSupabaseFrontendConfig()
  const [state, setState] = useState<AuthSessionState>(() =>
    hasConfig
      ? {
          status: 'loading',
          session: null,
          user: null,
          error: null
        }
      : {
          status: 'misconfigured',
          session: null,
          user: null,
          error: 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY'
        }
  )

  useEffect(() => {
    if (!hasConfig) {
      startTransition(() => {
        setState({
          status: 'misconfigured',
          session: null,
          user: null,
          error: 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY'
        })
      })
      return
    }

    let active = true
    let unsubscribe = () => undefined

    void import('./auth')
      .then(async ({ getSupabaseClient, primeSupabaseAuthSession }) => {
        if (!active) {
          return
        }

        const client = getSupabaseClient()
        if (!client) {
          startTransition(() => {
            setState({
              status: 'misconfigured',
              session: null,
              user: null,
              error: 'Supabase Auth is not configured in the frontend environment'
            })
          })
          return
        }

        const applySession = (session: Session | null) => {
          if (!active) {
            return
          }

          startTransition(() => {
            setState(buildStateFromSession(session))
          })
        }

        try {
          applySession(await primeSupabaseAuthSession())
        } catch (error) {
          startTransition(() => {
            setState({
              status: 'signed_out',
              session: null,
              user: null,
              error: error instanceof Error ? error.message : 'Failed to restore the Supabase session'
            })
          })
        }

        const {
          data: { subscription }
        } = client.auth.onAuthStateChange((_event, session) => {
          applySession(session)
        })

        unsubscribe = () => {
          subscription.unsubscribe()
        }
      })
      .catch((error) => {
        if (!active) {
          return
        }

        startTransition(() => {
          setState({
            status: 'signed_out',
            session: null,
            user: null,
            error: error instanceof Error ? error.message : 'Failed to initialize the Supabase session'
          })
        })
      })

    return () => {
      active = false
      unsubscribe()
    }
  }, [hasConfig])

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      ...state,
      hasConfig,
      async requestMagicLink(email: string, nextPath: string) {
        const { sendSupabaseMagicLink } = await import('./auth')
        await sendSupabaseMagicLink(email, nextPath)
      },
      async signOut() {
        const { signOutSupabaseSession } = await import('./auth')
        await signOutSupabaseSession()
      }
    }),
    [hasConfig, state]
  )

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext)
  if (!context) {
    throw new Error('useAuthSession must be used inside AuthSessionProvider')
  }

  return context
}
