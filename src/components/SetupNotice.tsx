export function SetupNotice() {
  return (
    <main className="center-screen">
      <div className="card">
        <h1>Almost there</h1>
        <p>
          This deployment is not connected to a Supabase project yet. Set the{' '}
          <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>{' '}
          environment variables (locally in <code>.env.local</code>, on GitHub
          Pages as repository secrets) and redeploy.
        </p>
        <p>
          See the README in the repository for the full setup walkthrough.
        </p>
      </div>
    </main>
  )
}
