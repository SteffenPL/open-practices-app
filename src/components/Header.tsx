import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

type Props = {
  theme: 'day' | 'night'
  onThemeChange: (theme: 'day' | 'night') => void
}

function ProfileSettingsIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="8" r="3.2" /><path d="M3.8 19c.4-3.2 2.5-5 6.2-5 1.5 0 2.7.3 3.7.9M18 14.5l.7 1.3 1.5.3v1.5l-1.3.8-.1 1.5-1.4.5-1.1-1-1.4.2-.8-1.3.5-1.4-.7-1.2.8-1.3 1.5.1 1-1z" /></svg>
}

export function Header({ theme, onThemeChange }: Props) {
  const { session, signInWithGoogle, signOut } = useAuth()
  const userPicture = session?.user.user_metadata?.picture

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link to="/" className="brand" aria-label="Open Practices home">
          <span className="brand-mark" aria-hidden="true">OP</span>
          <span className="brand-name">Open Practices</span>
        </Link>
        <nav className="section-nav" aria-label="Explore Open Practices">
          <NavLink to="/" end>Practices</NavLink>
          <NavLink to="/tools">Tools</NavLink>
          <NavLink to="/my-setups">My setups</NavLink>
          <NavLink to="/intro">Introduction</NavLink>
          <NavLink to="/agents">Agents</NavLink>
        </nav>
        <nav className="site-nav" aria-label="Account and appearance">
          <div className="site-theme-switch" role="group" aria-label="Color theme">
            <button className={theme === 'day' ? 'is-active' : ''} aria-pressed={theme === 'day'} onClick={() => onThemeChange('day')}>Day</button>
            <button className={theme === 'night' ? 'is-active' : ''} aria-pressed={theme === 'night'} onClick={() => onThemeChange('night')}>Night</button>
          </div>
          <button className="site-login" onClick={() => void (session ? signOut() : signInWithGoogle())}>{session ? 'Sign out' : 'Log in'}</button>
          <Link to="/profile" className="site-profile-control" title="Profile and settings" aria-label="Profile and settings">
            {typeof userPicture === 'string' && userPicture ? <img src={userPicture} alt="" /> : <ProfileSettingsIcon />}
          </Link>
        </nav>
      </div>
    </header>
  )
}
