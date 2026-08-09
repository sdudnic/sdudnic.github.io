(() => {
  const root = document.querySelector('[data-moldoveneasca-catalog]');
  if (!root) return;

  const config = window.MOLDOVENEASCA_CONFIG || {};
  const table = document.querySelector('.post-content table') || document.querySelector('table');
  const tbody = table?.querySelector('tbody');
  const searchInput = root.querySelector('[data-catalog-search]');
  const periodSelect = root.querySelector('[data-catalog-period]');
  const linkedCheckbox = root.querySelector('[data-catalog-linked]');
  const resetButton = root.querySelector('[data-catalog-reset]');
  const result = root.querySelector('[data-catalog-result]');
  const authMessage = root.querySelector('[data-auth-message]');
  const roleBadge = root.querySelector('[data-role-badge]');
  const loginButton = root.querySelector('[data-login]');
  const logoutButton = root.querySelector('[data-logout]');
  const openFormButton = root.querySelector('[data-open-form]');
  const editorPanel = root.querySelector('[data-reference-editor]');
  const editorForm = root.querySelector('[data-reference-form]');
  const formTitle = root.querySelector('[data-form-title]');
  const formStatus = root.querySelector('[data-form-status]');
  const cancelEditButton = root.querySelector('[data-cancel-edit]');
  const adminOnlyField = root.querySelector('[data-admin-only]');
  const recordCount = root.querySelector('[data-record-count]');
  const linkedCount = root.querySelector('[data-linked-count]');
  const yearRange = root.querySelector('[data-year-range]');

  if (!table || !tbody) return;
  table.classList.add('moldoveneasca-table');

  let supabaseClient = null;
  let currentUser = null;
  let currentRole = 'viewer';
  let editingId = null;
  let remoteRecords = [];

  const normalize = (value) => (value || '')
    .toLocaleLowerCase('ro-MD')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const parseYears = (value) => [...String(value || '').matchAll(/\b(1[0-9]{3}|20[0-9]{2})\b/g)]
    .map((match) => Number(match[1]));

  const parseYearStart = (record) => {
    if (Number.isFinite(Number(record?.year_start))) return Number(record.year_start);
    return parseYears(record?.year_label)[0] || null;
  };

  const parseYearEnd = (record) => {
    if (Number.isFinite(Number(record?.year_end))) return Number(record.year_end);
    const years = parseYears(record?.year_label);
    return years[1] || years[0] || null;
  };

  const yearRangeLabel = (record) => {
    const start = parseYearStart(record);
    const end = parseYearEnd(record);
    if (!start) return '—';
    return end && end !== start ? `${start}–${end}` : String(start);
  };

  const currentRows = () => Array.from(tbody.rows);

  const setRowMetadata = (row) => {
    row.dataset.catalogYear = String(parseYears(row.cells[0]?.textContent)[0] || '');
    row.dataset.catalogLinked = row.querySelector('a[href]') ? 'true' : 'false';
  };

  currentRows().forEach(setRowMetadata);
  const staticRows = currentRows();

  const getPeriodRange = (value) => {
    switch (value) {
      case 'before-1600': return { min: -Infinity, max: 1599 };
      case '1600-1799': return { min: 1600, max: 1799 };
      case '1800-1899': return { min: 1800, max: 1899 };
      case '1900-1999': return { min: 1900, max: 1999 };
      case '2000-now': return { min: 2000, max: Infinity };
      default: return { min: -Infinity, max: Infinity };
    }
  };

  const updateStats = () => {
    const rows = currentRows();
    const years = rows
      .map((row) => Number(row.dataset.catalogYear))
      .filter((year) => Number.isFinite(year));
    const linked = rows.filter((row) => row.dataset.catalogLinked === 'true').length;

    if (recordCount) recordCount.textContent = String(rows.length);
    if (linkedCount) linkedCount.textContent = String(linked);
    if (yearRange) {
      yearRange.textContent = years.length
        ? `${Math.min(...years)}–${Math.max(...years)}`
        : '—';
    }
  };

  const filterRows = () => {
    const query = normalize(searchInput?.value);
    const period = getPeriodRange(periodSelect?.value);
    const onlyLinked = Boolean(linkedCheckbox?.checked);
    let visible = 0;

    currentRows().forEach((row) => {
      const year = Number(row.dataset.catalogYear);
      const matchesQuery = !query || normalize(row.textContent).includes(query);
      const matchesPeriod = !Number.isFinite(year) || (year >= period.min && year <= period.max);
      const matchesLink = !onlyLinked || row.dataset.catalogLinked === 'true';
      const matches = matchesQuery && matchesPeriod && matchesLink;
      row.hidden = !matches;
      if (matches) visible += 1;
    });

    if (result) {
      result.textContent = `Se afișează ${visible} din ${currentRows().length} referințe.`;
    }
  };

  const sortRowsChronologically = () => {
    const rows = currentRows();
    rows.sort((a, b) => {
      const yearA = Number(a.dataset.catalogYear) || Number.POSITIVE_INFINITY;
      const yearB = Number(b.dataset.catalogYear) || Number.POSITIVE_INFINITY;
      return yearA - yearB;
    });
    rows.forEach((row) => tbody.appendChild(row));
  };

  const setStatus = (message, tone = '') => {
    if (!formStatus) return;
    formStatus.textContent = message;
    formStatus.dataset.tone = tone;
  };

  const setRole = (role) => {
    currentRole = ['viewer', 'editor', 'admin'].includes(role) ? role : 'viewer';
    if (roleBadge) {
      roleBadge.textContent = currentRole;
      roleBadge.dataset.role = currentRole;
    }
    if (openFormButton) openFormButton.hidden = !['editor', 'admin'].includes(currentRole) || !currentUser;
    if (adminOnlyField) adminOnlyField.hidden = currentRole !== 'admin';
  };

  const closeEditor = () => {
    editingId = null;
    if (editorForm) editorForm.reset();
    if (formTitle) formTitle.textContent = 'Adaugă o referință';
    setStatus('');
    if (editorPanel) editorPanel.hidden = true;
  };

  const setField = (name, value) => {
    const field = editorForm?.elements.namedItem(name);
    if (field) field.value = value || '';
  };

  const openEditor = (record = null) => {
    if (!editorPanel || !editorForm) return;
    if (!currentUser || !['editor', 'admin'].includes(currentRole)) {
      setStatus('Contul nu are drepturi de editare.', 'error');
      return;
    }

    editingId = record?.id || null;
    if (formTitle) formTitle.textContent = editingId ? 'Editează referința' : 'Adaugă o referință';
    setField('year_label', record?.year_label);
    setField('title', record?.title);
    setField('author', record?.author);
    setField('source_type', record?.source_type);
    setField('description', record?.description);
    setField('quote', record?.quote);
    setField('location', record?.location);
    setField('source_url', record?.source_url);
    setField('status', record?.status || 'pending');
    setStatus('');
    editorPanel.hidden = false;
    editorPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const textCell = (value, className = '') => {
    const cell = document.createElement('td');
    if (className) cell.className = className;
    cell.textContent = value || '';
    return cell;
  };

  const appendTextBlock = (parent, tag, value, className = '') => {
    if (!value) return;
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value;
    parent.appendChild(element);
  };

  const createRemoteRow = (record) => {
    const row = document.createElement('tr');
    row.dataset.remoteReference = record.id;
    row.appendChild(textCell(yearRangeLabel(record), 'moldoveneasca-table__year'));

    const sourceCell = document.createElement('td');
    const title = document.createElement('strong');
    title.textContent = record.title || 'Referință fără titlu';
    sourceCell.appendChild(title);
    appendTextBlock(sourceCell, 'span', record.author, 'moldoveneasca-table__author');
    appendTextBlock(sourceCell, 'p', record.description);
    appendTextBlock(sourceCell, 'blockquote', record.quote, 'moldoveneasca-table__quote');

    if (record.source_type || record.location) {
      const meta = document.createElement('span');
      meta.className = 'moldoveneasca-table__meta';
      meta.textContent = [record.source_type, record.location].filter(Boolean).join(' · ');
      sourceCell.appendChild(meta);
    }

    if (record.source_url) {
      const link = document.createElement('a');
      link.href = record.source_url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Deschide sursa';
      link.className = 'moldoveneasca-table__source-link';
      sourceCell.appendChild(link);
    }

    const canEdit = currentRole === 'admin' || (currentRole === 'editor' && currentUser?.id === record.owner_id);
    if (canEdit) {
      const actions = document.createElement('div');
      actions.className = 'moldoveneasca-table__actions';
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'moldoveneasca-button moldoveneasca-button--quiet';
      editButton.textContent = 'Editează';
      editButton.addEventListener('click', () => openEditor(record));
      actions.appendChild(editButton);

      if (currentRole === 'admin') {
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'moldoveneasca-button moldoveneasca-button--danger';
        deleteButton.textContent = 'Șterge';
        deleteButton.addEventListener('click', () => deleteRecord(record));
        actions.appendChild(deleteButton);
      }
      sourceCell.appendChild(actions);
    }

    if (record.status && record.status !== 'published') {
      const badge = document.createElement('span');
      badge.className = 'moldoveneasca-status';
      badge.textContent = record.status === 'pending' ? 'În verificare' : record.status;
      sourceCell.appendChild(badge);
    }

    row.appendChild(sourceCell);
    setRowMetadata(row);
    return row;
  };

  const renderRemoteRows = () => {
    table.querySelectorAll('tr[data-remote-reference]').forEach((row) => row.remove());
    if (remoteRecords.length) {
      staticRows.forEach((row) => row.remove());
    } else {
      staticRows.forEach((row) => {
        if (!tbody.contains(row)) tbody.appendChild(row);
      });
    }
    remoteRecords.forEach((record) => tbody.appendChild(createRemoteRow(record)));
    sortRowsChronologically();
    updateStats();
    filterRows();
  };

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

  const loadRemoteRecords = async () => {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient
      .from('language_references')
      .select('id, year_label, year_start, year_end, title, author, description, quote, source_type, location, source_url, status, owner_id')
      .order('year_start', { ascending: true });
    if (error) throw error;
    remoteRecords = data || [];
    renderRemoteRows();
  };

  const loadProfile = async (user) => {
    currentUser = user || null;
    if (!currentUser) {
      setRole('viewer');
      if (roleBadge) roleBadge.textContent = 'viewer';
      if (loginButton) loginButton.hidden = false;
      if (logoutButton) logoutButton.hidden = true;
      if (authMessage) authMessage.textContent = 'Vizualizarea și filtrarea sunt deschise tuturor. Autentifică-te cu GitHub pentru a folosi funcțiile de editor.';
      if (editorPanel) editorPanel.hidden = true;
      renderRemoteRows();
      return;
    }

    const { data: profile, error } = await supabaseClient
      .from('profiles')
      .select('role, github_login, display_name')
      .eq('id', currentUser.id)
      .maybeSingle();
    if (error) throw error;

    setRole(profile?.role || 'viewer');
    if (loginButton) loginButton.hidden = true;
    if (logoutButton) logoutButton.hidden = false;
    const displayName = profile?.display_name || profile?.github_login || currentUser.user_metadata?.user_name || currentUser.email || 'contul tău';
    if (authMessage) {
      authMessage.textContent = currentRole === 'viewer'
        ? `${displayName} este autentificat(ă) cu rolul viewer. Un administrator poate acorda rolul editor.`
        : `${displayName} este autentificat(ă) cu rolul ${currentRole}.`;
    }
    renderRemoteRows();
  };

  const signIn = async () => {
    if (!supabaseClient) return;
    loginButton.disabled = true;
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: config.redirectTo || window.location.href }
    });
    if (error) {
      loginButton.disabled = false;
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
    const years = parseYears(yearLabel);
    const payload = {
      year_label: yearLabel,
      year_start: years[0] || null,
      year_end: years[1] || years[0] || null,
      title: String(data.get('title') || '').trim(),
      author: String(data.get('author') || '').trim() || null,
      source_type: String(data.get('source_type') || '').trim() || null,
      description: String(data.get('description') || '').trim() || null,
      quote: String(data.get('quote') || '').trim() || null,
      location: String(data.get('location') || '').trim() || null,
      source_url: String(data.get('source_url') || '').trim() || null
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
    if (!payload.year_label || !payload.title) {
      setStatus('Completează anul și titlul documentului.', 'error');
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

    setStatus('Referința a fost salvată.');
    closeEditor();
    await loadRemoteRecords();
  };

  const deleteRecord = async (record) => {
    if (currentRole !== 'admin' || !supabaseClient) return;
    if (!window.confirm(`Ștergi referința „${record.title}”?`)) return;
    const { error } = await supabaseClient.from('language_references').delete().eq('id', record.id);
    if (error) {
      if (authMessage) authMessage.textContent = `Referința nu a putut fi ștearsă: ${error.message}`;
      return;
    }
    await loadRemoteRecords();
  };

  searchInput?.addEventListener('input', filterRows);
  periodSelect?.addEventListener('change', filterRows);
  linkedCheckbox?.addEventListener('change', filterRows);
  resetButton?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    if (periodSelect) periodSelect.value = 'all';
    if (linkedCheckbox) linkedCheckbox.checked = false;
    filterRows();
  });
  loginButton?.addEventListener('click', signIn);
  logoutButton?.addEventListener('click', signOut);
  openFormButton?.addEventListener('click', () => openEditor());
  cancelEditButton?.addEventListener('click', closeEditor);
  editorForm?.addEventListener('submit', saveRecord);

  updateStats();
  filterRows();
  setRole('viewer');

  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    if (loginButton) loginButton.disabled = true;
    if (authMessage) authMessage.textContent = 'Catalogul public și filtrele funcționează acum fără cont. Autentificarea GitHub va fi activată după conectarea proiectului Supabase gratuit.';
    return;
  }

  (async () => {
    try {
      const supabase = await loadSupabaseScript();
      supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      const { data: sessionData } = await supabaseClient.auth.getSession();
      await loadProfile(sessionData?.session?.user || null);
      await loadRemoteRecords();
      supabaseClient.auth.onAuthStateChange((_event, session) => {
        loadProfile(session?.user || null).catch((error) => {
          if (authMessage) authMessage.textContent = `Profilul nu a putut fi încărcat: ${error.message}`;
        });
      });
    } catch (error) {
      if (loginButton) loginButton.disabled = true;
      if (authMessage) authMessage.textContent = `Catalogul public funcționează, dar autentificarea nu este disponibilă încă: ${error.message}`;
    }
  })();
})();
