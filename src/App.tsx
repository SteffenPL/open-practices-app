import { useState } from 'react'
import { HashRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import { isSupabaseConfigured } from './lib/supabase'
import { AuthProvider } from './auth/AuthContext'
import { SetupNotice } from './components/SetupNotice'
import { Header } from './components/Header'
import { TimelinePage } from './pages/TimelinePage'
import { PracticePage } from './pages/PracticePage'
import { EditorPage } from './pages/EditorPage'
import { ProfilePage } from './pages/ProfilePage'
import { GuidedPracticeEditor } from './pages/GuidedPracticeEditor'

function Shell() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [theme, setTheme] = useState<'day' | 'night'>(() => {
    try {
      return window.localStorage.getItem('open-practices-theme') === 'night' ? 'night' : 'day'
    } catch {
      return 'day'
    }
  })
  const changeTheme = (nextTheme: 'day' | 'night') => {
    setTheme(nextTheme)
    try {
      window.localStorage.setItem('open-practices-theme', nextTheme)
    } catch {
      // Theme remains usable if browser storage is unavailable.
    }
  }
  const searchQuery = searchParams.get('q') ?? ''
  const changeSearchQuery = (query: string) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      if (query) next.set('q', query)
      else next.delete('q')
      return next
    }, { replace: true })
  }
  return (
    <div className={`app-shell app-theme-${theme}`} data-color-mode={theme === 'night' ? 'dark' : 'light'}>
      <Header theme={theme} onThemeChange={changeTheme} searchQuery={searchQuery} onSearchChange={changeSearchQuery} />
      <Routes>
        <Route path="/" element={<TimelinePage searchQuery={searchQuery} />} />
        <Route path="/practice/:id" element={<PracticePage />} />
        <Route path="/new" element={<GuidedPracticeEditor />} />
        <Route path="/edit/:id" element={<EditorPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default function App() {
  if (!isSupabaseConfigured) return <SetupNotice />

  return (
    <AuthProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </AuthProvider>
  )
}
