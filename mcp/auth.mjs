import {
  publicReference,
  REFERENCE_FIELDS,
  REFERENCE_IMAGE_MAX_BYTES,
  REFERENCE_IMAGE_MAX_DATA_URL_CHARS
} from './catalog-core.mjs';

// These metadata fields are part of the normalized catalog shape but are not
// present in the current Supabase language_references table.
const DATABASE_REFERENCE_FIELDS = REFERENCE_FIELDS.filter((field) => ![
  'provider',
  'external_id',
  'evidence_url'
].includes(field));

const MUTABLE_FIELDS = [
  'year_label',
  'year_start',
  'year_end',
  'title',
  'author',
  'language',
  'description',
  'quote',
  'source_type',
  'location',
  'source_url',
  'image_url',
  'catalog_type',
  'status'
];

const STATUS_VALUES = new Set(['pending', 'published', 'rejected', 'archived']);

export class ServiceError extends Error {
  constructor(message, { status = 400, code = 'service_error', details = null } = {}) {
    super(message);
    this.name = 'ServiceError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function clean(value) {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result || null;
}

function publicModerationRequest(row) {
  if (!row || typeof row !== 'object') return null;
  const fields = ['id', 'reference_id', 'request_type', 'proposed_changes', 'target_snapshot', 'reason', 'status', 'reviewed_by', 'review_note', 'created_at', 'updated_at'];
  return Object.fromEntries(fields
    .filter((field) => Object.prototype.hasOwnProperty.call(row, field))
    .map((field) => [field, row[field]]));
}

function intOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new ServiceError(`Valoarea ${value} trebuie să fie un număr întreg.`, { code: 'invalid_input' });
  return parsed;
}

const DATA_IMAGE_PATTERN = /^data:image\/(avif|gif|jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/i;

function base64ByteLength(value) {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(value.length * 3 / 4) - padding);
}

function validateImageSize(value) {
  if (!value || /^https:\/\//i.test(value)) return;
  const match = value.match(DATA_IMAGE_PATTERN);
  if (!match) return;
  if (value.length > REFERENCE_IMAGE_MAX_DATA_URL_CHARS || base64ByteLength(match[2]) > REFERENCE_IMAGE_MAX_BYTES) {
    throw new ServiceError('Imaginea este prea mare. Folosește o captură compactată la maximum 1,5 MB.', { code: 'payload_too_large', status: 413 });
  }
}

export function extractBearer(headers = {}) {
  const authorization = headers.authorization || headers.Authorization || '';
  const match = String(authorization).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function normalizeReferenceInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ServiceError('Datele referinței trebuie să fie un obiect JSON.', { code: 'invalid_input' });
  }
  const payload = {};
  for (const field of MUTABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) continue;
    payload[field] = ['year_start', 'year_end'].includes(field) ? intOrNull(input[field]) : clean(input[field]);
  }
  if (payload.catalog_type && !['language', 'ethnicity', 'both'].includes(payload.catalog_type)) {
    throw new ServiceError('catalog_type trebuie să fie language, ethnicity sau both.', { code: 'invalid_input' });
  }
  if (payload.status !== undefined && !STATUS_VALUES.has(payload.status)) {
    throw new ServiceError('status trebuie să fie pending, published, rejected sau archived.', { code: 'invalid_input' });
  }
  if (payload.source_url && !/^https?:\/\//i.test(payload.source_url)) {
    throw new ServiceError('source_url trebuie să înceapă cu http:// sau https://.', { code: 'invalid_input' });
  }
  if (payload.image_url && !/^https:\/\//i.test(payload.image_url) && !/^data:image\/(avif|gif|jpeg|jpg|png|webp);base64,/i.test(payload.image_url)) {
    throw new ServiceError('image_url trebuie să fie HTTPS sau o imagine data: validă.', { code: 'invalid_input' });
  }
  validateImageSize(payload.image_url);
  if (payload.year_start !== undefined && payload.year_end !== undefined && payload.year_start !== null && payload.year_end !== null && payload.year_end < payload.year_start) {
    throw new ServiceError('year_end nu poate fi mai mic decât year_start.', { code: 'invalid_input' });
  }
  if (payload.title !== undefined && !payload.title) throw new ServiceError('Titlul referinței nu poate fi gol.', { code: 'invalid_input' });
  return payload;
}

function requireEthnicitySource(payload, existing = null) {
  const catalogType = payload.catalog_type ?? existing?.catalog_type;
  if (!['ethnicity', 'both'].includes(catalogType)) return;
  const sourceUrl = Object.prototype.hasOwnProperty.call(payload, 'source_url')
    ? payload.source_url
    : existing?.source_url;
  if (!sourceUrl) {
    throw new ServiceError('Referințele din catalogul etnic trebuie să aibă source_url.', { code: 'invalid_input' });
  }
}

export function moderationMessage(action = 'edit') {
  if (action === 'delete') return 'Sugestia de ștergere a fost trimisă premoderării. Editarea voastră este trimisă premoderare; numai proprietarul catalogului poate confirma ștergerea.';
  return 'Editarea voastră este trimisă premoderare și rămâne în lista de neverificate până la revalidare.';
}

export class SupabaseGateway {
  constructor({
    url = '',
    key = '',
    primaryAdminEmail = 'sdudnic@gmail.com',
    fetchImpl = globalThis.fetch
  } = {}) {
    this.url = String(url || '').replace(/\/$/, '');
    this.key = key;
    this.primaryAdminEmail = String(primaryAdminEmail || 'sdudnic@gmail.com').trim().toLowerCase();
    this.fetchImpl = fetchImpl;
  }

  get configured() {
    return Boolean(this.url && this.key && typeof this.fetchImpl === 'function');
  }

  requireConfigured() {
    if (!this.configured) throw new ServiceError('Contribuțiile nu sunt configurate: lipsește conexiunea Supabase.', { status: 503, code: 'auth_unavailable' });
  }

  headers(token, json = false) {
    const headers = {
      apikey: this.key,
      authorization: `Bearer ${token || this.key}`
    };
    if (json) headers['content-type'] = 'application/json';
    return headers;
  }

  async request(path, { token = null, method = 'GET', body = undefined, prefer = null } = {}) {
    this.requireConfigured();
    const headers = this.headers(token, body !== undefined);
    if (prefer) headers.prefer = prefer;
    const response = await this.fetchImpl(`${this.url}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
    if (!response.ok) {
      const message = data?.message || data?.hint || data?.error_description || data?.error || `Supabase a răspuns cu ${response.status}.`;
      throw new ServiceError(message, { status: response.status === 401 ? 401 : 502, code: 'supabase_error', details: data });
    }
    return data;
  }

  async authenticate(token) {
    this.requireConfigured();
    if (!token) throw new ServiceError('Autentificarea este necesară pentru contribuții.', { status: 401, code: 'auth_required' });
    const user = await this.request('/auth/v1/user', { token });
    if (!user?.id) throw new ServiceError('Tokenul de autentificare nu este valid.', { status: 401, code: 'auth_invalid' });
    const profileRows = await this.request(`/rest/v1/profiles?select=id,email,role,display_name,github_login&id=eq.${encodeURIComponent(user.id)}&limit=1`, { token });
    const profile = Array.isArray(profileRows) ? profileRows[0] || null : null;
    const email = String(profile?.email || user.email || '').trim().toLowerCase();
    return {
      token,
      user,
      profile,
      userId: user.id,
      email,
      role: ['viewer', 'editor', 'admin'].includes(profile?.role) ? profile.role : 'viewer',
      isAdmin: profile?.role === 'admin',
      isPrimaryAdmin: email === this.primaryAdminEmail
    };
  }

  async getReference(id, token) {
    const select = DATABASE_REFERENCE_FIELDS.concat(['owner_id']).filter((field, index, list) => list.indexOf(field) === index).join(',');
    const rows = await this.request(`/rest/v1/language_references?select=${select}&id=eq.${encodeURIComponent(id)}&limit=1`, { token });
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  async listUnverified(context) {
    const select = DATABASE_REFERENCE_FIELDS.concat(['owner_id']).filter((field, index, list) => list.indexOf(field) === index).join(',');
    const rows = await this.request(`/rest/v1/language_references?select=${select}&status=eq.pending&order=year_start.asc,id.asc&limit=1000`, { token: context.token });
    return Array.isArray(rows) ? rows.map(publicReference) : [];
  }

  async createReference(context, input) {
    const payload = normalizeReferenceInput(input);
    requireEthnicitySource(payload);
    payload.owner_id = context.userId;
    payload.status = context.isPrimaryAdmin && input.status ? input.status : 'pending';
    if (!['pending', 'published', 'rejected', 'archived'].includes(payload.status)) {
      throw new ServiceError('status trebuie să fie pending, published, rejected sau archived.', { code: 'invalid_input' });
    }
    const rows = await this.request('/rest/v1/language_references?select=*', {
      token: context.token,
      method: 'POST',
      body: payload,
      prefer: 'return=representation'
    });
    return {
      reference: publicReference(Array.isArray(rows) ? rows[0] : rows),
      status: payload.status,
      message: context.isPrimaryAdmin
        ? 'Referința a fost adăugată de proprietarul catalogului.'
        : 'Referința a fost adăugată în lista de neverificate. Editarea voastră este trimisă premoderare.'
    };
  }

  async createModerationRequest(context, { referenceId, requestType, proposedChanges = {}, reason = null, targetSnapshot = null }) {
    const body = {
      reference_id: referenceId || null,
      requested_by: context.userId,
      request_type: requestType,
      proposed_changes: proposedChanges,
      reason: clean(reason),
      target_snapshot: targetSnapshot,
      status: 'pending'
    };
    const rows = await this.request('/rest/v1/reference_moderation_requests?select=*', {
      token: context.token,
      method: 'POST',
      body,
      prefer: 'return=representation'
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async updateReference(context, id, input, reason = null) {
    const existing = await this.getReference(id, context.token);
    if (!existing) throw new ServiceError('Referința nu a fost găsită sau nu este vizibilă pentru contul curent.', { status: 404, code: 'not_found' });
    const payload = normalizeReferenceInput(input);
    requireEthnicitySource(payload, existing);

    if (!context.isAdmin && !context.isPrimaryAdmin) {
      if (existing.owner_id === context.userId && existing.status === 'pending') {
        payload.status = 'pending';
        const rows = await this.request(`/rest/v1/language_references?id=eq.${encodeURIComponent(id)}&select=*`, {
          token: context.token,
          method: 'PATCH',
          body: payload,
          prefer: 'return=representation'
        });
        return { reference: publicReference(Array.isArray(rows) ? rows[0] : rows), moderated: true, message: moderationMessage('edit') };
      }
      // Contributors may propose metadata changes for a published entry, but
      // only the primary owner can move a record between moderation statuses.
      delete payload.status;
      const request = await this.createModerationRequest(context, {
        referenceId: id,
        requestType: 'edit',
        proposedChanges: payload,
        reason,
        targetSnapshot: publicReference(existing)
      });
      return { request: publicModerationRequest(request), moderated: true, message: moderationMessage('edit') };
    }

    if (!context.isPrimaryAdmin) delete payload.status;
    const rows = await this.request(`/rest/v1/language_references?id=eq.${encodeURIComponent(id)}&select=*`, {
      token: context.token,
      method: 'PATCH',
      body: payload,
      prefer: 'return=representation'
    });
    return {
      reference: publicReference(Array.isArray(rows) ? rows[0] : rows),
      moderated: false,
      message: context.isPrimaryAdmin ? 'Referința a fost modificată și statutul a fost actualizat de proprietar.' : 'Referința a fost modificată de un administrator; statutul de verificare rămâne neschimbat.'
    };
  }

  async deleteOrSuggest(context, id, reason = null) {
    const existing = await this.getReference(id, context.token);
    if (!existing) throw new ServiceError('Referința nu a fost găsită sau nu este vizibilă pentru contul curent.', { status: 404, code: 'not_found' });
    if (!context.isPrimaryAdmin) {
      const request = await this.createModerationRequest(context, {
        referenceId: id,
        requestType: 'delete',
        proposedChanges: {},
        reason,
        targetSnapshot: publicReference(existing)
      });
      return { request: publicModerationRequest(request), moderated: true, message: moderationMessage('delete') };
    }
    await this.request(`/rest/v1/language_references?id=eq.${encodeURIComponent(id)}`, {
      token: context.token,
      method: 'DELETE',
      prefer: 'return=minimal'
    });
    return { deleted: true, id, moderated: false, message: 'Referința a fost ștearsă de proprietarul catalogului.' };
  }

  async reviewReference(context, id, action, note = null) {
    if (!context.isPrimaryAdmin) throw new ServiceError('Numai sdudnic@gmail.com poate revalida și schimba statutul unei referințe.', { status: 403, code: 'moderation_forbidden' });
    const statusMap = { approve: 'published', publish: 'published', reject: 'rejected', archive: 'archived', restore: 'published' };
    const status = statusMap[String(action || '').toLowerCase()];
    if (!status) throw new ServiceError('Acțiunea trebuie să fie approve, publish, reject, archive sau restore.', { code: 'invalid_input' });
    const rows = await this.request(`/rest/v1/language_references?id=eq.${encodeURIComponent(id)}&select=*`, {
      token: context.token,
      method: 'PATCH',
      body: { status },
      prefer: 'return=representation'
    });
    if (!Array.isArray(rows) || !rows.length) throw new ServiceError('Referința nu a fost găsită.', { status: 404, code: 'not_found' });
    return { reference: publicReference(Array.isArray(rows) ? rows[0] : rows), action: status, note: clean(note), message: status === 'published' ? 'Referința a fost confirmată și publicată.' : `Referința a fost marcată ca ${status}.` };
  }

  async reviewModerationRequest(context, requestId, action, note = null) {
    if (!context.isPrimaryAdmin) throw new ServiceError('Numai sdudnic@gmail.com poate confirma sau infirma sugestiile de moderare.', { status: 403, code: 'moderation_forbidden' });
    const result = await this.request('/rest/v1/rpc/review_reference_request', {
      token: context.token,
      method: 'POST',
      body: { p_request_id: requestId, p_action: action, p_note: clean(note) }
    });
    return { result: publicModerationRequest(result), message: String(action).toLowerCase() === 'approve' ? 'Sugestia a fost confirmată de proprietarul catalogului.' : 'Sugestia a fost respinsă de proprietarul catalogului.' };
  }

  async listModerationRequests(context, { status = 'pending', requestType = null } = {}) {
    if (!['pending', 'approved', 'rejected'].includes(status)) throw new ServiceError('status de moderare invalid.', { code: 'invalid_input' });
    if (requestType && !['edit', 'delete'].includes(requestType)) throw new ServiceError('Tipul cererii de moderare este invalid.', { code: 'invalid_input' });
    const params = new URLSearchParams({ select: '*', status: `eq.${status}`, order: 'created_at.asc', limit: '1000' });
    if (requestType) params.set('request_type', `eq.${requestType}`);
    const rows = await this.request(`/rest/v1/reference_moderation_requests?${params}`, { token: context.token });
    return Array.isArray(rows) ? rows.map(publicModerationRequest) : [];
  }
}

export function createSupabaseGateway(env = process.env) {
  return new SupabaseGateway({
    url: env.MOLDOVENEASCA_SUPABASE_URL || env.SUPABASE_URL || '',
    key: env.MOLDOVENEASCA_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '',
    primaryAdminEmail: env.MOLDOVENEASCA_PRIMARY_ADMIN_EMAIL || 'sdudnic@gmail.com'
  });
}
