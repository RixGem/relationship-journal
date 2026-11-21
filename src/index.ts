import { z } from 'zod';

const IngestPayload = z.object({
  person_id: z.string().min(1),
  source: z.enum(['voice_note', 'chat_log', 'manual']).default('manual'),
  content: z.string().min(1),
});

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const headers = { 'Content-Type': 'application/json' };

    if (url.pathname === '/health' || url.pathname === '/') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'relationship-journal-api',
          endpoints: ['/health', '/ingest', '/mcp/tools'],
        }),
        { headers }
      );
    }

    if (url.pathname === '/ingest' && request.method === 'POST') {
      const body = await request.json().catch(() => null);
      const parsed = IngestPayload.safeParse(body);
      if (!parsed.success) {
        return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
          status: 400,
          headers,
        });
      }

      return new Response(
        JSON.stringify({
          status: 'queued',
          job_id: crypto.randomUUID(),
          hot_path_ms: 12,
          payload: parsed.data,
        }),
        { status: 202, headers }
      );
    }

    if (url.pathname === '/mcp/tools') {
      return new Response(
        JSON.stringify({
          tools: [
            {
              name: 'query_timeline_events',
              description: 'Query structured relationship events and sentiment trends by person_id',
            },
            {
              name: 'get_gift_signals',
              description: 'Retrieve extracted gift ideas, preferences, and follow-up hooks',
            },
          ],
        }),
        { headers }
      );
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers });
  },
};
