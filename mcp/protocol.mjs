import { citationFor, publicReference } from './catalog-core.mjs';
import { extractBearer, ServiceError } from './auth.mjs';

export const SERVER_INFO = {
  name: 'moldoveneasca-references',
  version: '0.1.0'
};

const TOOL_DEFINITIONS = [
  {
    name: 'search_moldoveneasca_references',
    description: 'Caută și filtrează referințe documentare despre denumirea limbii moldovenești. Rezultatele publice sunt numai cele publicate; folosește status=all doar într-un context autentificat de moderare.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        q: { type: 'string', description: 'Text căutat în titlu, autor, citat, comentarii și sursă.' },
        author: { type: 'string' },
        language: { type: 'string' },
        source_type: { type: 'string' },
        catalog_type: { type: 'string', enum: ['language', 'ethnicity', 'both', 'all'] },
        status: { type: 'string', description: 'published implicit; poate fi pending, rejected, archived sau all într-un context autorizat.' },
        from_year: { type: 'integer' },
        to_year: { type: 'integer' },
        sort: { type: 'string', enum: ['relevance', 'year_asc', 'year_desc', 'title'] },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        offset: { type: 'integer', minimum: 0 }
      }
    }
  },
  {
    name: 'get_moldoveneasca_reference',
    description: 'Obține o referință după identificatorul ei.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['id'], properties: { id: { type: 'string' } } }
  },
  {
    name: 'moldoveneasca_reference_statistics',
    description: 'Returnează statistici despre catalog: statut, tip de catalog, surse, limbi și interval cronologic.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} }
  },
  {
    name: 'cite_moldoveneasca_references',
    description: 'Construiește citări Markdown sau text simplu din metadatele referințelor; citările trebuie verificate față de sursa originală.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['ids'],
      properties: {
        ids: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'string' } },
        format: { type: 'string', enum: ['markdown', 'plain'] }
      }
    }
  },
  {
    name: 'list_moldoveneasca_unverified',
    description: 'Listează contribuțiile cu status pending vizibile contului autentificat. Intrările respinse sau arhivate nu fac parte din coada neverificată. Necesită autentificare.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} }
  },
  {
    name: 'add_moldoveneasca_reference',
    description: 'Adaugă o referință. Pentru utilizatorii care nu sunt proprietarul catalogului, intrarea primește statut pending și este trimisă în lista de neverificate.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['year_label', 'title', 'quote'],
      properties: {
        year_label: { type: 'string' },
        year_start: { type: ['integer', 'null'] },
        year_end: { type: ['integer', 'null'] },
        title: { type: 'string' },
        author: { type: ['string', 'null'] },
        language: { type: ['string', 'null'] },
        description: { type: ['string', 'null'] },
        quote: { type: 'string' },
        source_type: { type: ['string', 'null'] },
        location: { type: ['string', 'null'] },
        source_url: { type: ['string', 'null'] },
        image_url: { type: ['string', 'null'] },
        catalog_type: { type: 'string', enum: ['language', 'ethnicity', 'both'] }
      }
    }
  },
  {
    name: 'edit_moldoveneasca_reference',
    description: 'Editează o referință. Utilizatorii non-admin nu modifică direct referințele publicate: propunerea merge la premoderare.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'changes'],
      properties: { id: { type: 'string' }, changes: { type: 'object' }, reason: { type: 'string' } }
    }
  },
  {
    name: 'request_moldoveneasca_reference_deletion',
    description: 'Cere ștergerea unei referințe. Numai sdudnic@gmail.com o poate șterge; restul cererilor devin sugestii de moderare.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: { id: { type: 'string' }, reason: { type: 'string' } }
    }
  },
  {
    name: 'review_moldoveneasca_reference',
    description: 'Confirmă sau infirmă statutul unei referințe. Disponibil exclusiv proprietarului catalogului sdudnic@gmail.com.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'action'],
      properties: { id: { type: 'string' }, action: { type: 'string', enum: ['approve', 'publish', 'reject', 'archive', 'restore'] }, note: { type: 'string' } }
    }
  },
  {
    name: 'review_moldoveneasca_moderation_request',
    description: 'Confirmă sau respinge o sugestie de editare/ștergere. Disponibil exclusiv proprietarului catalogului.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['request_id', 'action'],
      properties: { request_id: { type: 'string' }, action: { type: 'string', enum: ['approve', 'reject'] }, note: { type: 'string' } }
    }
  },
  {
    name: 'list_moldoveneasca_moderation_requests',
    description: 'Listează cererile de moderare vizibile contului. Proprietarul catalogului vede toate cererile.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { status: { type: 'string', enum: ['pending', 'approved', 'rejected'] }, request_type: { type: 'string', enum: ['edit', 'delete'] } }
    }
  }
];

export function toolDefinitions() {
  return TOOL_DEFINITIONS;
}

function textResult(data, isError = false) {
  const result = {
    content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }]
  };
  if (typeof data !== 'string') result.structuredContent = data;
  if (isError) result.isError = true;
  return result;
}

function rpcError(id, code, message, data = undefined) {
  const result = { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
  if (data !== undefined) result.error.data = data;
  return result;
}

function requestToken(context) {
  if (context?.accessToken) return context.accessToken;
  return extractBearer(context?.headers || {});
}

function invalidateStore(store) {
  if (typeof store?.invalidate === 'function') store.invalidate();
}

async function callTool(name, args, context) {
  const store = context.store;
  const gateway = context.gateway;
  const argumentsObject = args && typeof args === 'object' ? args : {};
  switch (name) {
    case 'search_moldoveneasca_references':
      return store.search({
        ...argumentsObject,
        fromYear: argumentsObject.from_year,
        toYear: argumentsObject.to_year,
        sourceType: argumentsObject.source_type,
        catalogType: argumentsObject.catalog_type
      });
    case 'get_moldoveneasca_reference': {
      const row = await store.get(argumentsObject.id);
      if (!row) throw new ServiceError('Referința nu a fost găsită sau nu este publicată.', { status: 404, code: 'not_found' });
      return publicReference(row);
    }
    case 'moldoveneasca_reference_statistics':
      return store.statistics();
    case 'cite_moldoveneasca_references': {
      const ids = Array.isArray(argumentsObject.ids) ? argumentsObject.ids : [];
      if (!ids.length || ids.length > 50) throw new ServiceError('ids trebuie să conțină între 1 și 50 de identificatoare.', { code: 'invalid_input' });
      const format = argumentsObject.format === 'plain' ? 'plain' : 'markdown';
      const items = [];
      for (const id of ids) {
        const row = await store.get(id);
        if (row) items.push({ id, citation: citationFor(row, format), reference: publicReference(row) });
        else items.push({ id, error: 'Referința nu a fost găsită sau nu este publicată.' });
      }
      return { format, items, warning: 'Citarea este generată din metadatele catalogului și trebuie verificată față de sursa originală.' };
    }
    case 'list_moldoveneasca_unverified': {
      const contextAuth = await context.authenticate(requestToken(context));
      const items = await gateway.listUnverified(contextAuth);
      return { items, count: items.length };
    }
    case 'add_moldoveneasca_reference': {
      const auth = await context.authenticate(requestToken(context));
      const result = await gateway.createReference(auth, argumentsObject);
      invalidateStore(store);
      return result;
    }
    case 'edit_moldoveneasca_reference': {
      const auth = await context.authenticate(requestToken(context));
      const result = await gateway.updateReference(auth, argumentsObject.id, argumentsObject.changes, argumentsObject.reason);
      invalidateStore(store);
      return result;
    }
    case 'request_moldoveneasca_reference_deletion': {
      const auth = await context.authenticate(requestToken(context));
      const result = await gateway.deleteOrSuggest(auth, argumentsObject.id, argumentsObject.reason);
      invalidateStore(store);
      return result;
    }
    case 'review_moldoveneasca_reference': {
      const auth = await context.authenticate(requestToken(context));
      const result = await gateway.reviewReference(auth, argumentsObject.id, argumentsObject.action, argumentsObject.note);
      invalidateStore(store);
      return result;
    }
    case 'review_moldoveneasca_moderation_request': {
      const auth = await context.authenticate(requestToken(context));
      const result = await gateway.reviewModerationRequest(auth, argumentsObject.request_id, argumentsObject.action, argumentsObject.note);
      invalidateStore(store);
      return result;
    }
    case 'list_moldoveneasca_moderation_requests': {
      const auth = await context.authenticate(requestToken(context));
      const items = await gateway.listModerationRequests(auth, { status: argumentsObject.status || 'pending', requestType: argumentsObject.request_type });
      return { items, count: items.length };
    }
    default:
      throw new ServiceError(`Instrument necunoscut: ${name}.`, { status: 404, code: 'tool_not_found' });
  }
}

function resources() {
  return [
    {
      uri: 'moldoveneasca://catalog/overview',
      name: 'Privire de ansamblu asupra catalogului',
      description: 'Statistici și reguli de folosire a referințelor.',
      mimeType: 'application/json'
    }
  ];
}

function resourceTemplates() {
  return [{
    uriTemplate: 'moldoveneasca://catalog/reference/{id}',
    name: 'Referință individuală',
    description: 'O referință publicată după identificator.',
    mimeType: 'application/json'
  }];
}

async function readResource(uri, context) {
  if (uri === 'moldoveneasca://catalog/overview') return context.store.statistics();
  const prefix = 'moldoveneasca://catalog/reference/';
  if (String(uri).startsWith(prefix)) {
    const id = decodeURIComponent(String(uri).slice(prefix.length));
    const row = await context.store.get(id);
    if (!row) throw new ServiceError('Resursa nu a fost găsită.', { status: 404, code: 'not_found' });
    return publicReference(row);
  }
  throw new ServiceError('URI de resursă necunoscut.', { status: 404, code: 'not_found' });
}

export async function handleRpc(request, context) {
  if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') return rpcError(request?.id, -32600, 'Cerere JSON-RPC invalidă.');
  const id = request.id;
  if (id === undefined && request.method.startsWith('notifications/')) return null;
  try {
    switch (request.method) {
      case 'initialize': {
        const requested = request.params?.protocolVersion;
        const protocolVersion = ['2026-07-28', '2025-06-18', '2025-03-26', '2024-11-05'].includes(requested) ? requested : '2026-07-28';
        return { jsonrpc: '2.0', id, result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: 'Folosește instrumentele de căutare pentru referințe publicate. Contribuțiile, editările și ștergerile sunt supuse regulilor de premoderare; numai sdudnic@gmail.com poate confirma sau infirma moderarea.'
        } };
      }
      case 'notifications/initialized':
        return null;
      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };
      case 'tools/list':
        return { jsonrpc: '2.0', id, result: { tools: toolDefinitions() } };
      case 'tools/call': {
        const name = request.params?.name;
        if (!name) return rpcError(id, -32602, 'Numele instrumentului lipsește.');
        const result = await callTool(name, request.params?.arguments || {}, context);
        return { jsonrpc: '2.0', id, result: textResult(result) };
      }
      case 'resources/list':
        return { jsonrpc: '2.0', id, result: { resources: resources() } };
      case 'resources/templates/list':
        return { jsonrpc: '2.0', id, result: { resourceTemplates: resourceTemplates() } };
      case 'resources/read': {
        const value = await readResource(request.params?.uri, context);
        return { jsonrpc: '2.0', id, result: { contents: [{ uri: request.params.uri, mimeType: 'application/json', text: JSON.stringify(value, null, 2) }] } };
      }
      case 'prompts/list':
        return { jsonrpc: '2.0', id, result: { prompts: [] } };
      default:
        return rpcError(id, -32601, `Metoda nu este implementată: ${request.method}.`);
    }
  } catch (error) {
    if (request.method === 'tools/call') return { jsonrpc: '2.0', id, result: textResult({ code: error.code || 'service_error', message: error.message }, true) };
    if (error instanceof ServiceError) return rpcError(id, error.status === 401 || error.status === 403 ? -32001 : -32602, error.message, { code: error.code, details: error.details });
    return rpcError(id, -32603, 'Eroare internă a serverului.');
  }
}
