export type AuthResult =
  | { ok: true }
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

/**
 * Fail-closed Bearer token verification using fixed-length SHA-256 digests
 * and `crypto.subtle.timingSafeEqual` to prevent timing side-channels.
 */
export async function requireBearerAuth(request: Request, env: { API_KEY?: string }): Promise<AuthResult> {
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
  if (!authHeader) {
    return { ok: false, response: unauthorizedResponse() };
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const providedKey = match?.[1]?.trim();
  if (!providedKey) {
    return { ok: false, response: unauthorizedResponse() };
  }

  const [expectedHash, providedHash] = await Promise.all([
    sha256Bytes(expectedKey),
    sha256Bytes(providedKey),
  ]);

  if (!crypto.subtle.timingSafeEqual(expectedHash, providedHash)) {
    return { ok: false, response: unauthorizedResponse() };
  }

  return { ok: true };
}
