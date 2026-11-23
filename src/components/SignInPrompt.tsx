import { useAuth } from '../auth/useAuth'

export function SignInPrompt() {
  const { signInWithGoogle } = useAuth()

  return (
    <main className="center-screen">
      <div className="card">
        <h1>Open Practices</h1>
        <p>
          A community where people publish their working practices — and
          readers can adopt them directly.
        </p>
        <button
          className="primary"
          onClick={() => void signInWithGoogle()}
        >
          Sign in with Google
        </button>
        <p className="muted">
          Browsing is open to everyone. Sign-in is only needed to publish.
        </p>
      </div>
    </main>
  )
}
