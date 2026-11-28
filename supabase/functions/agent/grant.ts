const prefix = 'opg1.'
const encoder = new TextEncoder()
const aad = encoder.encode('open-practices/agent/grant/v1')
const pack = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join('')).replaceAll(
    '+',
    '-',
  ).replaceAll('/', '_').replace(/=+$/, '')
const unpack = (text: string) =>
  Uint8Array.from(
    atob(text.replaceAll('-', '+').replaceAll('_', '/')),
    (c) => c.charCodeAt(0),
  )
let key: Promise<CryptoKey> | undefined
function grantKey() {
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!secret) throw new Error('Agent grants unavailable')
  return key ??= crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'HKDF',
    false,
    ['deriveKey'],
  ).then((root) =>
    crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: aad,
        info: encoder.encode('bearer encryption'),
      },
      root,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    )
  )
}
interface Claims {
  id: string
  session: string
  expires: number
}
export function isGrant(token: string) {
  return token.startsWith(prefix)
}
export async function sealGrant(claims: Claims) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    await grantKey(),
    encoder.encode(JSON.stringify(claims)),
  )
  return prefix + pack(iv) + '.' + pack(new Uint8Array(ciphertext))
}
export async function openGrant(token: string): Promise<Claims | null> {
  try {
    if (!isGrant(token) || token.length > 20000) return null
    const [iv, body, extra] = token.slice(prefix.length).split('.')
    if (!iv || !body || extra) return null
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unpack(iv), additionalData: aad },
      await grantKey(),
      unpack(body),
    )
    const claims = JSON.parse(new TextDecoder().decode(plaintext)) as Claims
    return claims.expires > Date.now() && claims.id && claims.session
      ? claims
      : null
  } catch {
    return null
  }
}
export function grantExpiry(jwt: string) {
  const payload = JSON.parse(
    new TextDecoder().decode(unpack(jwt.split('.')[1])),
  )
  // Stay inside the 30-minute DB limit even if client and database clocks differ.
  return Math.min(Date.now() + 15 * 60 * 1000, Number(payload.exp) * 1000)
}
