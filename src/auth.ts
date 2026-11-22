import {
  SESSION_COOKIE_NAME,
  SESSION_TOKEN_PREFIX,
  verifyPasskeySessionToken,
} from './passkey';

export type AuthResult =
  | { ok: true; method?: 'api_key' | 'passkey_session' }
  | {
      ok: false;
      response: Response;
    };

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: {
      ...JSON_HEADERS,
      'WWW-Authenticate': 'Bearer',
    },
  });
}

async function sha256Bytes(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

function extractSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [k, ...vParts] = part.trim().split('=');
    if (k === SESSION_COOKIE_NAME) {
      const val = vParts.join('=').trim();
      if (val.startsWith(SESSION_TOKEN_PREFIX)) {
        return val;
      }
    }
  }
  return null;
}

/**
 * Fail-closed authentication supporting:
 * 1. Static Bearer `API_KEY` (timing-safe SHA-256 digest comparison for MCP & CLI clients)
 * 2. Passkey-issued HMAC session token (`rj_sess.*` via Bearer header or `rj_session` HttpOnly cookie)
 *    tied strictly to the single enrolled Passkey credential in D1.
 */
export async function requireBearerAuth(
  request: Request,
  env: { API_KEY?: string; PII_TOKEN_KEY?: string; DB?: D1Database }
): Promise<AuthResult> {
  const expectedKey = env.API_KEY?.trim();
  if (!expectedKey) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: 'Server authentication not configured' }), {
        status: 503,
        headers: JSON_HEADERS,
      }),
    };
  }

  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const providedKey = match?.[1]?.trim();
    if (!providedKey) {
      return { ok: false, response: unauthorizedResponse() };
    }

    if (providedKey.startsWith(SESSION_TOKEN_PREFIX)) {
      const sessionCheck = await verifyPasskeySessionToken(providedKey, env);
      if (sessionCheck.ok) {
        return { ok: true, method: 'passkey_session' };
      }
      return { ok: false, response: unauthorizedResponse() };
    }

    const [expectedHash, providedHash] = await Promise.all([
      sha256Bytes(expectedKey),
      sha256Bytes(providedKey),
    ]);

    if (!crypto.subtle.timingSafeEqual(expectedHash, providedHash)) {
      return { ok: false, response: unauthorizedResponse() };
    }

    return { ok: true, method: 'api_key' };
  }

  const cookieToken = extractSessionCookie(request.headers.get('Cookie'));
  if (cookieToken) {
    const sessionCheck = await verifyPasskeySessionToken(cookieToken, env);
    if (sessionCheck.ok) {
      return { ok: true, method: 'passkey_session' };
    }
  }

  return { ok: false, response: unauthorizedResponse() };
}
