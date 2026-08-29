import { readFile, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { ServiceError } from './auth.mjs';

function text(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function sessionError(message, code = 'auth_required', details = null) {
  return new ServiceError(message, { status: 401, code, details });
}

async function responseData(response) {
  const raw = await response.text();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return { raw }; }
}

function normalizedSession(data = {}, previous = {}) {
  const accessToken = text(data.access_token || previous.access_token);
  const refreshToken = text(data.refresh_token || previous.refresh_token);
  const expiresIn = Number(data.expires_in || previous.expires_in || 3600);
  const expiresAt = Number(data.expires_at || (data.expires_in ? Math.floor(Date.now() / 1000) + expiresIn : previous.expires_at || Math.floor(Date.now() / 1000) + expiresIn));
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: text(data.token_type || previous.token_type) || 'bearer',
    expires_in: Number.isFinite(expiresIn) ? expiresIn : 3600,
    expires_at: Number.isFinite(expiresAt) ? expiresAt : Math.floor(Date.now() / 1000) + 3600,
    user: data.user || previous.user || null,
    updated_at: new Date().toISOString()
  };
}

function validateSession(session) {
  if (!session?.access_token && !session?.refresh_token) return false;
  return true;
}

export function sessionFilePath(env = process.env) {
  const configured = text(env.MOLDOVENEASCA_AUTH_SESSION_FILE) || '.moldoveneasca-session.json';
  return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
}

export async function saveSessionFile(filePath, session) {
  const normalized = normalizedSession(session);
  if (!validateSession(normalized)) throw sessionError('Sesiunea Supabase nu conține tokenuri valide.', 'auth_session_invalid');
  await writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return normalized;
}

export async function clearSessionFile(filePath) {
  try {
    await unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export async function passwordSignIn({ url, key, email, password, fetchImpl = globalThis.fetch } = {}) {
  const baseUrl = text(url).replace(/\/$/, '');
  const anonKey = text(key);
  const accountEmail = text(email);
  if (!baseUrl || !anonKey) throw new ServiceError('Lipsește URL-ul sau cheia publică Supabase.', { status: 503, code: 'auth_unavailable' });
  if (!accountEmail || !text(password)) throw new ServiceError('Emailul și parola Supabase sunt obligatorii.', { status: 400, code: 'auth_input_required' });
  const response = await fetchImpl(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email: accountEmail, password })
  });
  const data = await responseData(response);
  if (!response.ok) {
    const message = data?.error_description || data?.msg || data?.message || 'Autentificarea Supabase a eșuat.';
    throw new ServiceError(message, { status: response.status === 400 || response.status === 401 ? 401 : 502, code: 'auth_login_failed', details: data });
  }
  const session = normalizedSession(data);
  if (!validateSession(session)) throw sessionError('Supabase nu a returnat o sesiune utilizabilă.', 'auth_session_invalid', data);
  return session;
}

export class SupabaseSession {
  constructor({ url = '', key = '', filePath, gateway, fetchImpl = globalThis.fetch } = {}) {
    this.url = text(url).replace(/\/$/, '');
    this.key = text(key);
    this.filePath = filePath;
    this.gateway = gateway;
    this.fetchImpl = fetchImpl;
    this.loaded = false;
    this.session = null;
    this.refreshPromise = null;
  }

  async load() {
    if (this.loaded) return this.session;
    this.loaded = true;
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!validateSession(parsed)) throw new Error('tokenuri lipsă');
      this.session = normalizedSession(parsed, parsed);
      return this.session;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      if (error instanceof SyntaxError || error.message === 'tokenuri lipsă') {
        throw sessionError(`Fișierul local de sesiune Supabase este invalid: ${this.filePath}. Rulează din nou npm run auth:login.`, 'auth_session_invalid');
      }
      throw error;
    }
  }

  async getAccessToken() {
    if (!this.refreshPromise) this.refreshPromise = this.loadAndRefresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  async loadAndRefresh() {
    const session = await this.load();
    if (!session) throw sessionError('Autentificarea este necesară. Rulează `npm run auth:login` în directorul mcp.');
    const expiresAt = Number(session.expires_at || 0) * 1000;
    if (session.access_token && (!expiresAt || expiresAt > Date.now() + 30_000)) return session.access_token;
    if (!session.refresh_token) throw sessionError('Sesiunea Supabase a expirat. Rulează din nou `npm run auth:login`.');
    return this.refresh(session.refresh_token);
  }

  async refresh(refreshToken) {
    if (!this.url || !this.key) throw new ServiceError('Lipsește configurația Supabase pentru reînnoirea sesiunii.', { status: 503, code: 'auth_unavailable' });
    const response = await this.fetchImpl(`${this.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: this.key, 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    const data = await responseData(response);
    if (!response.ok) {
      const message = data?.error_description || data?.msg || data?.message || 'Sesiunea Supabase nu mai este validă.';
      throw sessionError(`${message} Rulează din nou npm run auth:login.`, 'auth_required', data);
    }
    const next = normalizedSession(data, this.session);
    if (!validateSession(next)) throw sessionError('Supabase nu a returnat o sesiune reînnoită.', 'auth_session_invalid', data);
    this.session = await saveSessionFile(this.filePath, next);
    return this.session.access_token;
  }

  async authenticate() {
    const token = await this.getAccessToken();
    return this.gateway.authenticate(token);
  }
}

export function createSupabaseSession(env = process.env, gateway) {
  return new SupabaseSession({
    url: env.MOLDOVENEASCA_SUPABASE_URL || env.SUPABASE_URL || '',
    key: env.MOLDOVENEASCA_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '',
    filePath: sessionFilePath(env),
    gateway
  });
}
