import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

export function ProfileCard() {
  const { session, signOut } = useAuth()
  const user = session?.user
  const [profile, setProfile] = useState<Profile | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

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
          setDisplayName((user.user_metadata?.name as string) ?? '')
        } else {
          setProfile(data)
          setDisplayName(data.display_name)
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
          avatar_url:
            profile?.avatar_url ??
            (user.user_metadata?.picture as string) ??
            null,
        },
        { onConflict: 'id' },
      )
      .select()
      .single()

    if (!error && data) {
      setProfile(data)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
    setSaving(false)
  }

  if (!user) return null

  const avatarUrl =
    profile?.avatar_url ?? (user.user_metadata?.picture as string) ?? null

  return (
    <main className="center-screen">
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
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
        </button>
        <button onClick={() => void signOut()}>Sign out</button>
      </div>
    </main>
  )
}
