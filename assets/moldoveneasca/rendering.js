  const renderRemoteRows = ({ refresh = true } = {}) => {
    table.querySelectorAll('tr[data-remote-reference]').forEach((row) => row.remove());
    const languageRecords = remoteRecords.filter((record) => catalogIncludes(record, 'language'));
    if (remoteCatalogLoaded) {
      staticRows.forEach((row) => row.remove());
    } else {
      staticRows.forEach((row) => {
        if (!tbody.contains(row)) tbody.appendChild(row);
      });
    }
    const fragment = document.createDocumentFragment();
    languageRecords.forEach((record) => fragment.appendChild(createCatalogRow(record)));
    tbody.appendChild(fragment);
    sortRowsChronologically();
    updateStats();
    if (refresh) filterRows();
  };

  const renderEthnicityRows = ({ refresh = true } = {}) => {
    if (!ethnicityTbody) return;
    ethnicityTbody.querySelectorAll('tr[data-remote-reference]').forEach((row) => row.remove());
    const remoteIdentities = new Set(ethnicityRecords.map(recordIdentity));
    ethnicityStaticEntries.forEach(({ row, record }) => {
      if (remoteIdentities.has(recordIdentity(record))) {
        row.remove();
      } else if (!ethnicityTbody.contains(row)) {
        ethnicityTbody.appendChild(row);
      }
    });
    const fragment = document.createDocumentFragment();
    ethnicityRecords.forEach((record) => fragment.appendChild(createCatalogRow(record)));
    ethnicityTbody.appendChild(fragment);
    sortRowsChronologicallyIn(ethnicityTbody);
    if (refresh) filterRows();
  };

  const renderUnverifiedRows = ({ refresh = true } = {}) => {
    if (!unverifiedTbody) {
      updateSelectionUi();
      return;
    }
    unverifiedTbody.replaceChildren();
    if (!currentUser) {
      updateSelectionUi();
      return;
    }
    unverifiedRecords
      .slice()
      .sort((a, b) => (parseYearStart(a) || Number.POSITIVE_INFINITY) - (parseYearStart(b) || Number.POSITIVE_INFINITY))
      .forEach((record) => unverifiedTbody.appendChild(createCatalogRow(record, { showStatusBadge: false })));
    if (refresh) filterRows();
  };

