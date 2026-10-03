const origins = new Set(['https://dudnic.com', 'https://www.dudnic.com']);
const choices = ['like', 'heart', 'thoughtful', 'sad', 'angry'];
const extraArticles = new Set(['/noutati-raspuns-tanase-istoria-romanilor/', '/noutati-sesizare-parlament-partide-istoria-romanilor/']);
const validArticle = (article) => typeof article === 'string' && (extraArticles.has(article) || /^\/\d{4}\/\d{2}\/\d{2}\/[a-zA-Z0-9_%-]+\.html$/.test(article)) && article.length <= 250;
const validToken = (token) => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);

async function identity(secret, value) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function totals(db, article, reader) {
  const queries = [db.prepare('SELECT reaction, COUNT(*) AS total FROM reactions WHERE article = ?1 GROUP BY reaction').bind(article)];
  if (reader) queries.push(db.prepare('SELECT reaction FROM reactions WHERE article = ?1 AND reader = ?2').bind(article, reader));
  const result = await db.batch(queries);
  const counts = Object.fromEntries(choices.map((choice) => [choice, 0]));
  for (const row of result[0].results) counts[row.reaction] = row.total;
  return { counts, selected: result[1]?.results[0]?.reaction || null };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' };
    if (origins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
    const url = new URL(request.url);
    if (url.pathname !== '/reactions') return reply({ error: 'not_found' }, 404);
    if (origin && !origins.has(origin)) return reply({ error: 'origin_not_allowed' }, 403);
    if (request.method === 'OPTIONS') {
      if (!origins.has(origin)) return reply({ error: 'origin_not_allowed' }, 403);
      return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type, X-Reader-Token', 'Access-Control-Max-Age': '86400' } });
    }
    try {
      if (request.method === 'GET') {
        const article = url.searchParams.get('article');
        const token = request.headers.get('X-Reader-Token');
        if (!validArticle(article)) return reply({ error: 'invalid_article' }, 400);
        const reader = validToken(token) ? await identity(env.READER_SECRET, 'reader:' + token) : null;
        return reply(await totals(env.DB, article, reader));
      }
      if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
      if (!origins.has(origin)) return reply({ error: 'origin_required' }, 403);
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply({ error: 'invalid_content_type' }, 415);
      if (Number(request.headers.get('Content-Length') || 0) > 1024) return reply({ error: 'too_large' }, 413);
      const stream = request.body?.getReader();
      if (!stream) return reply({ error: 'invalid_json' }, 400);
      const chunks = [];
      let size = 0;
      while (true) {
        const chunk = await stream.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 1024) { await stream.cancel(); return reply({ error: 'too_large' }, 413); }
        chunks.push(chunk.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      let body;
      try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return reply({ error: 'invalid_json' }, 400); }
      if (!body || !validArticle(body.article) || !validToken(body.token) || !(body.reaction === null || choices.includes(body.reaction))) return reply({ error: 'invalid_reaction' }, 400);
      const reader = await identity(env.READER_SECRET, 'reader:' + body.token);
      const ipKey = await identity(env.READER_SECRET, 'network:' + (request.headers.get('CF-Connecting-IP') || reader));
      const window = Math.floor(Date.now() / 60000);
      const limit = await env.DB.prepare('INSERT INTO write_limits(reader, window, attempts) VALUES (?1, ?2, 1) ON CONFLICT(reader) DO UPDATE SET attempts = CASE WHEN window = excluded.window THEN attempts + 1 ELSE 1 END, window = excluded.window RETURNING attempts').bind(ipKey, window).first();
      if (limit.attempts > 20) return reply({ error: 'too_many_requests' }, 429);
      // Confirm a real published article before accepting its first reaction.
      const cacheRequest = new Request('https://dudnic.com' + body.article);
      const exists = await caches.default.match(cacheRequest);
      if (!exists) {
        const articleResponse = await fetch(cacheRequest, { method: 'HEAD', redirect: 'manual' });
        if (articleResponse.status !== 200 || !articleResponse.headers.get('Content-Type')?.includes('text/html')) return reply({ error: 'article_not_found' }, 404);
        await caches.default.put(cacheRequest, new Response('valid', { headers: { 'Cache-Control': 'public, max-age=3600' } }));
      }
      if (body.reaction === null) {
        await env.DB.prepare('DELETE FROM reactions WHERE article = ?1 AND reader = ?2').bind(body.article, reader).run();
      } else {
        await env.DB.prepare('INSERT INTO reactions(article, reader, reaction, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(article, reader) DO UPDATE SET reaction = excluded.reaction, updated_at = excluded.updated_at').bind(body.article, reader, body.reaction, Date.now()).run();
      }
      return reply(await totals(env.DB, body.article, reader));
    } catch (error) {
      console.error(JSON.stringify({ event: 'reactions_error', message: error.message }));
      return reply({ error: 'temporarily_unavailable' }, 503);
    }
  },
  async scheduled(controller, env) {
    await env.DB.prepare('DELETE FROM write_limits WHERE window < ?1').bind(Math.floor(Date.now() / 60000) - 60).run();
  }
};
