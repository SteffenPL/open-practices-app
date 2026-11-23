import { isSupabaseConfigured } from './lib/supabase'
import { AuthProvider } from './auth/AuthContext'
import { useAuth } from './auth/useAuth'
import { SetupNotice } from './components/SetupNotice'
import { SignInPrompt } from './components/SignInPrompt'
import { ProfileCard } from './components/ProfileCard'

function AppShell() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <main className="center-screen">
        <p className="muted">Loading…</p>
      </main>
    )
  }

  return session ? <ProfileCard /> : <SignInPrompt />
}

export default function App() {
  if (!isSupabaseConfigured) return <SetupNotice />

  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
