import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

function googleMetadata(user: {
  user_metadata?: Record<string, unknown>
}): { displayName: string; avatarUrl: string | null } {
  return {
    displayName: (user.user_metadata?.name as string) ?? '',
    avatarUrl: (user.user_metadata?.picture as string) ?? null,
  }
}

export function ProfilePage() {
  const { session } = useAuth()
  const user = session?.user
  const [profile, setProfile] = useState<Profile | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  useEffect(() => {
    if (!supabase || !user) return

    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          // Fallback (e.g. migration not applied yet): use Google metadata.
          const meta = googleMetadata(user)
          setDisplayName(meta.displayName)
          setAvatarUrl(meta.avatarUrl)
        } else {
          setProfile(data)
          setDisplayName(data.display_name)
          setAvatarUrl(data.avatar_url)
        }
      })
  }, [user])

  const saveDisplayName = async () => {
    if (!supabase || !user) return
    setSaving(true)
    const { data, error } = await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          display_name: displayName,
          avatar_url: profile?.avatar_url ?? googleMetadata(user).avatarUrl,
        },
        { onConflict: 'id' },
      )
      .select()
      .single()

    if (!error && data) {
      setProfile(data)
      setStatus('saved')
    } else {
      setStatus('error')
    }
    setSaving(false)
    setTimeout(() => setStatus('idle'), 2000)
  }

  if (!user) {
    return (
      <main className="page">
        <div className="card">
          <h1>Not signed in</h1>
        </div>
      </main>
    )
  }

  return (
    <main className="page">
      <div className="card">
        {avatarUrl && (
          <img
            className="avatar"
            src={avatarUrl}
            alt={displayName || 'Profile picture'}
          />
        )}
        <h1>{displayName || 'Your profile'}</h1>
        <label htmlFor="display-name">Display name</label>
        <input
          id="display-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="How your name appears on your Practices"
        />
        <button
          className="primary"
          disabled={saving}
          onClick={() => void saveDisplayName()}
        >
          {saving ? 'Saving…' : status === 'saved' ? 'Saved!' : 'Save'}
        </button>
        {status === 'error' && (
          <p className="muted">Couldn't save — check your connection.</p>
        )}
        <hr />
        <Link to="/my-setups">My setups</Link>
        <Link to="/agents">Agent instructions and temporary grants</Link>
      </div>
    </main>
  )
}
