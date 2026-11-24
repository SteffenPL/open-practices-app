import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

export function Header() {
  const { session, signInWithGoogle, signOut } = useAuth()
  const user = session?.user

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link to="/" className="brand">
          Open Practices
        </Link>
        <nav className="site-nav">
          {user ? (
            <>
              <Link to="/new" className="primary-as-link">
                New practice
              </Link>
              <Link to="/profile" className="nav-avatar">
                <img
                  className="avatar avatar-sm"
                  src={
                    (user.user_metadata?.picture as string) ??
                    '/favicon.svg'
                  }
                  alt="Your profile"
                />
              </Link>
              <button className="link-like" onClick={() => void signOut()}>
                Sign out
              </button>
            </>
          ) : (
            <button
              className="primary"
              onClick={() => void signInWithGoogle()}
            >
              Sign in with Google
            </button>
          )}
        </nav>
      </div>
    </header>
  )
}
