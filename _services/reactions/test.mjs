import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const endpoint = process.env.REACTIONS_ENDPOINT || 'https://dudnic-blog-reactions.dudnic-moldoveneasca-mcp.workers.dev/reactions';
const article = '/2026/10/03/iasi-1866-opozitia-in-sange.html';
const token = randomBytes(32).toString('hex');
async function call(method = 'GET', reaction = null, origin = 'https://dudnic.com', path = article) {
  const headers = { Origin: origin };
  const options = { method, headers };
  let url = `${endpoint}?article=${encodeURIComponent(path)}`;
  if (method === 'POST') {
    url = endpoint;
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify({ article: path, token, reaction });
  } else headers['X-Reader-Token'] = token;
  const response = await fetch(url, options);
  return { status: response.status, headers: response.headers, data: await response.json() };
}
const baseline = await call();
assert.equal(baseline.status, 200);
try {
  const first = await call('POST', 'like');
  assert.equal(first.status, 200);
  assert.equal(first.data.counts.like, baseline.data.counts.like + 1);
  const repeat = await call('POST', 'like');
  assert.deepEqual(repeat.data.counts, first.data.counts);
  const changed = await call('POST', 'heart');
  assert.equal(changed.data.counts.like, baseline.data.counts.like);
  assert.equal(changed.data.counts.heart, baseline.data.counts.heart + 1);
  assert.equal((await call()).data.selected, 'heart');
  assert.equal((await call('POST', 'like', 'https://unrelated.example')).status, 403);
  assert.equal((await call('POST', 'invalid')).status, 400);
  assert.equal((await call('POST', 'like', 'https://dudnic.com', '/2099/01/01/nonexistent-blog-post.html')).status, 404);
  const preflight = await fetch(endpoint, { method: 'OPTIONS', headers: { Origin: 'https://dudnic.com', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-reader-token' } });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /X-Reader-Token/);
  console.log('Passed: repeat, change, persistence, foreign origin, invalid reaction, missing article, CORS preflight.');
} finally {
  const removed = await call('POST', null);
  assert.equal(removed.status, 200);
  assert.deepEqual(removed.data.counts, baseline.data.counts);
  assert.equal(removed.data.selected, null);
  console.log('Test reaction withdrawn; original public totals restored.');
}
