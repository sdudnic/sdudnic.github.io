(() => {
  const root = document.querySelector('[data-moldoveneasca-catalog]');
  if (!root) return;

  const config = window.MOLDOVENEASCA_CONFIG || {};
  const table = document.querySelector('.post-content table') || document.querySelector('table');
  const tbody = table?.querySelector('tbody');
  const searchInput = root.querySelector('[data-catalog-search]');
  const centurySelect = root.querySelector('[data-catalog-century]');
  const resetButton = root.querySelector('[data-catalog-reset]');
  const result = document.querySelector('[data-catalog-result]');
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
  const recordCount = document.querySelector('[data-record-count]');
  const filteredCount = document.querySelector('[data-filtered-count]');
  const statusBar = document.querySelector('[data-catalog-status]');
  const pagination = document.querySelector('[data-catalog-pagination]');
  const previousPageButton = document.querySelector('[data-page-previous]');
  const nextPageButton = document.querySelector('[data-page-next]');
  const pageStatus = document.querySelector('[data-page-status]');
  const unverifiedSection = document.querySelector('[data-unverified-section]');
  const unverifiedTable = document.querySelector('[data-unverified-table]');
  const unverifiedTbody = unverifiedTable?.querySelector('tbody');
  const detailPanel = root.querySelector('[data-reference-detail]');
  const detailBackdrop = root.querySelector('[data-reference-detail-backdrop]');
  const detailTitle = root.querySelector('[data-detail-title]');
  const detailContent = root.querySelector('[data-detail-content]');
  const closeDetailButton = root.querySelector('[data-close-detail]');

  if (!table || !tbody) return;
  table.classList.add('moldoveneasca-table');

  const wrapPublicGrid = () => {
    if (!statusBar || !table.parentElement || statusBar.parentElement !== table.parentElement) return;
    const frame = document.createElement('div');
    frame.className = 'moldoveneasca-grid-frame';
    table.parentElement.insertBefore(frame, table);
    frame.appendChild(table);
    frame.appendChild(statusBar);
  };

  wrapPublicGrid();

  let supabaseClient = null;
  let currentUser = null;
  let currentRole = 'viewer';
  let editingId = null;
  let remoteRecords = [];
  let unverifiedRecords = [];
  let sortAscending = true;
  let sortButton = null;
  let rowSequence = 0;
  const pageSize = 50;
  let currentPage = 1;
  let lastDetailTrigger = null;
  let searchDebounceTimer = null;
  const searchDebounceMs = 220;

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

  const languageNamePattern = /(?:moldoveneas(?:că|ca)|moldovineas(?:că|ca)|moldoveneșt(?:e|i)|moldovenesc|moldav(?:icae|ica|icus|icum|orum|isch\p{L}*)|moldauisch\p{L}*|moldeuška|молдавск\p{L}*|молдовен(?:яск\p{L}*)?)/iu;
  const languageLabelPattern = /(?:\blimba\b|\blingua\b|\blanguage\b|\bsprache\b|язык|młëtwa)/iu;

  const cleanImportedText = (value) => String(value || '')
    .replace(/^\s*\*\?\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanQuote = (value) => String(value || '')
    .replace(/^\s*["«“']+|["»”']+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/,\s*(?:Contextul|Sursa(?: suplimentară)?\s*\d*):.*$/i, '')
    .trim();

  const extractQuote = (value) => {
    const text = cleanImportedText(value);
    const candidates = [];
    for (const match of text.matchAll(/«([^»]{5,})»/g)) candidates.push(match[1]);
    for (const match of text.matchAll(/“([^”]{5,})”/g)) candidates.push(match[1]);
    for (const match of text.matchAll(/"([^"\n]{5,})"/g)) candidates.push(match[1]);
    const labelled = text.match(/Citatul:\s*(.{5,320}?)(?:,\s*Contextul:|$)/i);
    if (labelled) candidates.push(labelled[1]);
    const cleanedCandidates = candidates.map(cleanQuote).filter(Boolean);
    const explicitlyNamed = cleanedCandidates.filter((candidate) => {
      const termIndex = candidate.search(languageNamePattern);
      const labelIndex = candidate.search(languageLabelPattern);
      return termIndex >= 0 && labelIndex >= 0 && Math.abs(termIndex - labelIndex) <= 80;
    });
    if (explicitlyNamed.length) return explicitlyNamed.sort((a, b) => b.length - a.length)[0];
    const named = cleanedCandidates.filter((candidate) => languageNamePattern.test(candidate));
    return named.length ? named.sort((a, b) => b.length - a.length)[0] : null;
  };

  const extractAuthor = (value) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    const explicit = text.match(/Autorul:\s*([^,;.]+)/i);
    if (explicit) return explicit[1].trim();
    const leading = text.match(/^([^,;]{2,80}),\s*(?:["«“]|Citatul:|Letopisețul|Mărturisirea)/i);
    return leading ? leading[1].trim() : null;
  };

  const extractTitle = (value) => {
    const text = cleanImportedText(value);
    const beforeComment = text.split(/\b(?:Citatul|Contextul|Sursa(?: suplimentară)?\s*\d*)\s*:/i)[0].trim();
    const quotedTitles = [...beforeComment.matchAll(/["«“]([^"»”]{3,180})["»”]/g)]
      .map((match) => match[1].trim())
      .filter((candidate) => !languageNamePattern.test(candidate))
      .filter((candidate) => !/^(?:evanghel(?:ia|iei)|epistole(?:le|lor)|scria|sursa)$/i.test(candidate));
    const contextualTitle = beforeComment.match(/(?:lucrare(?:a)?\s+intitulată|lucrarea(?:\s+sa)?|opera|cartea|volumul|documentul|în\s+)[\s:]*["«“]([^"»”]{3,180})["»”]/i);
    if (contextualTitle && !languageNamePattern.test(contextualTitle[1])) return contextualTitle[1].trim();
    if (quotedTitles.length) return quotedTitles[0];

    const namedTitle = beforeComment.match(/(?:lucrarea|opera|cartea|volumul|documentul|scrisoarea|gramatica|reglementul)\s+(?:sa\s+)?([^,.;:]{3,160})/i);
    if (namedTitle && !/^limb(?:a|ii)\b/i.test(namedTitle[1])) return namedTitle[1].trim().replace(/["»”]+$/, '');

    const dashTitle = beforeComment.match(/(?:lexicon|catastif|mărturisire|primul lexicon)[^–—-]*[–—-]\s*([^,.;:(]{3,140})/i);
    if (dashTitle) return dashTitle[1].trim();

    const knownTitle = beforeComment.match(/\b(Descriptio Moldaviae|Letopisețul Țării Moldovei|De neamul moldovenilor|Historiarum sui libri|Comentarium wariarum artium|Dictionarium Valachico-Latinum|Alphabetum Moldavorum|Chronologia|Breve vocabulario italiano-muldavo|Lingua moldavorum)\b/i);
    return knownTitle ? knownTitle[1].trim() : null;
  };

  const languageCodeFor = (value) => {
    const text = String(value || '').trim();
    if (!text) return 'xx';
    if (/^[a-z]{2}$/i.test(text)) return text.toLowerCase();
    if (/moldov|moldav|moldauisch|moldovin|moldeu|молдов|молдав/i.test(text)) return 'md';
    if (/rus|russ|росс|рус|язык\s*рус/i.test(text)) return 'ru';
    if (/latin|latină|latina/i.test(text)) return 'la';
    if (/german|deutsch|немец/i.test(text)) return 'de';
    if (/fran|francez|français/i.test(text)) return 'fr';
    if (/italian|italiano/i.test(text)) return 'it';
    if (/grec|greacă|greaca|grecesc|елин|греч/i.test(text)) return 'el';
    if (/slavon|sloven|славян/i.test(text)) return 'cu';
    if (/polon|polsk|польск/i.test(text)) return 'pl';
    if (/ucraine|ukrain|украин/i.test(text)) return 'uk';
    if (/englez|english|англ/i.test(text)) return 'en';
    if (/bulgar|българ|болгар/i.test(text)) return 'bg';
    if (/sârb|sar[bă]|srpsk|серб/i.test(text)) return 'sr';
    if (/turc|turkish|турец/i.test(text)) return 'tr';
    if (/arab|араб/i.test(text)) return 'ar';
    if (/ebra|hebrew|евре/i.test(text)) return 'he';
    if (/maghiar|hungar|ungar|венгр/i.test(text)) return 'hu';
    if (/spaniol|spanish|испан/i.test(text)) return 'es';
    if (/portug|portugu/i.test(text)) return 'pt';
    return 'xx';
  };

  const languageCode = (value) => {
    const text = String(value || '').trim();
    if (!text) return 'xx';
    return text.split(/(\s*(?:→|->|\/|,|;)\s*)/)
      .map((part) => /^\s*(?:→|->|\/|,|;)\s*$/.test(part) ? part.trim() : languageCodeFor(part))
      .join(' ')
      .replace(/\s+(→|->|\/|,)\s+/g, ' $1 ')
      .trim();
  };

  const sourceUrls = (record) => {
    const urls = [];
    const addValue = (value) => {
      if (Array.isArray(value)) {
        value.forEach(addValue);
        return;
      }
      const matches = String(value || '').match(/https?:\/\/[^\s<>"']+/gi) || [];
      matches.forEach((url) => {
        const cleaned = url.replace(/[),.;!?]+$/g, '');
        if (cleaned && !urls.includes(cleaned)) urls.push(cleaned);
      });
    };
    addValue(record?.source_urls);
    addValue(record?.source_url);
    addValue(record?.description);
    return urls;
  };

  const recordFromStaticRow = (row) => {
    const yearLabel = row.cells[0]?.textContent.trim() || '';
    const sourceText = extractCellText(row.cells[1]);
    const urls = [...(row.cells[1]?.querySelectorAll('a[href]') || [])].map((link) => link.href);
    const title = extractTitle(sourceText) || sourceText;
    return {
      year_label: yearLabel,
      year_start: parseYears(yearLabel)[0] || null,
      year_end: parseYears(yearLabel)[1] || parseYears(yearLabel)[0] || null,
      title,
      quote: extractQuote(sourceText),
      language: null,
      author: extractAuthor(sourceText),
      source_url: urls[0] || null,
      source_urls: urls,
      source_type: 'Import din tabelul existent',
      location: null,
      description: sourceText,
      status: 'published',
      owner_id: null
    };
  };

  const displayFields = (record) => {
    const raw = record?.title || '';
    const imported = record?.source_type === 'Import din tabelul existent';
    const title = imported ? (extractTitle(raw) || '—') : (raw || '—');
    const quote = extractQuote(record?.quote) || (imported ? extractQuote(raw) : null);
    return {
      year: yearRangeLabel(record),
      century: centuryLabel(record),
      title,
      quote,
      language: languageCode(record?.language),
      languageFull: record?.language || 'necunoscută',
      author: record?.author || (imported ? extractAuthor(raw) : null) || '—'
    };
  };

  const removeImportedQuote = (value, quote) => {
    let text = cleanImportedText(value);
    if (!text || !quote) return text;
    const variants = [
      `«${quote}»`,
      `“${quote}”`,
      `„${quote}”`,
      `"${quote}"`,
      `'${quote}'`,
      quote
    ];
    const variant = variants.find((candidate) => text.includes(candidate));
    if (variant) text = text.replace(variant, ' ');
    return text
      .replace(/\s*\(\s*sursa(?:\s+suplimentară)?\s*\d*\s*\)\s*/gi, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^\s*[,;:–—-]\s*/, '')
      .replace(/\s*[,;:–—-]\s*$/, '')
      .trim();
  };

  const recordComments = (record) => {
    const comments = [];
    const description = cleanImportedText(record?.description);
    const raw = cleanImportedText(record?.title);
    const imported = record?.source_type === 'Import din tabelul existent';
    if (description && (!imported || description !== raw)) comments.push(description);
    if (imported && raw) {
      const residual = removeImportedQuote(raw, extractQuote(record?.quote) || extractQuote(raw));
      if (residual && !comments.includes(residual)) comments.push(residual);
    }
    return comments.join('\n\n') || null;
  };

  const ensureTableHeader = () => {
    const thead = table.tHead || table.querySelector('thead');
    const headRow = thead?.rows[0] || table.querySelector('thead tr');
    if (!thead || !headRow) return;
    headRow.replaceChildren();
    const headings = [
      ['year', 'An'],
      ['century', 'Secol'],
      ['title', 'Denumirea'],
      ['quote', 'Citat'],
      ['language', 'Limba'],
      ['author', 'Autor'],
      ['source', 'Sursa'],
      ['actions', '']
    ];
    headings.forEach(([key, label]) => {
      const th = document.createElement('th');
      th.scope = 'col';
      if (key === 'year') {
        th.appendChild(document.createTextNode(label));
        sortButton = document.createElement('button');
        sortButton.type = 'button';
        sortButton.className = 'moldoveneasca-table__sort moldoveneasca-icon-button';
        sortButton.dataset.sortYear = 'true';
        sortButton.dataset.tooltip = 'Sortează anii';
        sortButton.title = 'Sortează anii';
        sortButton.setAttribute('aria-label', 'Sortează anii');
        sortButton.appendChild(createIconSvg('sort-up'));
        sortButton.addEventListener('click', () => {
          sortAscending = !sortAscending;
          currentPage = 1;
          sortRowsChronologically();
          filterRows();
        });
        th.appendChild(sortButton);
      } else if (key === 'actions') {
        th.className = 'moldoveneasca-table__actions-heading';
        th.setAttribute('aria-label', 'Acțiuni');
      } else {
        th.textContent = label;
      }
      headRow.appendChild(th);
    });

    thead.querySelector('.moldoveneasca-table__filters')?.remove();
  };

  const currentRows = () => Array.from(tbody.rows);

  const updateActionsColumnVisibility = () => {
    const actionColumns = table.querySelectorAll('.moldoveneasca-table__actions-heading, .moldoveneasca-table__actions-cell');
    actionColumns.forEach((cell) => {
      cell.hidden = false;
    });
    const hasVisibleAction = [...table.querySelectorAll('.moldoveneasca-table__actions-cell')].some((cell) => {
      const row = cell.closest('tr');
      return !row?.hidden && cell.querySelector('button:not([hidden])');
    });
    actionColumns.forEach((cell) => {
      cell.hidden = !hasVisibleAction;
    });
  };

  const setRowMetadata = (row, record) => {
    const fields = displayFields(record);
    const rowYear = parseYearStart(record);
    row.catalogFields = {
      year: normalize([record?.year_label, fields.year].filter(Boolean).join(' ')),
      century: normalize(fields.century),
      centuryLabel: fields.century,
      centuryNumber: rowYear ? Math.floor((rowYear - 1) / 100) + 1 : Number.POSITIVE_INFINITY,
      title: normalize(fields.title),
      quote: normalize(fields.quote),
      language: normalize(fields.language),
      author: normalize(fields.author),
      source: normalize(sourceUrls(record).join(' ')),
      comments: normalize(recordComments(record))
    };
    row.dataset.catalogYear = String(rowYear || '');
    row.dataset.catalogLinked = sourceUrls(record).length ? 'true' : 'false';
    row.dataset.catalogSearch = normalize([
      record?.year_label,
      fields.year,
      fields.century,
      fields.title,
      fields.quote,
      fields.language,
      fields.languageFull,
      record?.language,
      fields.author,
      sourceUrls(record).join(' '),
      recordComments(record)
    ].filter(Boolean).join(' '));
    row.dataset.catalogIndex = row.dataset.catalogIndex || String(rowSequence++);
  };

  const textCell = (value, className = '') => {
    const cell = document.createElement('td');
    if (className) cell.className = className;
    const text = value || '—';
    const content = document.createElement('span');
    content.className = 'moldoveneasca-table__truncate';
    content.textContent = text;
    if (text !== '—') content.title = text;
    cell.appendChild(content);
    return cell;
  };

  const quoteIndicatorPattern = /(limba\s+moldoveneasc\p{L}*|lingua\s+moldav\p{L}*|moldoveneasc\p{L}*|moldav\p{L}*|moldeuška|молдов\p{L}*)/giu;

  const appendQuoteText = (parent, value) => {
    const text = String(value || '');
    quoteIndicatorPattern.lastIndex = 0;
    let cursor = 0;
    for (const match of text.matchAll(quoteIndicatorPattern)) {
      if (match.index > cursor) parent.appendChild(document.createTextNode(text.slice(cursor, match.index)));
      const indicator = document.createElement('em');
      indicator.textContent = match[0];
      parent.appendChild(indicator);
      cursor = match.index + match[0].length;
    }
    if (cursor < text.length) parent.appendChild(document.createTextNode(text.slice(cursor)));
  };

  const closeDetail = () => {
    if (detailPanel) {
      detailPanel.classList.remove('is-open');
      detailPanel.hidden = true;
    }
    if (detailBackdrop) detailBackdrop.hidden = true;
    document.body.classList.remove('moldoveneasca-detail-open');
    if (lastDetailTrigger?.isConnected) lastDetailTrigger.focus();
    lastDetailTrigger = null;
  };

  const openDetail = (record, trigger) => {
    if (!detailPanel || !detailContent) return;
    const fields = displayFields(record);
    const urls = sourceUrls(record);
    detailContent.replaceChildren();
    if (detailTitle) detailTitle.textContent = fields.title === '—' ? 'Detalii referință' : fields.title;

    const addDetailField = (label, value, render = null) => {
      if (!value || value === '—') return;
      const item = document.createElement('div');
      item.className = 'moldoveneasca-detail__item';
      const heading = document.createElement('dt');
      heading.textContent = label;
      const content = document.createElement('dd');
      if (render) render(content, value);
      else content.textContent = value;
      item.appendChild(heading);
      item.appendChild(content);
      detailContent.appendChild(item);
    };

    addDetailField('An', fields.year);
    addDetailField('Secol', fields.century);
    addDetailField('Limba', fields.languageFull);
    addDetailField('Cod', fields.language);
    addDetailField('Autor', fields.author);
    addDetailField('Tipul sursei', record?.source_type === 'Import din tabelul existent' ? null : record?.source_type);
    addDetailField('Locul / instituția', record?.location);
    addDetailField('Citat', fields.quote, (content, value) => {
      content.appendChild(document.createTextNode('„'));
      appendQuoteText(content, value);
      content.appendChild(document.createTextNode('”'));
    });
    addDetailField('Comentarii', recordComments(record));
    if (urls.length) {
      addDetailField('Surse', urls.join('\n'), (content) => {
        content.className = 'moldoveneasca-detail__sources';
        urls.forEach((url, index) => {
          const link = document.createElement('a');
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = urls.length === 1 ? 'sursa' : String(index + 1);
          link.title = url;
          content.appendChild(link);
          if (index < urls.length - 1) content.appendChild(document.createTextNode(', '));
        });
      });
    }

    lastDetailTrigger = trigger || null;
    detailPanel.hidden = false;
    if (detailBackdrop) detailBackdrop.hidden = false;
    detailPanel.classList.add('is-open');
    document.body.classList.add('moldoveneasca-detail-open');
    closeDetailButton?.focus();
  };

  const createIconSvg = (kind) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const paths = {
      edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM14.06 4.94l3.75 3.75',
      delete: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
      reset: 'M20 11a8 8 0 1 0 2 5M20 5v6h-6',
      add: 'M12 5v14M5 12h14',
      previous: 'M19 12H5M12 19l-7-7 7-7',
      next: 'M5 12h14M12 5l7 7-7 7',
      cancel: 'M6 6l12 12M18 6L6 18',
      save: 'M5 12l4 4L19 6',
      login: 'M10 17l5-5-5-5M15 12H3M21 3v18',
      logout: 'M14 17l5-5-5-5M19 12H7M3 3v18',
      'sort-up': 'M7 14l5-5 5 5',
      'sort-down': 'M7 10l5 5 5-5'
    };
    path.setAttribute('d', paths[kind] || paths.cancel);
    svg.appendChild(path);
    return svg;
  };

  const createIconButton = (label, kind, onClick, modifier = '') => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `moldoveneasca-icon-button${modifier ? ` ${modifier}` : ''}`;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.dataset.tooltip = label;
    button.appendChild(createIconSvg(kind));
    button.addEventListener('click', onClick);
    return button;
  };

  const configureIconButton = (button, label, kind) => {
    if (!button) return;
    button.classList.remove('moldoveneasca-button', 'moldoveneasca-button--quiet');
    button.classList.add('moldoveneasca-icon-button');
    button.replaceChildren(createIconSvg(kind));
    button.setAttribute('aria-label', label);
    button.title = label;
    button.dataset.tooltip = label;
  };

  const configureCatalogButtons = () => {
    configureIconButton(resetButton, 'Resetează căutarea', 'reset');
    configureIconButton(openFormButton, 'Adaugă referință', 'add');
    configureIconButton(cancelEditButton, 'Anulează editarea', 'cancel');
    configureIconButton(editorForm?.querySelector('button[type="submit"]'), 'Salvează referința', 'save');
    configureIconButton(previousPageButton, 'Pagina anterioară', 'previous');
    configureIconButton(nextPageButton, 'Pagina următoare', 'next');
    configureIconButton(closeDetailButton, 'Închide detaliile', 'cancel');
    configureIconButton(loginButton, 'Autentificare cu GitHub', 'login');
    configureIconButton(logoutButton, 'Ieșire din cont', 'logout');
  };

  const createCatalogRow = (record) => {
    const fields = displayFields(record);
    const row = document.createElement('tr');
    if (record.id) row.dataset.remoteReference = record.id;
    row.appendChild(textCell(fields.year, 'moldoveneasca-table__year'));
    row.appendChild(textCell(fields.century, 'moldoveneasca-table__century'));

    const titleCell = document.createElement('td');
    titleCell.className = 'moldoveneasca-table__title';
    const titleText = fields.title || '—';
    const titleLink = document.createElement('a');
    titleLink.href = '#reference-detail';
    titleLink.className = 'moldoveneasca-table__detail-link';
    titleLink.textContent = titleText;
    titleLink.title = titleText === '—' ? `Deschide detaliile referinței din ${fields.year}` : titleText;
    titleLink.setAttribute('aria-label', titleText === '—'
      ? `Deschide detaliile referinței din ${fields.year}`
      : `Deschide detaliile pentru ${titleText}`);
    titleLink.addEventListener('click', (event) => {
      event.preventDefault();
      openDetail(record, titleLink);
    });
    titleCell.appendChild(titleLink);
    row.appendChild(titleCell);

    const quoteCell = document.createElement('td');
    quoteCell.className = 'moldoveneasca-table__quote';
    if (fields.quote && fields.quote !== '—') {
      const quoteText = document.createElement('span');
      quoteText.className = 'moldoveneasca-table__truncate';
      quoteText.title = fields.quote;
      quoteText.appendChild(document.createTextNode('„'));
      appendQuoteText(quoteText, fields.quote);
      quoteText.appendChild(document.createTextNode('”'));
      quoteCell.appendChild(quoteText);
    } else {
      quoteCell.textContent = '—';
    }
    row.appendChild(quoteCell);
    row.appendChild(textCell(fields.language, 'moldoveneasca-table__language'));
    row.appendChild(textCell(fields.author, 'moldoveneasca-table__author'));

    const sourceCell = document.createElement('td');
    sourceCell.className = 'moldoveneasca-table__source';
    const urls = sourceUrls(record);
    if (urls.length) {
      const sourceLinks = document.createElement('span');
      sourceLinks.className = 'moldoveneasca-table__source-links';
      urls.forEach((url, index) => {
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = urls.length === 1 ? 'sursa' : String(index + 1);
        link.title = url;
        link.className = 'moldoveneasca-table__source-link';
        sourceLinks.appendChild(link);
        if (index < urls.length - 1) sourceLinks.appendChild(document.createTextNode(', '));
      });
      sourceCell.appendChild(sourceLinks);
    } else {
      sourceCell.textContent = '—';
    }

    const actionsCell = document.createElement('td');
    actionsCell.className = 'moldoveneasca-table__actions-cell';
    const canEdit = currentRole === 'admin' || (currentRole === 'editor' && currentUser?.id === record.owner_id);
    if (canEdit && record.id) {
      const actions = document.createElement('div');
      actions.className = 'moldoveneasca-table__actions';
      actions.appendChild(createIconButton('Editează referința', 'edit', () => openEditor(record)));

      if (currentRole === 'admin') {
        actions.appendChild(createIconButton('Șterge referința', 'delete', () => deleteRecord(record), 'moldoveneasca-icon-button--danger'));
      }
      actionsCell.appendChild(actions);
    }

    if (record.status && record.status !== 'published') {
      const badge = document.createElement('span');
      badge.className = 'moldoveneasca-status';
      badge.textContent = record.status === 'pending' ? 'În verificare' : 'Neverificată';
      sourceCell.appendChild(badge);
    }
    row.appendChild(sourceCell);
    row.appendChild(actionsCell);
    setRowMetadata(row, record);
    return row;
  };

  configureCatalogButtons();
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
      const sortLabel = sortAscending ? 'Sortează anii descrescător' : 'Sortează anii crescător';
      sortButton.replaceChildren(createIconSvg(sortAscending ? 'sort-up' : 'sort-down'));
      sortButton.setAttribute('aria-label', sortLabel);
      sortButton.title = sortLabel;
      sortButton.dataset.tooltip = sortLabel;
      const yearHeader = sortButton.closest('th');
      if (yearHeader) yearHeader.setAttribute('aria-sort', sortAscending ? 'ascending' : 'descending');
    }
  };

  const updateCenturyOptions = () => {
    if (!centurySelect) return;
    const previous = centurySelect.value;
    const centuryOptions = new Map(currentRows()
      .map((row) => [
        row.catalogFields?.century,
        {
          label: row.catalogFields?.centuryLabel,
          number: row.catalogFields?.centuryNumber ?? Number.POSITIVE_INFINITY
        }
      ])
      .filter(([value]) => value));
    const centuryValues = [...centuryOptions.keys()].sort((a, b) => {
      const order = centuryOptions.get(a).number - centuryOptions.get(b).number;
      return order || a.localeCompare(b, 'ro');
    });
    centurySelect.replaceChildren();
    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'Toate secolele';
    centurySelect.appendChild(allOption);
    centuryValues.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = centuryOptions.get(value).label;
      centurySelect.appendChild(option);
    });
    centurySelect.value = centuryValues.includes(previous) ? previous : '';
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
    if (recordCount) recordCount.textContent = String(rows.length);
  };

  const filterRows = () => {
    const query = normalize(searchInput?.value);
    updateCenturyOptions();
    const century = normalize(centurySelect?.value);
    const matchedRows = currentRows().filter((row) => {
      const matchesQuery = !query || row.dataset.catalogSearch.includes(query);
      const matchesCentury = !century || row.catalogFields?.century === century;
      return matchesQuery && matchesCentury;
    });
    updatePagination(matchedRows.length);
    if (filteredCount) filteredCount.textContent = String(matchedRows.length);
    const firstVisible = (currentPage - 1) * pageSize;
    const lastVisible = firstVisible + pageSize;
    const matchedSet = new Set(matchedRows);
    currentRows().forEach((row) => {
      const matchIndex = matchedRows.indexOf(row);
      row.hidden = !matchedSet.has(row) || matchIndex < firstVisible || matchIndex >= lastVisible;
    });
    const visibleStart = matchedRows.length ? firstVisible + 1 : 0;
    const visibleEnd = Math.min(lastVisible, matchedRows.length);
    if (resetButton) resetButton.hidden = !query && !century;
    if (result) {
      result.textContent = matchedRows.length
        ? `Afișate ${visibleStart}–${visibleEnd}`
        : 'Niciun rezultat';
    }
    updateActionsColumnVisibility();
  };

  const applySearch = () => {
    if (searchDebounceTimer) window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
    currentPage = 1;
    filterRows();
  };

  const scheduleSearch = () => {
    if (searchDebounceTimer) window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(applySearch, searchDebounceMs);
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
    if (unverifiedSection) unverifiedSection.hidden = currentRole !== 'admin' || !currentUser;
    renderUnverifiedRows();
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
    const imported = record?.source_type === 'Import din tabelul existent';
    const fields = displayFields(record);
    const urls = sourceUrls(record);
    if (formTitle) formTitle.textContent = editingId ? 'Editează referința' : 'Adaugă o referință';
    setField('year_label', record?.year_label);
    setField('title', imported ? (fields.title === '—' ? null : fields.title) : record?.title);
    setField('language', record?.language);
    setField('author', record?.author);
    setField('source_type', imported ? null : record?.source_type);
    setField('description', recordComments(record));
    setField('quote', fields.quote);
    setField('location', record?.location);
    setField('source_url', record?.source_url || urls[0]);
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

  const renderUnverifiedRows = () => {
    if (!unverifiedTbody) return;
    unverifiedTbody.replaceChildren();
    if (!currentUser || currentRole !== 'admin') return;
    unverifiedRecords
      .slice()
      .sort((a, b) => (parseYearStart(a) || Number.POSITIVE_INFINITY) - (parseYearStart(b) || Number.POSITIVE_INFINITY))
      .forEach((record) => unverifiedTbody.appendChild(createCatalogRow(record)));
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
    const records = data || [];
    remoteRecords = records.filter((record) => record.status === 'published');
    unverifiedRecords = records.filter((record) => record.status !== 'published');
    renderRemoteRows();
    renderUnverifiedRows();
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

  searchInput?.addEventListener('input', scheduleSearch);
  searchInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applySearch();
    }
  });
  centurySelect?.addEventListener('change', () => {
    currentPage = 1;
    filterRows();
  });
  resetButton?.addEventListener('click', () => {
    if (searchDebounceTimer) window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
    if (searchInput) searchInput.value = '';
    if (centurySelect) centurySelect.value = '';
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
  closeDetailButton?.addEventListener('click', closeDetail);
  detailBackdrop?.addEventListener('click', closeDetail);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && detailPanel && !detailPanel.hidden) closeDetail();
  });
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
