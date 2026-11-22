import { z } from 'zod';

export interface PasskeyEnv {
  DB: D1Database;
  API_KEY?: string;
  PII_TOKEN_KEY?: string;
  ENVIRONMENT?: string;
}

interface StoredPasskeyRow {
  slot: number;
  credential_id: string;
  public_key_spki: string;
  algorithm: number;
  sign_count: number;
  label: string;
  rp_id: string;
  created_at: string;
  last_used_at: string | null;
}

interface StoredChallengeRow {
  challenge: string;
  purpose: 'register' | 'login';
  rp_id: string;
  origin: string;
  expires_at: string;
  created_at: string;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
export const SESSION_TOKEN_PREFIX = 'rj_sess.';
export const SESSION_COOKIE_NAME = 'rj_session';

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...extraHeaders,
    },
  });
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlToBytes(b64url: string): Uint8Array {
  const normalized = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLen);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function sha256Bytes(data: Uint8Array | string): Promise<Uint8Array> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(digest);
}

/**
 * Convert an ASN.1 DER-encoded ECDSA P-256 signature into 64-byte IEEE P1363 (r || s) format
 * required by Web Crypto `crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, ...)`.
 */
export function derEcdsaToP1363(sig: Uint8Array): Uint8Array | null {
  if (sig.length === 64 && sig[0] !== 0x30) {
    return sig;
  }
  if (sig.length < 8 || sig[0] !== 0x30) {
    return null;
  }

  let offset = 1;
  let seqLen = sig[offset++];
  if (seqLen & 0x80) {
    const lenBytes = seqLen & 0x7f;
    if (lenBytes !== 1 || offset >= sig.length) return null;
    seqLen = sig[offset++];
  }
  if (offset + seqLen > sig.length) {
    return null;
  }

  if (sig[offset++] !== 0x02) return null;
  const rLen = sig[offset++];
  if (offset + rLen > sig.length) return null;
  let rBytes = sig.slice(offset, offset + rLen);
  offset += rLen;

  if (sig[offset++] !== 0x02) return null;
  const sLen = sig[offset++];
  if (offset + sLen > sig.length) return null;
  let sBytes = sig.slice(offset, offset + sLen);

  while (rBytes.length > 32 && rBytes[0] === 0x00) {
    rBytes = rBytes.slice(1);
  }
  while (sBytes.length > 32 && sBytes[0] === 0x00) {
    sBytes = sBytes.slice(1);
  }
  if (rBytes.length > 32 || sBytes.length > 32) {
    return null;
  }

  const out = new Uint8Array(64);
  out.set(rBytes, 32 - rBytes.length);
  out.set(sBytes, 64 - sBytes.length);
  return out;
}

export async function importWebAuthnPublicKey(
  publicKeySpkiB64Url: string,
  algorithm: number
): Promise<CryptoKey> {
  const spkiBytes = base64UrlToBytes(publicKeySpkiB64Url);
  if (algorithm === -7) {
    return crypto.subtle.importKey(
      'spki',
      spkiBytes,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
  }
  if (algorithm === -257) {
    return crypto.subtle.importKey(
      'spki',
      spkiBytes,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
  }
  throw new Error(`Unsupported COSE algorithm: ${algorithm}`);
}

export async function verifyWebAuthnAssertionSignature(params: {
  publicKeySpkiB64Url: string;
  algorithm: number;
  authenticatorData: Uint8Array;
  clientDataJSON: Uint8Array;
  signature: Uint8Array;
}): Promise<boolean> {
  const key = await importWebAuthnPublicKey(params.publicKeySpkiB64Url, params.algorithm);
  const clientDataHash = await sha256Bytes(params.clientDataJSON);
  const signedData = new Uint8Array(params.authenticatorData.length + clientDataHash.length);
  signedData.set(params.authenticatorData, 0);
  signedData.set(clientDataHash, params.authenticatorData.length);

  if (params.algorithm === -7) {
    const p1363 = derEcdsaToP1363(params.signature);
    if (!p1363) return false;
    return crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      p1363,
      signedData
    );
  }
  if (params.algorithm === -257) {
    return crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      key,
      params.signature,
      signedData
    );
  }
  return false;
}

async function parseAndVerifyAuthenticatorData(
  authDataBytes: Uint8Array,
  expectedRpId: string
): Promise<{ ok: true; flags: number; signCount: number } | { ok: false; reason: string }> {
  if (authDataBytes.length < 37) {
    return { ok: false, reason: 'authenticatorData shorter than 37 bytes' };
  }
  const rpIdHash = authDataBytes.slice(0, 32);
  const expectedRpIdHash = await sha256Bytes(expectedRpId);
  if (!crypto.subtle.timingSafeEqual(rpIdHash, expectedRpIdHash)) {
    return { ok: false, reason: 'RP ID hash mismatch in authenticatorData' };
  }
  const flags = authDataBytes[32];
  const userPresent = (flags & 0x01) !== 0;
  if (!userPresent) {
    return { ok: false, reason: 'User Present (UP) flag not set in authenticatorData' };
  }
  const view = new DataView(authDataBytes.buffer, authDataBytes.byteOffset, authDataBytes.byteLength);
  const signCount = view.getUint32(33, false);
  return { ok: true, flags, signCount };
}

async function getSessionSigningKey(env: { API_KEY?: string; PII_TOKEN_KEY?: string }): Promise<CryptoKey> {
  const secret = `${env.API_KEY ?? ''}:passkey_session:${env.PII_TOKEN_KEY ?? ''}`;
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function issuePasskeySessionToken(
  credentialId: string,
  env: { API_KEY?: string; PII_TOKEN_KEY?: string },
  nowMs = Date.now()
): Promise<{ token: string; expiresAt: string }> {
  const expMs = nowMs + SESSION_TTL_MS;
  const payload = {
    sub: 'owner',
    cred: credentialId,
    iat: nowMs,
    exp: expMs,
  };
  const payloadB64 = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await getSessionSigningKey(env);
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  const sigB64 = bytesToBase64Url(new Uint8Array(sigBuf));
  return {
    token: `${SESSION_TOKEN_PREFIX}${payloadB64}.${sigB64}`,
    expiresAt: new Date(expMs).toISOString(),
  };
}

export async function verifyPasskeySessionToken(
  token: string,
  env: { DB?: D1Database; API_KEY?: string; PII_TOKEN_KEY?: string },
  nowMs = Date.now()
): Promise<{ ok: true; credentialId: string } | { ok: false }> {
  if (!env.API_KEY?.trim() || !token.startsWith(SESSION_TOKEN_PREFIX)) {
    return { ok: false };
  }
  const rest = token.slice(SESSION_TOKEN_PREFIX.length);
  const dotIdx = rest.indexOf('.');
  if (dotIdx <= 0 || dotIdx === rest.length - 1) {
    return { ok: false };
  }
  const payloadB64 = rest.slice(0, dotIdx);
  const sigB64 = rest.slice(dotIdx + 1);

  let sigBytes: Uint8Array;
  try {
    sigBytes = base64UrlToBytes(sigB64);
  } catch {
    return { ok: false };
  }

  const key = await getSessionSigningKey(env);
  const validSig = await crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes,
    new TextEncoder().encode(payloadB64)
  );
  if (!validSig) {
    return { ok: false };
  }

  let parsed: { sub?: string; cred?: string; exp?: number };
  try {
    const jsonStr = new TextDecoder().decode(base64UrlToBytes(payloadB64));
    parsed = JSON.parse(jsonStr) as { sub?: string; cred?: string; exp?: number };
  } catch {
    return { ok: false };
  }

  if (
    parsed.sub !== 'owner' ||
    typeof parsed.cred !== 'string' ||
    parsed.cred.length === 0 ||
    typeof parsed.exp !== 'number' ||
    parsed.exp <= nowMs
  ) {
    return { ok: false };
  }

  if (env.DB) {
    const enrolled = await getEnrolledPasskey(env.DB);
    if (!enrolled || enrolled.credential_id !== parsed.cred) {
      return { ok: false };
    }
  }

  return { ok: true, credentialId: parsed.cred };
}

export async function getEnrolledPasskey(db: D1Database): Promise<StoredPasskeyRow | null> {
  try {
    const row = await db
      .prepare(
        'SELECT slot, credential_id, public_key_spki, algorithm, sign_count, label, rp_id, created_at, last_used_at FROM passkey_credentials WHERE slot = 1 LIMIT 1'
      )
      .first<StoredPasskeyRow>();
    return row ?? null;
  } catch {
    return null;
  }
}

const RegisterOptionsSchema = z
  .object({
    label: z.string().trim().min(1).max(100).default('Owner Passkey'),
  })
  .default({ label: 'Owner Passkey' });

const RegisterVerifySchema = z.object({
  credentialId: z.string().min(1).max(1024),
  clientDataJSON: z.string().min(1).max(8192),
  authenticatorData: z.string().min(1).max(8192),
  publicKeySpki: z.string().min(1).max(4096),
  algorithm: z.number().int().refine((v) => v === -7 || v === -257, {
    message: 'Only ES256 (-7) and RS256 (-257) are supported',
  }),
  label: z.string().trim().min(1).max(100).default('Owner Passkey'),
});

const LoginVerifySchema = z.object({
  credentialId: z.string().min(1).max(1024),
  clientDataJSON: z.string().min(1).max(8192),
  authenticatorData: z.string().min(1).max(8192),
  signature: z.string().min(1).max(4096),
});

function buildSessionCookie(token: string, maxAgeSeconds: number, isSecure: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isSecure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export async function handlePasskeyRoute(
  request: Request,
  env: PasskeyEnv,
  nowMs = Date.now()
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/auth/passkey/')) {
    return null;
  }

  const rpId = url.hostname;
  const origin = url.origin;
  const isSecure = url.protocol === 'https:';

  // Opportunistically purge expired challenges
  const nowIso = new Date(nowMs).toISOString();
  await env.DB.prepare('DELETE FROM passkey_challenges WHERE expires_at <= ?')
    .bind(nowIso)
    .run()
    .catch(() => null);

  // 1. GET /auth/passkey/status
  if (url.pathname === '/auth/passkey/status' && request.method === 'GET') {
    const enrolled = await getEnrolledPasskey(env.DB);
    if (!enrolled) {
      return jsonResponse({
        enrolled: false,
        registration_locked: false,
        rp_id: rpId,
      });
    }
    return jsonResponse({
      enrolled: true,
      registration_locked: true,
      rp_id: enrolled.rp_id,
    });
  }

  // 2. POST /auth/passkey/register/options
  if (url.pathname === '/auth/passkey/register/options' && request.method === 'POST') {
    const enrolled = await getEnrolledPasskey(env.DB);
    if (enrolled) {
      return jsonResponse(
        {
          error: 'Passkey registration is permanently locked: an owner passkey has already been enrolled.',
          registration_locked: true,
        },
        403
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = RegisterOptionsSchema.safeParse(body ?? {});
    const label = parsed.success ? parsed.data.label : 'Owner Passkey';

    const challengeBytes = crypto.getRandomValues(new Uint8Array(32));
    const challenge = bytesToBase64Url(challengeBytes);
    const expiresAt = new Date(nowMs + CHALLENGE_TTL_MS).toISOString();

    await env.DB.prepare(
      'INSERT INTO passkey_challenges (challenge, purpose, rp_id, origin, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
      .bind(challenge, 'register', rpId, origin, expiresAt, nowIso)
      .run();

    const userId = bytesToBase64Url(new TextEncoder().encode('relationship-journal-single-owner'));

    return jsonResponse({
      registration_locked: false,
      options: {
        challenge,
        rp: {
          name: 'Relationship Journal',
          id: rpId,
        },
        user: {
          id: userId,
          name: 'owner',
          displayName: label,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256 (P-256)
          { type: 'public-key', alg: -257 }, // RS256
        ],
        timeout: 60000,
        attestation: 'none',
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
      },
    });
  }

  // 3. POST /auth/passkey/register/verify
  if (url.pathname === '/auth/passkey/register/verify' && request.method === 'POST') {
    const existing = await getEnrolledPasskey(env.DB);
    if (existing) {
      return jsonResponse(
        {
          error: 'Passkey registration is permanently locked: an owner passkey has already been enrolled.',
          registration_locked: true,
        },
        403
      );
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = RegisterVerifySchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonResponse({ error: 'Invalid registration payload', details: parsed.error.flatten() }, 400);
    }

    const { credentialId, clientDataJSON, authenticatorData, publicKeySpki, algorithm, label } = parsed.data;

    let clientData: { type?: string; challenge?: string; origin?: string };
    let authDataBytes: Uint8Array;
    try {
      const clientDataBytes = base64UrlToBytes(clientDataJSON);
      clientData = JSON.parse(new TextDecoder().decode(clientDataBytes)) as {
        type?: string;
        challenge?: string;
        origin?: string;
      };
      authDataBytes = base64UrlToBytes(authenticatorData);
    } catch {
      return jsonResponse({ error: 'Malformed base64url or clientDataJSON' }, 400);
    }

    if (clientData.type !== 'webauthn.create' || typeof clientData.challenge !== 'string') {
      return jsonResponse({ error: 'Invalid WebAuthn clientData.type or missing challenge' }, 400);
    }

    const challengeRow = await env.DB.prepare(
      "SELECT challenge, purpose, rp_id, origin, expires_at, created_at FROM passkey_challenges WHERE challenge = ? AND purpose = 'register' LIMIT 1"
    )
      .bind(clientData.challenge)
      .first<StoredChallengeRow>();

    if (!challengeRow) {
      return jsonResponse({ error: 'Unknown or already-consumed registration challenge' }, 400);
    }

    // Consume challenge immediately (single-use)
    await env.DB.prepare('DELETE FROM passkey_challenges WHERE challenge = ?')
      .bind(clientData.challenge)
      .run();

    if (Date.parse(challengeRow.expires_at) <= nowMs) {
      return jsonResponse({ error: 'Registration challenge expired' }, 400);
    }
    if (clientData.origin !== challengeRow.origin) {
      return jsonResponse({ error: `Origin mismatch: expected ${challengeRow.origin}` }, 400);
    }

    const authCheck = await parseAndVerifyAuthenticatorData(authDataBytes, challengeRow.rp_id);
    if (!authCheck.ok) {
      return jsonResponse({ error: authCheck.reason }, 400);
    }

    // Validate that publicKeySpki is a genuine importable SPKI key for the declared algorithm
    try {
      await importWebAuthnPublicKey(publicKeySpki, algorithm);
    } catch (err) {
      return jsonResponse(
        { error: `Invalid SPKI public key: ${err instanceof Error ? err.message : 'import failed'}` },
        400
      );
    }

    // Atomic single-slot insert (`slot = 1` enforced by primary key + CHECK constraint)
    try {
      await env.DB.prepare(
        'INSERT INTO passkey_credentials (slot, credential_id, public_key_spki, algorithm, sign_count, label, rp_id, created_at, last_used_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
        .bind(
          credentialId,
          publicKeySpki,
          algorithm,
          authCheck.signCount,
          label,
          challengeRow.rp_id,
          nowIso,
          nowIso
        )
        .run();
    } catch {
      return jsonResponse(
        {
          error: 'Passkey registration is permanently locked: an owner passkey has already been enrolled.',
          registration_locked: true,
        },
        403
      );
    }

    const session = await issuePasskeySessionToken(credentialId, env, nowMs);
    const cookie = buildSessionCookie(session.token, Math.floor(SESSION_TTL_MS / 1000), isSecure);

    return jsonResponse(
      {
        status: 'enrolled_and_locked',
        registration_locked: true,
        credential: {
          label,
          algorithm,
          created_at: nowIso,
        },
        session_token: session.token,
        expires_at: session.expiresAt,
      },
      201,
      { 'Set-Cookie': cookie }
    );
  }

  // 4. POST /auth/passkey/login/options
  if (url.pathname === '/auth/passkey/login/options' && request.method === 'POST') {
    const enrolled = await getEnrolledPasskey(env.DB);
    if (!enrolled) {
      return jsonResponse(
        {
          error: 'No passkey enrolled yet. Register the owner passkey first.',
          enrolled: false,
        },
        404
      );
    }

    const challengeBytes = crypto.getRandomValues(new Uint8Array(32));
    const challenge = bytesToBase64Url(challengeBytes);
    const expiresAt = new Date(nowMs + CHALLENGE_TTL_MS).toISOString();

    await env.DB.prepare(
      'INSERT INTO passkey_challenges (challenge, purpose, rp_id, origin, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
      .bind(challenge, 'login', enrolled.rp_id, origin, expiresAt, nowIso)
      .run();

    return jsonResponse({
      enrolled: true,
      registration_locked: true,
      options: {
        challenge,
        rpId: enrolled.rp_id,
        timeout: 60000,
        userVerification: 'preferred',
        allowCredentials: [
          {
            type: 'public-key',
            id: enrolled.credential_id,
          },
        ],
      },
    });
  }

  // 5. POST /auth/passkey/login/verify
  if (url.pathname === '/auth/passkey/login/verify' && request.method === 'POST') {
    const enrolled = await getEnrolledPasskey(env.DB);
    if (!enrolled) {
      return jsonResponse({ error: 'No passkey enrolled yet.' }, 404);
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = LoginVerifySchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonResponse({ error: 'Invalid login payload', details: parsed.error.flatten() }, 400);
    }

    const { credentialId, clientDataJSON, authenticatorData, signature } = parsed.data;

    // Strictly accept ONLY the single enrolled credential_id
    if (credentialId !== enrolled.credential_id) {
      return jsonResponse(
        {
          error: 'Access denied: this passkey does not match the single enrolled owner passkey.',
        },
        403
      );
    }

    let clientData: { type?: string; challenge?: string; origin?: string };
    let clientDataBytes: Uint8Array;
    let authDataBytes: Uint8Array;
    let signatureBytes: Uint8Array;
    try {
      clientDataBytes = base64UrlToBytes(clientDataJSON);
      clientData = JSON.parse(new TextDecoder().decode(clientDataBytes)) as {
        type?: string;
        challenge?: string;
        origin?: string;
      };
      authDataBytes = base64UrlToBytes(authenticatorData);
      signatureBytes = base64UrlToBytes(signature);
    } catch {
      return jsonResponse({ error: 'Malformed base64url in assertion payload' }, 400);
    }

    if (clientData.type !== 'webauthn.get' || typeof clientData.challenge !== 'string') {
      return jsonResponse({ error: 'Invalid WebAuthn clientData.type or missing challenge' }, 400);
    }

    const challengeRow = await env.DB.prepare(
      "SELECT challenge, purpose, rp_id, origin, expires_at, created_at FROM passkey_challenges WHERE challenge = ? AND purpose = 'login' LIMIT 1"
    )
      .bind(clientData.challenge)
      .first<StoredChallengeRow>();

    if (!challengeRow) {
      return jsonResponse({ error: 'Unknown or already-consumed login challenge' }, 400);
    }

    // Consume single-use challenge immediately
    await env.DB.prepare('DELETE FROM passkey_challenges WHERE challenge = ?')
      .bind(clientData.challenge)
      .run();

    if (Date.parse(challengeRow.expires_at) <= nowMs) {
      return jsonResponse({ error: 'Login challenge expired' }, 400);
    }
    if (clientData.origin !== challengeRow.origin) {
      return jsonResponse({ error: `Origin mismatch: expected ${challengeRow.origin}` }, 400);
    }

    const authCheck = await parseAndVerifyAuthenticatorData(authDataBytes, enrolled.rp_id);
    if (!authCheck.ok) {
      return jsonResponse({ error: authCheck.reason }, 401);
    }

    if ((enrolled.sign_count > 0 || authCheck.signCount > 0) && authCheck.signCount <= enrolled.sign_count) {
      return jsonResponse(
        { error: 'Passkey signature counter regression detected (potential cloned authenticator).' },
        401
      );
    }

    const sigValid = await verifyWebAuthnAssertionSignature({
      publicKeySpkiB64Url: enrolled.public_key_spki,
      algorithm: enrolled.algorithm,
      authenticatorData: authDataBytes,
      clientDataJSON: clientDataBytes,
      signature: signatureBytes,
    });

    if (!sigValid) {
      return jsonResponse({ error: 'Invalid passkey cryptographic signature' }, 401);
    }

    await env.DB.prepare(
      'UPDATE passkey_credentials SET sign_count = ?, last_used_at = ? WHERE slot = 1'
    )
      .bind(authCheck.signCount, nowIso)
      .run();

    const session = await issuePasskeySessionToken(enrolled.credential_id, env, nowMs);
    const cookie = buildSessionCookie(session.token, Math.floor(SESSION_TTL_MS / 1000), isSecure);

    return jsonResponse(
      {
        status: 'authenticated',
        credential: {
          label: enrolled.label,
          last_used_at: nowIso,
        },
        session_token: session.token,
        expires_at: session.expiresAt,
      },
      200,
      { 'Set-Cookie': cookie }
    );
  }

  // 6. POST /auth/passkey/logout
  if (url.pathname === '/auth/passkey/logout' && request.method === 'POST') {
    const clearCookie = buildSessionCookie('', 0, isSecure);
    return jsonResponse({ status: 'logged_out' }, 200, { 'Set-Cookie': clearCookie });
  }

  return jsonResponse({ error: 'Not Found' }, 404);
}
