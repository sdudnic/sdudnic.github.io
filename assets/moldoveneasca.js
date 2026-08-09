(() => {
  const root = document.querySelector('[data-moldoveneasca-catalog]');
  if (!root) return;

  const config = window.MOLDOVENEASCA_CONFIG || {};
  const table = document.querySelector('.post-content table') || document.querySelector('table');
  const tbody = table?.querySelector('tbody');
  const searchInput = root.querySelector('[data-catalog-search]');
  const resetButton = root.querySelector('[data-catalog-reset]');
  const result = root.querySelector('[data-catalog-result]');
  const authMessage = document.querySelector('[data-auth-message]');
  const authUser = document.querySelector('[data-auth-user]');
  const roleBadge = document.querySelector('[data-role-badge]');
  const loginButton = document.querySelector('[data-login]');
  const logoutButton = document.querySelector('[data-logout]');
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
  const pagination = document.querySelector('[data-catalog-pagination]');
  const previousPageButton = document.querySelector('[data-page-previous]');
  const nextPageButton = document.querySelector('[data-page-next]');
  const pageStatus = document.querySelector('[data-page-status]');

  if (!table || !tbody) return;
  table.classList.add('moldoveneasca-table');

  let supabaseClient = null;
  let currentUser = null;
  let currentRole = 'viewer';
  let editingId = null;
  let remoteRecords = [];
  let sortAscending = true;
  let sortButton = null;
  let rowSequence = 0;
  const pageSize = 50;
  let currentPage = 1;

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

  const toRoman = (number) => {
    const values = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let resultText = '';
    let rest = number;
    values.forEach(([value, symbol]) => {
      while (rest >= value) {
        resultText += symbol;
        rest -= value;
      }
    });
    return resultText;
  };

  const centuryLabel = (record) => {
    const year = parseYearStart(record);
    if (!year) return '—';
    return `secolul ${toRoman(Math.floor((year - 1) / 100) + 1)}`;
  };

  const extractCellText = (cell) => {
    if (!cell) return '';
    const clone = cell.cloneNode(true);
    clone.querySelectorAll('a').forEach((link) => link.remove());
    return clone.textContent.replace(/\s+/g, ' ').trim();
  };

  const extractQuote = (value) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    const candidates = [];
    for (const match of text.matchAll(/«([^»]{8,})»/g)) candidates.push(match[1]);
    for (const match of text.matchAll(/“([^”]{8,})”/g)) candidates.push(match[1]);
    for (const match of text.matchAll(/"([^"\n]{8,})"/g)) candidates.push(match[1]);
    const preferred = candidates.find((candidate) => /moldov|moldav|lingua|limba/i.test(candidate));
    if (preferred) return preferred.trim();
    const labelled = text.match(/Citatul:\s*(.{8,240}?)(?:,\s*Contextul:|$)/i);
    return labelled ? labelled[1].replace(/^['"«“]|['"»”]$/g, '').trim() : null;
  };

  const extractAuthor = (value) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    const explicit = text.match(/Autorul:\s*([^,;.]+)/i);
    if (explicit) return explicit[1].trim();
    const leading = text.match(/^([^,;]{2,80}),\s*(?:["«“]|Citatul:|Letopisețul|Mărturisirea)/i);
    return leading ? leading[1].trim() : null;
  };

  const extractTitle = (value) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    const contextTitle = text.match(/(?:în|in)\s+["«“]([^"»”]{3,140})["»”]/i);
    if (contextTitle) return contextTitle[1].trim();
    const quotedTitle = text.match(/^["«“]([^"»”]{3,140})["»”]/);
    if (quotedTitle) return quotedTitle[1].trim();
    const namedTitle = text.match(/,\s*["«“]([^"»”]{3,140})["»”]/);
    return namedTitle ? namedTitle[1].trim() : null;
  };

  const recordFromStaticRow = (row) => {
    const yearLabel = row.cells[0]?.textContent.trim() || '';
    const sourceText = extractCellText(row.cells[1]);
    const sourceUrl = row.cells[1]?.querySelector('a[href]')?.href || null;
    const title = extractTitle(sourceText) || sourceText;
    return {
      year_label: yearLabel,
      year_start: parseYears(yearLabel)[0] || null,
      year_end: parseYears(yearLabel)[1] || parseYears(yearLabel)[0] || null,
      title,
      quote: extractQuote(sourceText),
      language: null,
      author: extractAuthor(sourceText),
      source_url: sourceUrl,
      source_type: null,
      location: null,
      description: null,
      status: 'published',
      owner_id: null
    };
  };

  const displayFields = (record) => {
    const raw = record?.title || '';
    const imported = record?.source_type === 'Import din tabelul existent';
    return {
      year: yearRangeLabel(record),
      century: centuryLabel(record),
      title: imported ? (extractTitle(raw) || raw) : (raw || '—'),
      quote: record?.quote || (imported ? extractQuote(raw) : null),
      language: record?.language || '—',
      author: record?.author || (imported ? extractAuthor(raw) : null) || '—'
    };
  };

  const ensureTableHeader = () => {
    const thead = table.tHead || table.querySelector('thead');
    const headRow = thead?.rows[0] || table.querySelector('thead tr');
    if (!thead || !headRow) return;
    headRow.replaceChildren();
    const headings = [
      ['year', 'Perioadă / an'],
      ['century', 'Secol'],
      ['title', 'Denumirea lucrării'],
      ['quote', 'Citatul care menționează „moldovenească”'],
      ['language', 'Limba'],
      ['author', 'Autorul'],
      ['source', 'Sursa']
    ];
    headings.forEach(([key, label]) => {
      const th = document.createElement('th');
      th.scope = 'col';
      if (key === 'year') {
        sortButton = document.createElement('button');
        sortButton.type = 'button';
        sortButton.className = 'moldoveneasca-table__sort';
        sortButton.dataset.sortYear = 'true';
        sortButton.addEventListener('click', () => {
          sortAscending = !sortAscending;
          currentPage = 1;
          sortRowsChronologically();
          filterRows();
        });
        th.appendChild(sortButton);
      } else {
        th.textContent = label;
      }
      headRow.appendChild(th);
    });

    thead.querySelector('.moldoveneasca-table__filters')?.remove();
    const filterRow = document.createElement('tr');
    filterRow.className = 'moldoveneasca-table__filters';
    const filters = [
      ['year', 'An'],
      ['century', 'Toate secolele'],
      ['title', 'Filtru'],
      ['quote', 'Filtru'],
      ['language', 'Filtru'],
      ['author', 'Filtru'],
      ['source', 'Filtru']
    ];
    filters.forEach(([key, placeholder]) => {
      const th = document.createElement('th');
      th.scope = 'col';
      const control = key === 'century' ? document.createElement('select') : document.createElement('input');
      control.dataset.columnFilter = key;
      control.setAttribute('aria-label', `Filtru pentru ${key}`);
      if (key === 'century') {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = placeholder;
        control.appendChild(option);
      } else {
        control.type = 'search';
        control.placeholder = placeholder;
        control.autocomplete = 'off';
      }
      control.addEventListener('input', () => {
        currentPage = 1;
        filterRows();
      });
      control.addEventListener('change', () => {
        currentPage = 1;
        filterRows();
      });
      th.appendChild(control);
      filterRow.appendChild(th);
    });
    thead.appendChild(filterRow);
  };

  const currentRows = () => Array.from(tbody.rows);

  const setRowMetadata = (row, record) => {
    const fields = displayFields(record);
    row.catalogFields = {
      year: normalize([record?.year_label, fields.year].filter(Boolean).join(' ')),
      century: normalize(fields.century),
      title: normalize(fields.title),
      quote: normalize(fields.quote),
      language: normalize(fields.language),
      author: normalize(fields.author),
      source: normalize(record?.source_url)
    };
    row.dataset.catalogYear = String(parseYearStart(record) || '');
    row.dataset.catalogLinked = record?.source_url ? 'true' : 'false';
    row.dataset.catalogSearch = normalize([
      record?.year_label,
      fields.year,
      fields.century,
      fields.title,
      fields.quote,
      fields.language,
      fields.author,
      record?.source_url,
      record?.description
    ].filter(Boolean).join(' '));
    row.dataset.catalogIndex = row.dataset.catalogIndex || String(rowSequence++);
  };

  const textCell = (value, className = '') => {
    const cell = document.createElement('td');
    if (className) cell.className = className;
    cell.textContent = value || '—';
    return cell;
  };

  const appendTextBlock = (parent, tag, value, className = '') => {
    if (!value) return;
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value;
    parent.appendChild(element);
  };

  const createCatalogRow = (record) => {
    const fields = displayFields(record);
    const row = document.createElement('tr');
    if (record.id) row.dataset.remoteReference = record.id;
    row.appendChild(textCell(fields.year, 'moldoveneasca-table__year'));
    row.appendChild(textCell(fields.century, 'moldoveneasca-table__century'));
    row.appendChild(textCell(fields.title, 'moldoveneasca-table__title'));

    const quoteCell = textCell(fields.quote, 'moldoveneasca-table__quote');
    if (fields.quote && fields.quote !== '—') quoteCell.textContent = `„${fields.quote}”`;
    row.appendChild(quoteCell);
    row.appendChild(textCell(fields.language, 'moldoveneasca-table__language'));
    row.appendChild(textCell(fields.author, 'moldoveneasca-table__author'));

    const sourceCell = document.createElement('td');
    sourceCell.className = 'moldoveneasca-table__source';
    if (record.source_url) {
      const link = document.createElement('a');
      link.href = record.source_url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Sursa';
      link.className = 'moldoveneasca-table__source-link';
      sourceCell.appendChild(link);
    } else {
      sourceCell.textContent = '—';
    }

    const canEdit = currentRole === 'admin' || (currentRole === 'editor' && currentUser?.id === record.owner_id);
    if (canEdit && record.id) {
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
    setRowMetadata(row, record);
    return row;
  };

  ensureTableHeader();
  const staticRows = currentRows().map((row) => {
    const converted = createCatalogRow(recordFromStaticRow(row));
    row.replaceWith(converted);
    return converted;
  });

  const getSortedRows = () => currentRows().sort((a, b) => {
    const yearA = Number(a.dataset.catalogYear) || Number.POSITIVE_INFINITY;
    const yearB = Number(b.dataset.catalogYear) || Number.POSITIVE_INFINITY;
    if (yearA === yearB) return Number(a.dataset.catalogIndex) - Number(b.dataset.catalogIndex);
    return (yearA - yearB) * (sortAscending ? 1 : -1);
  });

  const sortRowsChronologically = () => {
    getSortedRows().forEach((row) => tbody.appendChild(row));
    if (sortButton) {
      sortButton.textContent = `Perioadă / an ${sortAscending ? '↑' : '↓'}`;
      sortButton.setAttribute('aria-label', sortAscending ? 'Sortează anii descrescător' : 'Sortează anii crescător');
      const yearHeader = sortButton.closest('th');
      if (yearHeader) yearHeader.setAttribute('aria-sort', sortAscending ? 'ascending' : 'descending');
    }
  };

  const updateCenturyOptions = () => {
    const select = table.querySelector('[data-column-filter="century"]');
    if (!select) return;
    const previous = select.value;
    const centuryLabels = [...new Set(currentRows()
      .map((row) => row.catalogFields?.century)
      .filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'ro'));
    select.replaceChildren();
    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'Toate secolele';
    select.appendChild(allOption);
    centuryLabels.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
    select.value = centuryLabels.includes(previous) ? previous : '';
  };

  const updatePagination = (matchedCount) => {
    const totalPages = Math.max(1, Math.ceil(matchedCount / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    if (pagination) pagination.hidden = totalPages <= 1;
    if (previousPageButton) previousPageButton.disabled = currentPage <= 1;
    if (nextPageButton) nextPageButton.disabled = currentPage >= totalPages;
    if (pageStatus) pageStatus.textContent = `Pagina ${currentPage} din ${totalPages}`;
    return totalPages;
  };

  const updateStats = () => {
    const rows = currentRows();
    const years = rows.map((row) => Number(row.dataset.catalogYear)).filter((year) => Number.isFinite(year));
    const linked = rows.filter((row) => row.dataset.catalogLinked === 'true').length;
    if (recordCount) recordCount.textContent = String(rows.length);
    if (linkedCount) linkedCount.textContent = String(linked);
    if (yearRange) yearRange.textContent = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '—';
  };

  const filterRows = () => {
    const query = normalize(searchInput?.value);
    updateCenturyOptions();
    const filters = {};
    table.querySelectorAll('[data-column-filter]').forEach((control) => {
      filters[control.dataset.columnFilter] = normalize(control.value);
    });
    const matchedRows = currentRows().filter((row) => {
      const matchesQuery = !query || row.dataset.catalogSearch.includes(query);
      const matchesColumns = Object.entries(filters).every(([key, value]) => (
        !value || row.catalogFields?.[key]?.includes(value)
      ));
      return matchesQuery && matchesColumns;
    });
    const totalPages = updatePagination(matchedRows.length);
    const firstVisible = (currentPage - 1) * pageSize;
    const lastVisible = firstVisible + pageSize;
    const matchedSet = new Set(matchedRows);
    currentRows().forEach((row) => {
      const matchIndex = matchedRows.indexOf(row);
      row.hidden = !matchedSet.has(row) || matchIndex < firstVisible || matchIndex >= lastVisible;
    });
    const visibleStart = matchedRows.length ? firstVisible + 1 : 0;
    const visibleEnd = Math.min(lastVisible, matchedRows.length);
    const hasActiveColumnFilter = Object.values(filters).some(Boolean);
    if (resetButton) resetButton.hidden = !query && !hasActiveColumnFilter;
    if (result) {
      result.textContent = matchedRows.length
        ? `Se afișează ${visibleStart}–${visibleEnd} din ${matchedRows.length} referințe${totalPages > 1 ? ` · pagina ${currentPage}/${totalPages}` : ''}.`
        : 'Nu există referințe care să corespundă filtrării.';
    }
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
      roleBadge.hidden = !currentUser;
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
    setField('language', record?.language);
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

  const renderRemoteRows = () => {
    table.querySelectorAll('tr[data-remote-reference]').forEach((row) => row.remove());
    if (remoteRecords.length) {
      staticRows.forEach((row) => row.remove());
    } else {
      staticRows.forEach((row) => {
        if (!tbody.contains(row)) tbody.appendChild(row);
      });
    }
    remoteRecords.forEach((record) => tbody.appendChild(createCatalogRow(record)));
    currentPage = 1;
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
      .select('id, year_label, year_start, year_end, title, author, language, description, quote, source_type, location, source_url, status, owner_id')
      .order('year_start', { ascending: true });
    if (error) throw error;
    remoteRecords = data || [];
    renderRemoteRows();
  };

  const loadProfile = async (user) => {
    currentUser = user || null;
    if (!currentUser) {
      setRole('viewer');
      if (authUser) {
        authUser.textContent = '';
        authUser.hidden = true;
      }
      if (loginButton) {
        loginButton.hidden = false;
        loginButton.disabled = false;
      }
      if (logoutButton) logoutButton.hidden = true;
      if (authMessage) authMessage.textContent = 'Vizualizarea este deschisă tuturor. Autentifică-te cu GitHub pentru a contribui.';
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
    if (authUser) {
      authUser.textContent = displayName;
      authUser.hidden = false;
    }
    if (authMessage) authMessage.textContent = `${displayName} este autentificat(ă) cu rolul ${currentRole}.`;
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
      language: String(data.get('language') || '').trim() || null,
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
      setStatus('Completează anul și denumirea lucrării.', 'error');
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

  searchInput?.addEventListener('input', () => {
    currentPage = 1;
    filterRows();
  });
  resetButton?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    table.querySelectorAll('[data-column-filter]').forEach((control) => {
      control.value = '';
    });
    currentPage = 1;
    filterRows();
    searchInput?.focus();
  });
  previousPageButton?.addEventListener('click', () => {
    currentPage = Math.max(1, currentPage - 1);
    filterRows();
  });
  nextPageButton?.addEventListener('click', () => {
    currentPage += 1;
    filterRows();
  });
  loginButton?.addEventListener('click', signIn);
  logoutButton?.addEventListener('click', signOut);
  openFormButton?.addEventListener('click', () => openEditor());
  cancelEditButton?.addEventListener('click', closeEditor);
  editorForm?.addEventListener('submit', saveRecord);

  sortRowsChronologically();
  updateStats();
  filterRows();
  setRole('viewer');

  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    if (loginButton) loginButton.disabled = true;
    if (authMessage) authMessage.textContent = 'Catalogul public și căutarea funcționează fără cont; autentificarea GitHub nu este încă configurată.';
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
      if (authMessage) authMessage.textContent = `Catalogul public funcționează, dar autentificarea nu este disponibilă: ${error.message}`;
    }
  })();
})();
