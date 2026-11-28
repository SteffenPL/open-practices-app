import { installOSLabels, useInstallOS, type InstallOS } from './lib/installCommands'
import { useState } from 'react'
import { HashRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import { isSupabaseConfigured } from './lib/supabase'
import { AuthProvider } from './auth/AuthContext'
import { SetupNotice } from './components/SetupNotice'
import { IntroductionPage } from './pages/IntroductionPage'
import { MySkillsPage } from './pages/MySkillsPage'
import { AgentsPage } from './pages/AgentsPage'
import { Header } from './components/Header'
import { TimelinePage } from './pages/TimelinePage'
import { PracticePage } from './pages/PracticePage'
import { CatalogPage, NewToolPage, ToolPage } from './pages/ToolCatalog'
import { ProfilePage } from './pages/ProfilePage'
import { MentionPracticeEditor } from './pages/MentionPracticeEditor'

function Shell() {
  const [os, setOS] = useInstallOS()
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
      <Header theme={theme} onThemeChange={changeTheme} />
      <Routes>
        <Route path="/" element={<TimelinePage searchQuery={searchQuery} onSearchChange={changeSearchQuery} />} />
        <Route path="/practice/:id" element={<PracticePage />} />
        <Route path="/new" element={<MentionPracticeEditor />} />
        <Route path="/edit/:id" element={<MentionPracticeEditor />} />
        <Route path="/tools" element={<CatalogPage />} />
        <Route path="/tools/new" element={<NewToolPage />} />
        <Route path="/tools/:id" element={<ToolPage />} />
        <Route path="/my-skills" element={<Navigate replace to={{ pathname: "/my-setups", search: searchParams.toString() }} />} />
        <Route path="/my-setups" element={<MySkillsPage />} />
        <Route path="/intro" element={<IntroductionPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <footer className="install-preference">
        <label>Install commands for <select value={os} onChange={event => setOS(event.target.value as InstallOS)}>
          {Object.entries(installOSLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
      </footer>
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
