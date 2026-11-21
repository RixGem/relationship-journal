import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';

describe('Bearer authentication guardrail', () => {
  it('allows unauthenticated GET /health and GET / with minimal payload', async () => {
    const res = await SELF.fetch('https://example.com/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({
      status: 'ok',
      service: 'relationship-journal-api',
    });
  });

  it('rejects unauthenticated requests to all protected endpoints with 401', async () => {
    const endpoints: Array<{ method: string; path: string }> = [
      { method: 'GET', path: '/db/demo' },
      { method: 'GET', path: '/fixtures/verify' },
      { method: 'GET', path: '/mcp/tools' },
      { method: 'POST', path: '/ingest' },
      { method: 'GET', path: '/people/00000000-0000-4000-8000-000000000101/timeline' },
      { method: 'GET', path: '/people/00000000-0000-4000-8000-000000000101/signals' },
    ];

    for (const ep of endpoints) {
      const res = await SELF.fetch(`https://example.com${ep.path}`, { method: ep.method });
      expect(res.status).toBe(401);
      expect(res.headers.get('WWW-Authenticate')).toBe('Bearer');
    }
  });

  it('rejects wrong or malformed Bearer tokens with 401', async () => {
    const wrongRes = await SELF.fetch('https://example.com/db/demo', {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    expect(wrongRes.status).toBe(401);

    const basicRes = await SELF.fetch('https://example.com/db/demo', {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    });
    expect(basicRes.status).toBe(401);

    const emptyBearer = await SELF.fetch('https://example.com/db/demo', {
      headers: { Authorization: 'Bearer   ' },
    });
    expect(emptyBearer.status).toBe(401);
  });

  it('fails closed with 503 when API_KEY is not configured in env', async () => {
    const req = new Request('https://example.com/db/demo', {
      headers: { Authorization: `Bearer ${env.API_KEY}` },
    });
    const res = await worker.fetch(req, { DB: env.DB });
    expect(res.status).toBe(503);
  });

  it('grants access with the valid Bearer token', async () => {
    const res = await SELF.fetch('https://example.com/mcp/tools', {
      headers: { Authorization: `Bearer ${env.API_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tools: Array<{ name: string; endpoint: string }> };
    expect(body.tools.map((t) => t.endpoint)).toEqual([
      '/ingest',
      '/people/:id/timeline',
      '/people/:id/signals',
    ]);
  });
});
