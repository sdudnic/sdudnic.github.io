  const recordIdentity = (record) => normalize([
    record?.year_label,
    record?.quote,
    record?.source_url || record?.title
  ].filter(Boolean).join('|'));

  const getSortedRows = () => currentRows().sort((a, b) => {
    const yearA = Number(a.dataset.catalogYear) || Number.POSITIVE_INFINITY;
    const yearB = Number(b.dataset.catalogYear) || Number.POSITIVE_INFINITY;
    if (yearA === yearB) return Number(a.dataset.catalogIndex) - Number(b.dataset.catalogIndex);
    return (yearA - yearB) * (sortAscending ? 1 : -1);
  });

  const sortRowsChronologicallyIn = (targetTbody) => {
    if (!targetTbody) return;
    [...targetTbody.rows]
      .sort((a, b) => {
        const yearA = Number(a.dataset.catalogYear) || Number.POSITIVE_INFINITY;
        const yearB = Number(b.dataset.catalogYear) || Number.POSITIVE_INFINITY;
        if (yearA === yearB) return Number(a.dataset.catalogIndex) - Number(b.dataset.catalogIndex);
        return yearA - yearB;
      })
      .forEach((row) => targetTbody.appendChild(row));
  };

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
    const centuryRows = [
      ...searchableRows(),
      ...staticRows,
      ...ethnicityStaticEntries.map(({ row }) => row)
    ];
    const centuryOptions = new Map(centuryRows
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

  const updatePagination = (matchedCount, totalCount = matchedCount) => {
    catalogTotalPages = languageGrid.updateControls(totalCount, isRemotePageLoading);
    return catalogTotalPages;
  };

  const updateStats = () => {
    if (recordCount) recordCount.textContent = String(searchableRows().length);
  };

