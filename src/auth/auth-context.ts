import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export interface AuthState {
  session: Session | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)
