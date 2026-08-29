import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clearSessionFile, saveSessionFile, sessionFilePath } from './auth-session.mjs';

const env = process.env;

function text(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function baseUrl(value) {
  return text(value).replace(/\/$/, '');
}

function jsonError(data, fallback) {
  return data?.error_description || data?.msg || data?.message || data?.error || fallback;
}

async function responseData(response) {
  const raw = await response.text();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return { raw }; }
}

export function createPkcePair() {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

export function callbackConfiguration(environment = process.env) {
  const host = text(environment.MOLDOVENEASCA_AUTH_CALLBACK_HOST) || '127.0.0.1';
  const port = Number(environment.MOLDOVENEASCA_AUTH_CALLBACK_PORT || 54321);
  const pathnameValue = text(environment.MOLDOVENEASCA_AUTH_CALLBACK_PATH) || '/callback';
  const pathname = pathnameValue.startsWith('/') ? pathnameValue : `/${pathnameValue}`;
  const redirectUrl = text(environment.MOLDOVENEASCA_AUTH_REDIRECT_URL) || `http://${host}:${port}${pathname}`;
  return { host, port, pathname, redirectUrl };
}

export function buildGitHubAuthorizationUrl({ url, redirectUrl, codeChallenge }) {
  const authorizeUrl = new URL(`${baseUrl(url)}/auth/v1/authorize`);
  authorizeUrl.searchParams.set('provider', 'github');
  authorizeUrl.searchParams.set('redirect_to', redirectUrl);
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 's256');
  // Supabase creates and persists the OAuth flow state as a UUID. Do not send
  // a client-generated state here: Supabase rejects unknown or non-UUID values
  // with bad_oauth_state.
  return authorizeUrl.toString();
}

export async function exchangeGitHubCode({ url, key, code, codeVerifier, fetchImpl = globalThis.fetch }) {
  const response = await fetchImpl(`${baseUrl(url)}/auth/v1/token?grant_type=pkce`, {
    method: 'POST',
    headers: { apikey: text(key), 'content-type': 'application/json' },
    body: JSON.stringify({ auth_code: code, code_verifier: codeVerifier })
  });
  const data = await responseData(response);
  if (!response.ok) throw new Error(jsonError(data, `Supabase a refuzat schimbul OAuth (${response.status}).`));
  if (!data?.access_token || !data?.refresh_token) throw new Error('Supabase nu a returnat o sesiune OAuth completă.');
  return data;
}

function openExternalBrowser(url) {
  if (process.platform === 'win32') {
    const child = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore' });
    child.unref();
    return;
  }
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  const child = spawn(command, [url], { detached: true, stdio: 'ignore' });
  child.unref();
}

function html(message, success = false) {
  const safe = String(message).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  return `<!doctype html><meta charset="utf-8"><title>Autentificare MCP</title><p>${safe}</p>${success ? '<p>Poți închide această fereastră.</p>' : ''}`;
}

async function main() {
  const filePath = sessionFilePath(env);
  if (process.argv.includes('--logout')) {
    await clearSessionFile(filePath);
    console.log(`Sesiunea locală a fost eliminată: ${filePath}`);
    return;
  }

  const url = baseUrl(env.MOLDOVENEASCA_SUPABASE_URL || env.SUPABASE_URL);
  const key = text(env.MOLDOVENEASCA_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY);
  if (!url || !key) throw new Error('Lipsește URL-ul sau cheia publică Supabase din .env.');
  const callback = callbackConfiguration(env);
  const { codeVerifier, codeChallenge } = createPkcePair();
  const authorizationUrl = buildGitHubAuthorizationUrl({ url, redirectUrl: callback.redirectUrl, codeChallenge });

  const result = await new Promise((resolve, reject) => {
    let settled = false;
    const server = createServer(async (request, response) => {
      const requestUrl = new URL(request.url || '/', `http://${callback.host}:${callback.port}`);
      if (requestUrl.pathname !== callback.pathname) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }
      // Supabase validates and consumes its server-side OAuth state before
      // redirecting here. The application callback receives the PKCE code,
      // normally without the provider state parameter.
      const providerError = requestUrl.searchParams.get('error_description') || requestUrl.searchParams.get('error');
      if (providerError) {
        response.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
        response.end(html(`Autentificarea GitHub a fost anulată: ${providerError}`));
        finish(new Error(`Autentificarea GitHub a fost anulată: ${providerError}`));
        return;
      }
      const code = requestUrl.searchParams.get('code');
      if (!code) {
        response.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
        response.end(html('Callback-ul GitHub nu conține un cod OAuth.'));
        finish(new Error('Callback-ul GitHub nu conține un cod OAuth.'));
        return;
      }
      try {
        const session = await exchangeGitHubCode({ url, key, code, codeVerifier });
        await saveSessionFile(filePath, session);
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(html('Autentificarea GitHub a reușit.', true));
        finish(null, session);
      } catch (error) {
        response.writeHead(502, { 'content-type': 'text/html; charset=utf-8' });
        response.end(html(error.message || 'Schimbul OAuth a eșuat.'));
        finish(error);
      }
    });
    const timer = setTimeout(() => finish(new Error('Autentificarea a expirat după 5 minute.')), 5 * 60 * 1000);
    timer.unref();
    function finish(error, value = null) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close(() => error ? reject(error) : resolve(value));
    }
    server.once('error', (error) => finish(error));
    server.listen(callback.port, callback.host, () => {
      console.log(`Se deschide autentificarea GitHub în browserul extern: ${authorizationUrl}`);
      try { openExternalBrowser(authorizationUrl); } catch { console.log('Deschide manual URL-ul afișat mai sus în Chrome extern.'); }
    });
  });

  console.log(`Sesiunea GitHub a fost salvată local în ${filePath}.`);
  console.log('Parola nu a fost solicitată. Repornește Codex pentru a folosi MCP-ul autentificat.');
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
