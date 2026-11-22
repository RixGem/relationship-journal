import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';

describe('Bearer authentication guardrail & public routes', () => {
  it('allows unauthenticated access to GET /health, GET /, GET /db/demo, and GET /fixtures/verify even in production', async () => {
    const healthRes = await SELF.fetch('https://example.com/health');
    expect(healthRes.status).toBe(200);
    const healthBody = (await healthRes.json()) as Record<string, unknown>;
    expect(healthBody).toEqual({
      status: 'ok',
      service: 'relationship-journal-api',
    });

    for (const path of ['/health', '/', '/db/demo', '/fixtures/verify']) {
      const res = await worker.fetch(new Request(`https://example.com${path}`), {
        DB: env.DB,
        API_KEY: env.API_KEY,
        ENVIRONMENT: 'production',
      });
      expect(res.status, `${path} without auth`).toBe(200);
    }
  });

  it('rejects unauthenticated requests to all protected endpoints with 401', async () => {
    const endpoints: Array<{ method: string; path: string }> = [
      { method: 'POST', path: '/mcp' },
      { method: 'GET', path: '/mcp' },
      { method: 'GET', path: '/mcp/tools' },
      { method: 'POST', path: '/ingest' },
      { method: 'GET', path: '/people/00000000-0000-4000-8000-000000000101/timeline' },
      { method: 'GET', path: '/people/00000000-0000-4000-8000-000000000101/signals' },
    ];

    for (const ep of endpoints) {
      const res = await SELF.fetch(`https://example.com${ep.path}`, { method: ep.method });
      expect(res.status, `${ep.method} ${ep.path}`).toBe(401);
      expect(res.headers.get('WWW-Authenticate')).toBe('Bearer');
    }
  });

  it('rejects wrong or malformed Bearer tokens with 401', async () => {
    const wrongRes = await SELF.fetch('https://example.com/mcp/tools', {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    expect(wrongRes.status).toBe(401);

    const basicRes = await SELF.fetch('https://example.com/mcp', {
      method: 'POST',
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    });
    expect(basicRes.status).toBe(401);

    const emptyBearer = await SELF.fetch('https://example.com/mcp/tools', {
      headers: { Authorization: 'Bearer   ' },
    });
    expect(emptyBearer.status).toBe(401);
  });

  it('fails closed with 503 when API_KEY is not configured in env', async () => {
    for (const ep of [
      { method: 'GET', path: '/mcp/tools' },
      { method: 'POST', path: '/mcp' },
      { method: 'POST', path: '/ingest' },
    ]) {
      const req = new Request(`https://example.com${ep.path}`, {
        method: ep.method,
        headers: { Authorization: `Bearer ${env.API_KEY}` },
      });
      const res = await worker.fetch(req, { DB: env.DB });
      expect(res.status).toBe(503);
    }
  });

  it('grants access with the valid Bearer token and returns updated MCP tool definitions', async () => {
    const res = await SELF.fetch('https://example.com/mcp/tools', {
      headers: { Authorization: `Bearer ${env.API_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      protocol: string;
      endpoint: string;
      tools: Array<{ name: string; inputSchema: Record<string, unknown> }>;
    };
    expect(body.protocol).toBe('mcp');
    expect(body.endpoint).toBe('/mcp');
    expect(body.tools.map((t) => t.name)).toEqual([
      'create_person',
      'query_relationship_records',
      'insert_relationship_event',
      'analyze_relationship',
    ]);
  });
});
