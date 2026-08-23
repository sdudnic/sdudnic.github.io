  const ensureTableHeader = () => {
    const thead = table.tHead || table.querySelector('thead');
    const headRow = thead?.rows[0] || table.querySelector('thead tr');
    if (!thead || !headRow) return;
    headRow.replaceChildren();
    const headings = [
      ['selection', ''],
      ['year', 'An'],
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
      if (key === 'selection') {
        th.className = 'moldoveneasca-table__selection-heading';
        th.dataset.selectionHeading = 'true';
        th.hidden = currentRole !== 'admin';
        th.setAttribute('aria-label', 'Selectare');
      } else if (key === 'year') {
        th.className = 'moldoveneasca-table__year-heading';
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
        th.className = `moldoveneasca-table__${key}-heading`;
        th.textContent = label;
      }
      headRow.appendChild(th);
    });

    thead.querySelector('.moldoveneasca-table__filters')?.remove();
  };

  const currentRows = () => Array.from(tbody.rows);
  const ethnicityRows = () => (ethnicityTbody ? Array.from(ethnicityTbody.rows) : []);
  const unverifiedRows = () => (unverifiedTbody ? Array.from(unverifiedTbody.rows) : []);
  const searchableRows = () => [
    ...currentRows(),
    ...ethnicityRows(),
    ...(unverifiedSection && !unverifiedSection.hidden ? unverifiedRows() : [])
  ];
  const rowMatchesFilter = (row, query, century) => {
    const exactYearQuery = /^\d{4}$/.test(query);
    const matchesQuery = !query || (exactYearQuery
      ? row.dataset.catalogYear === query
      : row.dataset.catalogSearch.includes(query));
    return matchesQuery && (!century || row.catalogFields?.century === century);
  };

  const updateActionsColumnVisibility = () => {
    const actionTables = [table, unverifiedTable, ethnicityTable].filter(Boolean);
    const actionColumns = actionTables.flatMap((catalogTable) => [
      ...catalogTable.querySelectorAll('.moldoveneasca-table__actions-heading, .moldoveneasca-table__actions-cell')
    ]);
    actionColumns.forEach((cell) => {
      cell.hidden = false;
    });
    const hasVisibleAction = actionTables.some((catalogTable) => [
      ...catalogTable.querySelectorAll('.moldoveneasca-table__actions-cell')
    ].some((cell) => {
      const row = cell.closest('tr');
      return !row?.hidden && cell.querySelector('button:not([hidden])');
    }));
    actionColumns.forEach((cell) => {
      cell.hidden = !hasVisibleAction;
    });
  };

  const setRowMetadata = (row, record) => {
    const fields = displayFields(record);
    const rowYear = parseYearStart(record);
    row.catalogFields = {
      year: normalize([record?.year_label, fields.yearDisplay].filter(Boolean).join(' ')),
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
      fields.yearDisplay,
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

  const textCell = (value, className = '', title = '') => {
    const cell = document.createElement('td');
    if (className) cell.className = className;
    const text = value || '—';
    const content = document.createElement('span');
    content.className = 'moldoveneasca-table__truncate';
    content.textContent = text;
    if (text !== '—') content.title = title || text;
    cell.appendChild(content);
    return cell;
  };

