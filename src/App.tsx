import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { isSupabaseConfigured } from './lib/supabase'
import { AuthProvider } from './auth/AuthContext'
import { SetupNotice } from './components/SetupNotice'
import { Header } from './components/Header'
import { TimelinePage } from './pages/TimelinePage'
import { PracticePage } from './pages/PracticePage'
import { EditorPage } from './pages/EditorPage'
import { ProfilePage } from './pages/ProfilePage'

function Shell() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<TimelinePage />} />
        <Route path="/practice/:id" element={<PracticePage />} />
        <Route path="/new" element={<EditorPage />} />
        <Route path="/edit/:id" element={<EditorPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
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
