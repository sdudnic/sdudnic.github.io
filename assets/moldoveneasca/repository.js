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

  const loadRemoteRecords = async ({ page = currentPage, allRecords = remoteDataMode === 'all' } = {}) => {
    if (!supabaseClient) return;
    const safePage = Math.max(1, Number(page) || 1);
    const targetMode = allRecords ? 'all' : 'page';
    const previousPage = currentPage;
    const previousMode = remoteDataMode;
    const requestToken = ++remoteLoadToken;
    currentPage = targetMode === 'all' ? 1 : safePage;
    remoteDataMode = targetMode;
    isRemotePageLoading = true;
    if (result) result.textContent = 'Se încarcă referințele…';
    updatePagination(catalogTotalRecords || remoteRecords.length);

    try {
      let languageQuery = supabaseClient
        .from('language_references')
        .select(remoteSelectFields, { count: 'exact' })
        .eq('status', 'published')
        .or('catalog_type.eq.language,catalog_type.eq.both,catalog_type.is.null')
        .order('year_start', { ascending: true });
      if (!allRecords) {
        const from = (safePage - 1) * pageSize;
        languageQuery = languageQuery.range(from, from + pageSize - 1);
      }

      const ethnicityQuery = supabaseClient
        .from('language_references')
        .select(remoteSelectFields)
        .eq('status', 'published')
        .or('catalog_type.eq.ethnicity,catalog_type.eq.both')
        .order('year_start', { ascending: true });
      const requests = [languageQuery, ethnicityQuery];
      if (currentRole === 'admin') {
        requests.push(supabaseClient
          .from('language_references')
          .select(remoteSelectFields)
          .neq('status', 'published')
          .order('year_start', { ascending: true }));
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
      renderRemoteRows();
      renderEthnicityRows();
      renderUnverifiedRows();
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
      if (authUser) {
        authUser.textContent = '';
        authUser.hidden = true;
      }
      loginButtons.forEach((button) => {
        button.hidden = false;
        button.disabled = false;
      });
      if (logoutButton) logoutButton.hidden = true;
      if (authMessage) authMessage.textContent = 'Vizualizarea este deschisă tuturor. Autentifică-te cu Google sau GitHub pentru a contribui.';
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

    setRole(profile?.role || 'viewer');
    loginButtons.forEach((button) => { button.hidden = true; });
    if (logoutButton) logoutButton.hidden = false;
    const displayName = profile?.display_name || profile?.github_login || profile?.email || currentUser.user_metadata?.user_name || currentUser.email || 'contul tău';
    if (authUser) {
      authUser.textContent = displayName;
      authUser.hidden = false;
    }
    if (authMessage) authMessage.textContent = `${displayName} este autentificat(ă) cu rolul ${currentRole}.`;
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
      if (authMessage) authMessage.textContent = `Autentificarea nu a reușit: ${error.message}`;
    }
  };

  const signOut = async () => {
    if (!supabaseClient) return;
    const { error } = await supabaseClient.auth.signOut();
    if (error && authMessage) authMessage.textContent = `Ieșirea nu a reușit: ${error.message}`;
  };

  const formPayload = () => {
    const data = new FormData(editorForm);
    const yearLabel = String(data.get('year_label') || '').trim();
    const [yearStart, yearEnd] = yearBoundsFromLabel(yearLabel);
    const languageValue = String(data.get('language') || '').trim();
    const descriptionValue = String(data.get('description') || '').trim();
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
      image_url: String(data.get('image_url') || '').trim() || null
    };
    if (currentRole === 'admin') payload.status = String(data.get('status') || 'pending');
    return payload;
  };

  const saveRecord = async (event) => {
    event.preventDefault();
    if (!supabaseClient || !currentUser || !['editor', 'admin'].includes(currentRole)) {
      setStatus('Autentifică-te cu un cont cu rol de editor.', 'error');
      return;
    }
    const payload = formPayload();
    const exactYear = /^(?:1[0-9]{3}|20[0-9]{2})$/.test(payload.year_label);
    const century = parseCenturyRange(payload.year_label);
    if ((!exactYear && !century) || !payload.title) {
      setStatus('Completează anul publicării citatului sau secolul (de exemplu XVII) și denumirea lucrării.', 'error');
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
    setStatus('Se salvează…');

    let response;
    if (editingId) {
      response = await supabaseClient.from('language_references').update(payload).eq('id', editingId).select().single();
    } else {
      response = await supabaseClient.from('language_references').insert({ ...payload, owner_id: currentUser.id }).select().single();
    }

    if (submitButton) submitButton.disabled = false;
    if (response.error) {
      setStatus(`Nu s-a putut salva referința: ${response.error.message}`, 'error');
      return;
    }
    const savedInDetail = editorInDetail;
    if (response.data?.id) recordImageCache.set(String(response.data.id), response.data.image_url || null);
    if (savedInDetail) currentDetailRecord = response.data;
    closeEditor();
    if (savedInDetail && response.data) openDetail(response.data, lastDetailTrigger);
    await loadRemoteRecords();
  };

  const deleteSelectedRecords = async () => {
    if (currentRole !== 'admin' || !supabaseClient) return;
    const ids = [...selectedReferenceIds];
    if (!ids.length) return;
    const label = ids.length === 1 ? 'referința selectată' : 'referințele selectate';
    if (!window.confirm(`Ștergi ${label} (${ids.length})?`)) return;
    if (selectionDeleteButton) selectionDeleteButton.disabled = true;
    const { error } = await supabaseClient.from('language_references').delete().in('id', ids);
    if (error) {
      if (authMessage) authMessage.textContent = `Referințele nu au putut fi șterse: ${error.message}`;
      updateSelectionUi();
      return;
    }
    selectedReferenceIds.clear();
    ids.forEach((id) => recordImageCache.delete(String(id)));
    await loadRemoteRecords();
  };

