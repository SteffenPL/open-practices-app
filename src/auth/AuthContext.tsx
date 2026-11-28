import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { AuthContext } from './auth-context'

const returnKey = 'open-practices-return-after-login'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) return

    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session)
        setLoading(false)
      })
      .catch(() => setLoading(false))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    try {
      const target = sessionStorage.getItem(returnKey)
      sessionStorage.removeItem(returnKey)
      if (target?.startsWith('#/') && ['', '#', '#/'].includes(window.location.hash)) window.location.hash = target
    } catch { /* Login also works when session storage is disabled. */ }
  }, [session])

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return
    const redirectTo = window.location.origin + import.meta.env.BASE_URL
    try {
      if (window.location.hash.startsWith('#/')) sessionStorage.setItem(returnKey, window.location.hash)
      else sessionStorage.removeItem(returnKey)
    } catch { /* The OAuth redirect still returns to the feed. */ }
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }, [])

  const value = useMemo(
    () => ({ session, loading, signInWithGoogle, signOut }),
    [session, loading, signInWithGoogle, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
