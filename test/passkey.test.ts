import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { bytesToBase64Url } from '../src/passkey';

async function buildAuthenticatorData(rpId: string, signCount: number, flags = 0x05): Promise<Uint8Array> {
  const rpIdHash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId))
  );
  const authData = new Uint8Array(37);
  authData.set(rpIdHash, 0);
  authData[32] = flags; // 0x01 (UP) | 0x04 (UV)
  const view = new DataView(authData.buffer);
  view.setUint32(33, signCount, false);
  return authData;
}

/**
 * Wrap a 64-byte IEEE P1363 (r || s) ECDSA signature into ASN.1 DER format,
 * matching what hardware/platform WebAuthn authenticators produce.
 */
function p1363ToDer(p1363: Uint8Array): Uint8Array {
  const encodeInt = (raw: Uint8Array): Uint8Array => {
    let start = 0;
    while (start < raw.length - 1 && raw[start] === 0) start++;
    const trimmed = raw.slice(start);
    if (trimmed[0] & 0x80) {
      const padded = new Uint8Array(trimmed.length + 1);
      padded[0] = 0x00;
      padded.set(trimmed, 1);
      return padded;
    }
    return trimmed;
  };
  const r = encodeInt(p1363.slice(0, 32));
  const s = encodeInt(p1363.slice(32, 64));
  const seqLen = 2 + r.length + 2 + s.length;
  const der = new Uint8Array(2 + seqLen);
  let idx = 0;
  der[idx++] = 0x30;
  der[idx++] = seqLen;
  der[idx++] = 0x02;
  der[idx++] = r.length;
  der.set(r, idx);
  idx += r.length;
  der[idx++] = 0x02;
  der[idx++] = s.length;
  der.set(s, idx);
  return der;
}

describe('Single-owner Passkey enrollment lock, WebAuthn verification, and frontend UI', () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM passkey_challenges'),
      env.DB.prepare('DELETE FROM passkey_credentials'),
    ]);
  });

  it('serves the Passkey frontend HTML at GET / and GET /app', async () => {
    const rootRes = await SELF.fetch('https://example.com/');
    expect(rootRes.status).toBe(200);
    expect(rootRes.headers.get('Content-Type')).toContain('text/html');
    const html = await rootRes.text();
    expect(html).toContain('Relationship Journal');
    expect(html).toContain('/auth/passkey/register/options');

    const appRes = await SELF.fetch('https://example.com/app');
    expect(appRes.status).toBe(200);
    expect(appRes.headers.get('Content-Type')).toContain('text/html');
  });

  it('enrolls one Passkey, permanently locks further registrations, and only allows the enrolled Passkey to log in and call /mcp', async () => {
    // 1. Initial status is unenrolled and unlocked
    const status0 = await (await SELF.fetch('https://example.com/auth/passkey/status')).json() as {
      enrolled: boolean;
      registration_locked: boolean;
    };
    expect(status0.enrolled).toBe(false);
    expect(status0.registration_locked).toBe(false);

    // 2. Request registration options
    const regOptRes = await SELF.fetch('https://example.com/auth/passkey/register/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'MacBook Pro Touch ID' }),
    });
    expect(regOptRes.status).toBe(200);
    const regOptJson = (await regOptRes.json()) as {
      registration_locked: boolean;
      options: { challenge: string; rp: { id: string } };
    };
    expect(regOptJson.registration_locked).toBe(false);
    expect(regOptJson.options.rp.id).toBe('example.com');

    // 3. Generate real ECDSA P-256 keypair for the owner Passkey
    const ownerKeyPair = (await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    )) as CryptoKeyPair;
    const spkiBuf = (await crypto.subtle.exportKey('spki', ownerKeyPair.publicKey)) as ArrayBuffer;
    const ownerSpkiB64 = bytesToBase64Url(new Uint8Array(spkiBuf));
    const ownerCredId = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(24)));

    const regClientData = bytesToBase64Url(
      new TextEncoder().encode(
        JSON.stringify({
          type: 'webauthn.create',
          challenge: regOptJson.options.challenge,
          origin: 'https://example.com',
        })
      )
    );
    const regAuthData = bytesToBase64Url(await buildAuthenticatorData('example.com', 1));

    const regVerifyRes = await SELF.fetch('https://example.com/auth/passkey/register/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credentialId: ownerCredId,
        clientDataJSON: regClientData,
        authenticatorData: regAuthData,
        publicKeySpki: ownerSpkiB64,
        algorithm: -7,
        label: 'MacBook Pro Touch ID',
      }),
    });
    expect(regVerifyRes.status).toBe(201);
    const regVerifyJson = (await regVerifyRes.json()) as {
      status: string;
      registration_locked: boolean;
      session_token: string;
    };
    expect(regVerifyJson.status).toBe('enrolled_and_locked');
    expect(regVerifyJson.registration_locked).toBe(true);
    expect(regVerifyJson.session_token).toMatch(/^rj_sess\./);

    // 4. Status now reports enrolled & registration_locked without leaking credential label or timestamps
    const status1 = (await (await SELF.fetch('https://example.com/auth/passkey/status')).json()) as {
      enrolled: boolean;
      registration_locked: boolean;
      credential?: unknown;
    };
    expect(status1.enrolled).toBe(true);
    expect(status1.registration_locked).toBe(true);
    expect(status1.credential).toBeUndefined();

    // 5. Any new registration attempt is blocked with 403 Forbidden
    const secondOptRes = await SELF.fetch('https://example.com/auth/passkey/register/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'Attacker Device' }),
    });
    expect(secondOptRes.status).toBe(403);

    const secondVerifyRes = await SELF.fetch('https://example.com/auth/passkey/register/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credentialId: 'attacker-cred-id',
        clientDataJSON: regClientData,
        authenticatorData: regAuthData,
        publicKeySpki: ownerSpkiB64,
        algorithm: -7,
        label: 'Attacker Device',
      }),
    });
    expect(secondVerifyRes.status).toBe(403);

    // 6. Login options strictly specify ONLY the single enrolled credential_id
    const loginOptRes = await SELF.fetch('https://example.com/auth/passkey/login/options', {
      method: 'POST',
    });
    expect(loginOptRes.status).toBe(200);
    const loginOptJson = (await loginOptRes.json()) as {
      options: {
        challenge: string;
        allowCredentials: Array<{ id: string; type: string }>;
      };
    };
    expect(loginOptJson.options.allowCredentials).toEqual([
      { type: 'public-key', id: ownerCredId },
    ]);

    // 7. Attempting to log in with a different Passkey credential_id is rejected with 403
    const loginClientDataBytes = new TextEncoder().encode(
      JSON.stringify({
        type: 'webauthn.get',
        challenge: loginOptJson.options.challenge,
        origin: 'https://example.com',
      })
    );
    const loginAuthDataBytes = await buildAuthenticatorData('example.com', 2);

    const wrongCredRes = await SELF.fetch('https://example.com/auth/passkey/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credentialId: 'unregistered-passkey-id',
        clientDataJSON: bytesToBase64Url(loginClientDataBytes),
        authenticatorData: bytesToBase64Url(loginAuthDataBytes),
        signature: bytesToBase64Url(new Uint8Array(64)),
      }),
    });
    expect(wrongCredRes.status).toBe(403);

    // 8. Sign assertion with the genuine enrolled Passkey (ASN.1 DER ECDSA signature)
    const clientDataHash = new Uint8Array(
      await crypto.subtle.digest('SHA-256', loginClientDataBytes)
    );
    const signedPayload = new Uint8Array(loginAuthDataBytes.length + clientDataHash.length);
    signedPayload.set(loginAuthDataBytes, 0);
    signedPayload.set(clientDataHash, loginAuthDataBytes.length);

    const p1363SigBuf = (await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      ownerKeyPair.privateKey,
      signedPayload
    )) as ArrayBuffer;
    const derSig = p1363ToDer(new Uint8Array(p1363SigBuf));

    const loginVerifyRes = await SELF.fetch('https://example.com/auth/passkey/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credentialId: ownerCredId,
        clientDataJSON: bytesToBase64Url(loginClientDataBytes),
        authenticatorData: bytesToBase64Url(loginAuthDataBytes),
        signature: bytesToBase64Url(derSig),
      }),
    });
    expect(loginVerifyRes.status).toBe(200);
    const loginVerifyJson = (await loginVerifyRes.json()) as {
      status: string;
      session_token: string;
    };
    expect(loginVerifyJson.status).toBe('authenticated');
    expect(loginVerifyJson.session_token).toMatch(/^rj_sess\./);
    const setCookieHeader = loginVerifyRes.headers.get('Set-Cookie') ?? '';
    expect(setCookieHeader).toContain('rj_session=rj_sess.');

    // 9. Use the Passkey session token (both Bearer and Cookie) to call protected /mcp
    const mcpBearerRes = await SELF.fetch('https://example.com/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${loginVerifyJson.session_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', params: {} }),
    });
    expect(mcpBearerRes.status).toBe(200);

    const mcpCookieRes = await SELF.fetch('https://example.com/mcp', {
      method: 'POST',
      headers: {
        Cookie: `rj_session=${loginVerifyJson.session_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping', params: {} }),
    });
    expect(mcpCookieRes.status).toBe(200);

    // 10. Signature counter regression (clone detection: signCount=2 again) is rejected with 401
    const replayOptRes = await SELF.fetch('https://example.com/auth/passkey/login/options', {
      method: 'POST',
    });
    const replayOptJson = (await replayOptRes.json()) as { options: { challenge: string } };
    const replayClientBytes = new TextEncoder().encode(
      JSON.stringify({
        type: 'webauthn.get',
        challenge: replayOptJson.options.challenge,
        origin: 'https://example.com',
      })
    );
    const replayClientHash = new Uint8Array(
      await crypto.subtle.digest('SHA-256', replayClientBytes)
    );
    const replaySigned = new Uint8Array(loginAuthDataBytes.length + replayClientHash.length);
    replaySigned.set(loginAuthDataBytes, 0); // still signCount = 2
    replaySigned.set(replayClientHash, loginAuthDataBytes.length);
    const replaySig = p1363ToDer(
      new Uint8Array(
        (await crypto.subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          ownerKeyPair.privateKey,
          replaySigned
        )) as ArrayBuffer
      )
    );
    const replayVerifyRes = await SELF.fetch('https://example.com/auth/passkey/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credentialId: ownerCredId,
        clientDataJSON: bytesToBase64Url(replayClientBytes),
        authenticatorData: bytesToBase64Url(loginAuthDataBytes),
        signature: bytesToBase64Url(replaySig),
      }),
    });
    expect(replayVerifyRes.status).toBe(401);
  });
});
