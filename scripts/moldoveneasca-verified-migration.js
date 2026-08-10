/*
 * Audit migration for the historical „moldovenească” catalogue.
 *
 * Run this file in the authenticated catalogue page. It produces a preview
 * with APPLY=false. Set APPLY=true only after the preview has been checked.
 * The Supabase access token is read from the page session and is never stored
 * in this file.
 */
(async () => {
  const APPLY = false;
  const config = window.MOLDOVENEASCA_CONFIG || {};
  const supabaseUrl = String(config.supabaseUrl || '').replace(/\/$/, '');
  const anonKey = config.supabaseAnonKey;
  if (!supabaseUrl || !anonKey) throw new Error('Configurația Supabase lipsește.');

  const corrections = {
    '84693642-b6be-43e1-9d5a-e4171435a30a': {
      year_label: '1818',
      year_start: 1818,
      year_end: 1818,
      title: 'Устав образования Бессарабской области',
      author: 'Imperiul Rus / Alexandru I',
      language: 'rusă / moldovenească',
      description: 'Actul administrativ al Regiunii Basarabia, adoptat la 29 aprilie 1818; textul prevede folosirea limbilor rusă și moldovenească în Consiliu, iar cauzele civile în limba moldovenească.',
      quote: 'Дела в Совете производятся на Российском и Молдавском языках... Гражданские дела... на одном языке Молдавском',
      source_type: 'act normativ',
      location: 'Basarabia',
      source_url: 'https://www.hrono.ru/dokum/moldav1818.html',
      status: 'published'
    },
    '5e6410f2-f8a7-4850-a378-d07a0d8fc233': {
      year_label: '1832',
      year_start: 1832,
      year_end: 1832,
      title: 'Taschenbibliothek der Reisen, von I. H. Jäck, 85-stes Bändchen',
      author: 'F. I. A. Schneidawind',
      language: 'germană',
      description: 'Mențiunea este identificată într-o reproducere a lui Mihail Kogălniceanu, care citează volumul lui Schneidawind din Nürnberg, 1832.',
      quote: 'Durch Zartheit und Wohlklang ausgezeichnet, scheint sie (die Moldauische Sprache) zum Gesang geschaffen, und was die Süsse und Weichheit anbelangt, kann sie fast der Italienischen zur Seite gestellt werden.',
      source_type: 'carte de călătorie',
      location: 'Nürnberg',
      source_url: 'https://bcub.ro/lib2life/Moldau%20und%20Wallachei_Kogalniceanu_Mihail_Bukarest_1895.pdf',
      status: 'published'
    },
    '2f9fa747-9286-414f-be7f-a36ab0aa16fc': {
      year_label: '1834',
      year_start: 1834,
      year_end: 1834,
      title: 'Bessarabien. Bemerkungen und Gedanken bei Gelegenheit eines mehrjährigen Aufenthaltes in diesem Lande',
      author: 'J. H. Zucker',
      language: 'germană',
      description: 'Ediție Frankfurt am Main, 1834. Catalogul confirmă titlul, autorul și anul; lucrarea include capitolul indicat bibliografic ca „Moldauische Sprache und wallachische ...”.',
      quote: 'Moldauische Sprache und wallachische ...',
      source_type: 'carte',
      location: 'Frankfurt am Main',
      source_url: 'https://rcin.org.pl/Content/135144/PDF/WA51_156900_PAN24535-r1834_Bessarabien.pdf',
      status: 'published'
    },
    'feeaaa2c-5ee4-4961-a8fc-3a0887caf909': {
      year_label: '2014',
      year_start: 2014,
      year_end: 2014,
      title: 'Recensământul Populației și Locuințelor 2014 — limba vorbită',
      author: 'Biroul Național de Statistică al Republicii Moldova',
      language: 'moldovenească',
      description: 'Infograficul oficial al recensământului consemnează limba declarată ca fiind vorbită de populație.',
      quote: 'Populația vorbește în limba moldovenească — 54,6%',
      source_type: 'statistică oficială',
      location: 'Republica Moldova',
      source_url: 'https://statistica.gov.md/public/files/Recensamint/Recensamint_pop_2014/Rezultate/Infografic_RPL2014_2.pdf',
      status: 'published'
    }
  };

  const archiveIds = [
    '9464a290-32c6-4a1f-a123-26255c585f0c',
    '43af810a-2d62-4311-aa65-2e6fd6f08ecd',
    '674891f0-6168-4e9a-99d6-8ca191390b2c',
    '05e9f279-71e2-409a-b376-1c9864e04df0',
    '9397e1fd-016f-45f8-9587-f2ed0806fb16',
    '07e115d5-2a71-4251-950b-59153a8b2786',
    '9ceec9d8-0898-49d2-8d25-4760cca3d0e1',
    '655a00e3-fe0f-46b8-b2d8-8739d623687f',
    '5652f6de-9fed-4fd6-8d72-db7be72bb723',
    '9de4048e-6936-4327-a31b-df5e6c498fb6',
    '8e309b1b-f0e5-4857-90b0-a566bf9a37be',
    'b128cad4-c4aa-4851-be89-fb91c771ed86',
    'c4a013b9-9ebe-4c4a-8cae-3d86c6c754c5',
    '92ea3443-09aa-4cb4-962c-15e4ea8c454e',
    'a5fe003b-bb8a-44d3-bbe5-a07e3b4b5ab0',
    '2bb4001d-017c-4c65-8735-13bd7e3384a4',
    '3b5cd084-7012-45cd-b375-d9474457cee7',
    'e3352399-5946-43a1-802b-cc5243bfb7f2',
    '483fa009-7fe1-4733-a2c8-ec9a566149e9',
    '9196f87c-740c-4542-ae0f-b5cbde6a0865',
    '8439835f-00d4-4830-80dc-057d5fc5c99c',
    '6b2bad96-c430-481b-a5f3-4c14a5d6e654',
    '6553fb3a-003b-43f6-80c3-3816860de822',
    '799ab516-8610-4bc1-ab1c-5cf91e4b0f32',
    '19a4a6c6-246d-4219-9193-bc56c966b99b',
    '04234a83-1678-4385-bf7c-a54090587917',
    '9f885164-410c-4c8e-b89b-d805c26233ba',
    '6002ff81-3855-4cbb-a54e-404a212bed00',
    '1937d5fb-4bd3-4513-a579-3cbd331bcaad'
  ];

  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`
  };
  const query = new URL(`${supabaseUrl}/rest/v1/language_references`);
  query.searchParams.set('select', 'id,year_label,title,author,language,status');
  query.searchParams.set('id', `in.(${[...Object.keys(corrections), ...archiveIds].join(',')})`);
  const response = await fetch(query, { headers });
  if (!response.ok) throw new Error(`Citirea intrărilor de audit a eșuat: ${response.status}`);
  const records = await response.json();
  const byId = new Map(records.map((record) => [record.id, record]));
  const missingIds = [...Object.keys(corrections), ...archiveIds].filter((id) => !byId.has(id));
  if (missingIds.length) throw new Error(`Lipsesc intrări din catalog: ${missingIds.join(', ')}`);

  const preview = {
    corrections: Object.entries(corrections).map(([id, patch]) => ({
      id,
      before: byId.get(id),
      after: patch
    })),
    archive: archiveIds.map((id) => ({
      id,
      before: byId.get(id),
      after: { status: 'archived' }
    }))
  };

  if (APPLY) {
    const session = Object.values(localStorage).map((value) => {
      try { return JSON.parse(value); } catch { return null; }
    }).find((value) => value && value.access_token);
    if (!session?.access_token) throw new Error('Sesiunea GitHub/Supabase nu conține access token.');
    const authHeaders = {
      ...headers,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    };
    const updates = [
      ...Object.entries(corrections).map(([id, patch]) => ({ id, patch })),
      ...archiveIds.map((id) => ({ id, patch: { status: 'archived' } }))
    ];
    for (const { id, patch } of updates) {
      const target = `${supabaseUrl}/rest/v1/language_references?id=eq.${encodeURIComponent(id)}`;
      const patchResponse = await fetch(target, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify(patch)
      });
      if (!patchResponse.ok) throw new Error(`Actualizarea ${id} a eșuat: ${patchResponse.status} ${await patchResponse.text()}`);
    }
  }

  return {
    apply: APPLY,
    corrected: Object.keys(corrections).length,
    archived: archiveIds.length,
    publicAfterMigration: 'catalog total minus archived entries',
    preview
  };
})();
