import { grantExpiry, openGrant, sealGrant } from '../functions/agent/grant.ts'

Deno.test('sealed grants preserve their short expiry and reject changed ciphertext', async () => {
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'isolated-test-secret')
  const expires = Date.now() + 10_000
  const claims = {
    id: crypto.randomUUID(),
    session: 'isolated-session',
    expires,
  }
  const sealed = await sealGrant(claims)
  if (
    sealed.includes(claims.session) ||
    (await openGrant(sealed))?.id !== claims.id
  ) throw Error('Grant sealing failed')
  const [prefix, iv, body] = sealed.split('.')
  const tampered = [prefix, iv, (body[0] === 'A' ? 'B' : 'A') + body.slice(1)]
    .join('.')
  if (await openGrant(tampered)) throw Error('Changed envelope accepted')
  if (
    await openGrant(await sealGrant({ ...claims, expires: Date.now() - 1 }))
  ) throw Error('Expired envelope accepted')
  const sessionExpiry = Math.floor(Date.now() / 1000) + 60
  if (
    grantExpiry(
      'header.' + btoa(JSON.stringify({ exp: sessionExpiry })) + '.sig',
    ) !== sessionExpiry * 1000
  ) throw Error('Outlived session')
})
