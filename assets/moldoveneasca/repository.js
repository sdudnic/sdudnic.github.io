  const loadSupabaseScript = () => new Promise((resolve, reject) => {
    if (window.supabase?.createClient) {
      resolve(window.supabase);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.async = true;
    script.onload = () => window.supabase?.createClient ? resolve(window.supabase) : reject(new Error('Biblioteca Supabase nu a fost încărcată.'));
    script.onerror = () => reject(new Error('Biblioteca Supabase nu poate fi încărcată.'));
    document.head.appendChild(script);
  });

  // Catalogul și căutarea încarcă numai texte/metadate. Imaginea se cere separat,
  // după id, doar la deschiderea detaliilor sau a editorului.
  const remoteSelectFields = 'id, year_label, year_start, year_end, title, author, language, description, quote, source_type, location, source_url, catalog_type, status, owner_id';
  const mcpApiUrl = String(config.mcpApiUrl || '').replace(/\/$/, '');

  // Range explicit: listările complete nu depind de plafonul implicit PostgREST.
  const loadAllRemoteRows = async (buildQuery, isCurrent = () => true) => {
    const rows = [];
    let count = null;
    for (let offset = 0; ; offset += 100) {
      const response = await buildQuery().range(offset, offset + 99);
      if (!isCurrent()) return { data: [], count: 0 };
      if (response.error) throw response.error;
      if (Number.isFinite(response.count)) count = response.count;
      const batch = response.data || [];
      rows.push(...batch);
      if (batch.length < 100 || (count !== null && rows.length >= count)) break;
    }
    return { data: rows, count: count ?? rows.length };
  };

  const mcpRequest = async (path, { method = 'GET', body: requestBody } = {}) => {
    if (!mcpApiUrl) return null;
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error('Autentificarea este necesară pentru această acțiune.');
    const response = await fetch(`${mcpApiUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(requestBody === undefined ? {} : { 'content-type': 'application/json' })
      },
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error?.message || `API-ul a răspuns cu ${response.status}.`);
    return payload;
  };

  const loadRemoteRecords = async ({ page = currentPage, allRecords = remoteDataMode === 'all', refreshRelated = true } = {}) => {
    if (!supabaseClient) return;
    const safePage = Math.max(1, Number(page) || 1);
    const targetMode = allRecords ? 'all' : 'page';
    const previousPage = currentPage;
    const previousMode = remoteDataMode;
    const requestToken = ++remoteLoadToken;
    const isCurrent = () => requestToken === remoteLoadToken;
    currentPage = targetMode === 'all' ? 1 : safePage;
    remoteDataMode = targetMode;
    isRemotePageLoading = true;
    if (result) result.textContent = 'Se încarcă referințele…';
    updatePagination(catalogTotalRecords || remoteRecords.length);

    try {
      const languageQuery = () => supabaseClient
        .from('language_references')
        .select(remoteSelectFields, { count: 'exact' })
        .eq('status', 'published')
        .or('catalog_type.eq.language,catalog_type.eq.both,catalog_type.is.null')
        .order('year_start', { ascending: sortAscending })
        .order('id', { ascending: true });
      const from = (safePage - 1) * pageSize;

      const ethnicityQuery = () => supabaseClient
        .from('language_references')
        .select(remoteSelectFields)
        .eq('status', 'published')
        .or('catalog_type.eq.ethnicity,catalog_type.eq.both')
        .order('year_start', { ascending: true })
        .order('id', { ascending: true });
      const requests = [
        allRecords ? loadAllRemoteRows(languageQuery, isCurrent) : languageQuery().range(from, from + pageSize - 1),
        refreshRelated ? loadAllRemoteRows(ethnicityQuery, isCurrent) : { data: ethnicityRecords }
      ];
      if (currentUser) {
        const unverifiedQuery = () => {
          let query = supabaseClient
            .from('language_references')
            .select(remoteSelectFields)
            .order('year_start', { ascending: true })
            .order('id', { ascending: true });
          if (currentRole === 'admin') {
            query = query.eq('status', 'pending');
          } else {
            query = query.eq('owner_id', currentUser.id).eq('status', 'pending');
          }
          return query;
        };
        requests.push(refreshRelated ? loadAllRemoteRows(unverifiedQuery, isCurrent) : { data: unverifiedRecords });
      }

      const [languageResponse, ethnicityResponse, unverifiedResponse] = await Promise.all(requests);
      if (requestToken !== remoteLoadToken) return;
      if (languageResponse.error) throw languageResponse.error;
      if (ethnicityResponse.error) throw ethnicityResponse.error;
      if (unverifiedResponse?.error) throw unverifiedResponse.error;

      const records = (languageResponse.data || []).map(normalizeCitationRecord);
      remoteRecords = records.filter((record) => catalogIncludes(record, 'language'));
      catalogTotalRecords = Number.isFinite(languageResponse.count)
        ? languageResponse.count
        : remoteRecords.length;
      ethnicityRecords = (ethnicityResponse.data || [])
        .map(normalizeCitationRecord)
        .filter((record) => catalogIncludes(record, 'ethnicity'));
      unverifiedRecords = unverifiedResponse
        ? (unverifiedResponse.data || []).map(normalizeCitationRecord)
        : [];
      remoteCatalogLoaded = true;
      renderRemoteRows({ refresh: false });
      if (refreshRelated) {
        renderEthnicityRows({ refresh: false });
        renderUnverifiedRows({ refresh: false });
      }
    } catch (error) {
      if (requestToken === remoteLoadToken) {
        currentPage = previousPage;
        remoteDataMode = previousMode;
      }
      throw error;
    } finally {
      if (requestToken === remoteLoadToken) {
        isRemotePageLoading = false;
        filterRows();
      }
    }
  };

  const loadProfile = async (user) => {
    currentUser = user || null;
    if (!currentUser) {
      setRole('viewer');
      if (authProfile) authProfile.hidden = true;
      if (authProviders) authProviders.hidden = false;
      if (authUser) {
        authUser.textContent = '';
        authUser.hidden = true;
      }
      loginButtons.forEach((button) => {
        button.hidden = false;
        button.disabled = false;
      });
      if (logoutButton) logoutButton.hidden = true;
      setAuthMessage('Vizualizarea este deschisă tuturor. Autentifică-te cu Google sau GitHub pentru a contribui.');
      if (editorPanel) editorPanel.hidden = true;
      renderRemoteRows();
      return;
    }

    const { data: profile, error } = await supabaseClient
      .from('profiles')
      .select('role, github_login, email, display_name')
      .eq('id', currentUser.id)
      .maybeSingle();
    if (error) throw error;

    if (authProfile) authProfile.hidden = false;
    if (authProviders) authProviders.hidden = true;
    setRole(profile?.role || 'viewer');
    loginButtons.forEach((button) => { button.hidden = true; });
    if (logoutButton) logoutButton.hidden = false;
    const displayName = profile?.display_name || profile?.github_login || profile?.email || currentUser.user_metadata?.user_name || currentUser.email || 'contul tău';
    if (authUser) {
      authUser.textContent = displayName;
      authUser.hidden = false;
    }
    setAuthMessage(`${displayName} este autentificat(ă) cu rolul ${currentRole}.`);
    renderRemoteRows();
  };

  const signIn = async (provider) => {
    if (!supabaseClient) return;
    loginButtons.forEach((button) => { button.disabled = true; });
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider,
      options: { redirectTo: config.redirectTo || window.location.href }
    });
    if (error) {
      loginButtons.forEach((button) => { button.disabled = false; });
      setAuthMessage(`Autentificarea nu a reușit: ${error.message}`);
    }
  };

  const signOut = async () => {
    if (!supabaseClient) return;
    const { error } = await supabaseClient.auth.signOut();
    if (error) setAuthMessage(`Ieșirea nu a reușit: ${error.message}`);
  };

  const formPayload = () => {
    const data = new FormData(editorForm);
    const yearLabel = String(data.get('year_label') || '').trim();
    const languageValue = String(data.get('language') || '').trim();
    const descriptionValue = String(data.get('description') || '').trim();
    const primaryImageUrl = String(data.get('image_url') || '').trim();
    const primaryImageDescription = String(data.get('image_description') || '').trim();
    const primaryOriginalUrl = String(data.get('image_original_url') || '').trim();
    const primaryThumbnailUrl = String(data.get('image_thumbnail_url') || '').trim();
    const extraImageUrls = typeof data.getAll === 'function' ? data.getAll('image_item_url') : [];
    const extraImageDescriptions = typeof data.getAll === 'function' ? data.getAll('image_item_description') : [];
    const extraOriginalUrls = typeof data.getAll === 'function' ? data.getAll('image_item_original_url') : [];
    const extraThumbnailUrls = typeof data.getAll === 'function' ? data.getAll('image_item_thumbnail_url') : [];
    const primaryImage = primaryImageUrl
      ? {
        url: primaryImageUrl,
        description: primaryImageDescription,
        ...(primaryOriginalUrl ? { original_url: primaryOriginalUrl } : {}),
        ...(primaryThumbnailUrl ? { thumbnail_url: primaryThumbnailUrl } : {})
      }
      : null;
    const imageItemsPayload = [
      ...(primaryImage ? [primaryImage] : []),
      ...extraImageUrls.map((value, index) => ({
        url: String(value || '').trim(),
        description: String(extraImageDescriptions[index] || '').trim(),
        ...(String(extraOriginalUrls[index] || '').trim()
          ? { original_url: String(extraOriginalUrls[index]).trim() }
          : {}),
        ...(String(extraThumbnailUrls[index] || '').trim()
          ? { thumbnail_url: String(extraThumbnailUrls[index]).trim() }
          : {})
      })).filter((item) => item.url)
    ];
    const [yearStartBound, yearEnd] = yearBoundsFromLabel(yearLabel);
    const yearStart = normalize(yearLabel) === 'necunoscut' ? null : yearStartBound;
    const payload = {
      year_label: yearLabel,
      year_start: yearStart,
      year_end: yearEnd,
      title: String(data.get('title') || '').trim(),
      language: languageValue
        ? citationLanguageCode({ language: languageCode(languageValue, { description: descriptionValue }) })
        : null,
      author: String(data.get('author') || '').trim() || null,
      source_type: String(data.get('source_type') || '').trim() || null,
      catalog_type: catalogTypeValues.has(String(data.get('catalog_type') || '').trim())
        ? String(data.get('catalog_type')).trim()
        : 'language',
      description: descriptionValue || null,
      quote: String(data.get('quote') || '').trim() || null,
      location: String(data.get('location') || '').trim() || null,
      source_url: String(data.get('source_url') || '').trim() || null,
      image_url: imageItemsPayload[0]?.url || null,
      image_items: imageItemsPayload
    };
    if (String(currentUser?.email || '').trim().toLowerCase() === 'sdudnic@gmail.com') {
      payload.status = String(data.get('status') || 'pending');
    }
    return payload;
  };

  const persistRecord = async (event) => {
    event.preventDefault();
    if (editorForm.querySelector('button[type="submit"]')?.disabled) return;
    if (!supabaseClient || !currentUser) {
      setStatus('Autentifică-te pentru a adăuga sau propune o editare.', 'error');
      return;
    }
    const payload = formPayload();
    const exactYear = /^(?:1[0-9]{3}|20[0-9]{2})$/.test(payload.year_label);
    const century = parseCenturyRange(payload.year_label);
    if ((!exactYear && !century && normalize(payload.year_label) !== 'necunoscut') || !payload.title) {
      setStatus('Completează anul, secolul sau „necunoscut” și denumirea lucrării.', 'error');
      return;
    }
    if (['ethnicity', 'both'].includes(payload.catalog_type) && !payload.source_url) {
      setStatus('Referințele din catalogul etnic trebuie să aibă o legătură către sursa verificabilă.', 'error');
      return;
    }
    if (['ethnicity', 'both'].includes(payload.catalog_type) && !payload.author) {
      setStatus('Indică autorul din sursă sau „autor neindicat în sursă”.', 'error');
      return;
    }
    const galleryWithinLimit = typeof imageItemsWithinLimit === 'function'
      ? imageItemsWithinLimit(payload.image_items)
      : payload.image_items.every((item) => imageValueWithinLimit(item.url));
    if (!galleryWithinLimit) {
      setStatus('Galeria este prea mare. Compactează fiecare captură la maximum 1,5 MB și păstrează cel mult 12 imagini.', 'error');
      return;
    }
    if (payload.image_items.some((item) => !String(item.description || '').trim())) {
      setStatus('Fiecare imagine adăugată trebuie să aibă propria descriere.', 'error');
      return;
    }
    if (!mcpApiUrl && payload.image_items.some((item) => /^data:image\//i.test(String(item.url || '').replace(/\s+/g, '')))) {
      setStatus('Imaginile noi trebuie salvate prin Worker-ul conectat la Cloudflare R2.', 'error');
      return;
    }
    const quoteHasGlotonym = hasGlotonym(payload.quote);
    const contextText = [
      payload.title,
      payload.source_type,
      payload.description
    ].filter(Boolean).join(' ');
    const languageEvidence = hasLanguageAndGlotonym(payload.quote) || hasLanguageAndGlotonym(contextText);
    const ethnicityEvidence = hasEthnicityEvidence(payload.quote) || hasEthnicityEvidence(contextText);
    const languageCatalog = payload.catalog_type === 'language';
    const ethnicityCatalog = payload.catalog_type === 'ethnicity';
    const validQuote = payload.catalog_type === 'both'
      ? languageEvidence && ethnicityEvidence
      : languageCatalog
        ? languageEvidence
        : ethnicityCatalog
          ? ethnicityEvidence
          : false;
    if (!payload.quote || !quoteHasGlotonym || !validQuote) {
      setStatus(quoteRequirement(payload.catalog_type).error, 'error');
      return;
    }

    const submitButton = editorForm.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    setStatus(payload.image_items.length ? 'Se încarcă imaginile în R2 și se salvează referința…' : 'Se salvează…');

    let response;
    if (mcpApiUrl) {
      try {
        const result = editingId
          ? await mcpRequest(`/api/references/${encodeURIComponent(editingId)}`, { method: 'PATCH', body: { changes: payload } })
          : await mcpRequest('/api/references', { method: 'POST', body: payload });
        const resultData = result?.data || {};
        response = {
          data: resultData.reference || null,
          request: resultData.request || null,
          message: resultData.message || null,
          error: null
        };
      } catch (error) {
        response = { data: null, error };
      }
    } else if (editingId) {
      const isPrimaryAdmin = String(currentUser?.email || '').trim().toLowerCase() === 'sdudnic@gmail.com';
      const { data: existing, error: existingError } = await supabaseClient
        .from('language_references')
        .select('*')
        .eq('id', editingId)
        .maybeSingle();
      if (existingError) {
        response = { data: null, error: existingError };
      } else if (!existing) {
        response = { data: null, error: new Error('Referința nu a fost găsită.') };
      } else if (!isPrimaryAdmin && currentRole !== 'admin' && !(existing.owner_id === currentUser.id && existing.status === 'pending')) {
        const { data: request, error: requestError } = await supabaseClient.from('reference_moderation_requests').insert({
          reference_id: editingId,
          requested_by: currentUser.id,
          request_type: 'edit',
          proposed_changes: payload,
          target_snapshot: existing,
          reason: null,
          status: 'pending'
        }).select().single();
        response = {
          data: null,
          request,
          error: requestError,
          message: 'Editarea voastră este trimisă premoderare și rămâne în lista de neverificate.'
        };
      } else {
        response = await supabaseClient.from('language_references').update(payload).eq('id', editingId).select().single();
      }
    } else {
      response = await supabaseClient.from('language_references').insert({ ...payload, owner_id: currentUser.id }).select().single();
    }

    if (submitButton) submitButton.disabled = false;
    if (response.error) {
      setStatus(`Nu s-a putut salva referința: ${response.error.message}`, 'error');
      return;
    }
    if (response.request) {
      closeEditor();
      setAuthMessage(response.message || 'Editarea voastră este trimisă premoderare și rămâne în lista de neverificate.');
      await loadRemoteRecords();
      return;
    }
    const savedInDetail = editorInDetail;
    if (response.data?.id) cacheRecordImage(String(response.data.id), response.data.image_url, response.data.image_items);
    if (savedInDetail) currentDetailRecord = response.data;
    closeEditor();
    setAuthMessage(String(currentUser?.email || '').toLowerCase() === 'sdudnic@gmail.com'
        ? 'Referința a fost salvată de proprietarul catalogului.'
        : 'Editarea voastră este trimisă premoderare și rămâne în lista de neverificate.');
    if (savedInDetail && response.data) openDetail(response.data, lastDetailTrigger);
    await loadRemoteRecords();
  };

  let isSavingRecord = false;
  const saveRecord = async (event) => {
    event.preventDefault();
    if (isSavingRecord) return;
    isSavingRecord = true;
    try {
      await persistRecord(event);
    } catch (error) {
      if (editorPanel?.hidden) {
        setAuthMessage(`Salvarea a reușit, dar lista nu a putut fi reîncărcată: ${error.message}`);
      } else {
        setStatus(`Nu s-a putut salva referința: ${error.message}`, 'error');
      }
    } finally {
      isSavingRecord = false;
      const button = editorForm?.querySelector('button[type="submit"]');
      if (button) button.disabled = false;
    }
  };

  const deleteSelectedRecords = async () => {
    if (String(currentUser?.email || '').toLowerCase() !== 'sdudnic@gmail.com' || !supabaseClient) return;
    const ids = [...selectedReferenceIds];
    if (!ids.length) return;
    const label = ids.length === 1 ? 'referința selectată' : 'referințele selectate';
    if (!window.confirm(`Ștergi ${label} (${ids.length})?`)) return;
    if (selectionDeleteButton) selectionDeleteButton.disabled = true;
    let error = null;
    if (mcpApiUrl) {
      try {
        await Promise.all(ids.map((id) => mcpRequest(`/api/references/${encodeURIComponent(id)}`, { method: 'DELETE', body: {} })));
      } catch (requestError) {
        error = requestError;
      }
    } else {
      ({ error } = await supabaseClient.from('language_references').delete().in('id', ids));
    }
    if (error) {
      setAuthMessage(`Referințele nu au putut fi șterse: ${error.message}`);
      updateSelectionUi();
      return;
    }
    selectedReferenceIds.clear();
    ids.forEach((id) => recordImageCache.delete(String(id)));
    await loadRemoteRecords();
  };

  const requestRecordDeletion = async (record) => {
    if (!currentUser || !record?.id || String(currentUser.email || '').trim().toLowerCase() === 'sdudnic@gmail.com') return;
    const reason = window.prompt('De ce propui ștergerea acestei referințe?', 'Sursa sau citatul trebuie reverificate.');
    if (reason === null) return;
    try {
      if (mcpApiUrl) {
        const result = await mcpRequest(`/api/references/${encodeURIComponent(record.id)}`, { method: 'DELETE', body: { reason } });
        setAuthMessage(result?.data?.message || 'Sugestia de ștergere a fost trimisă premoderării.');
      } else {
        const { data: snapshot, error: snapshotError } = await supabaseClient
          .from('language_references')
          .select('*')
          .eq('id', record.id)
          .maybeSingle();
        if (snapshotError) throw snapshotError;
        const { error } = await supabaseClient.from('reference_moderation_requests').insert({
          reference_id: record.id,
          requested_by: currentUser.id,
          request_type: 'delete',
          proposed_changes: {},
          target_snapshot: snapshot,
          reason: reason.trim() || null,
          status: 'pending'
        });
        if (error) throw error;
        setAuthMessage('Sugestia de ștergere a fost trimisă premoderării. Editarea voastră este trimisă premoderare.');
      }
      await loadRemoteRecords();
    } catch (error) {
      setAuthMessage(`Sugestia nu a putut fi trimisă: ${error.message}`);
    }
  };

