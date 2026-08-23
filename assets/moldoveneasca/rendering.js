  const renderRemoteRows = () => {
    table.querySelectorAll('tr[data-remote-reference]').forEach((row) => row.remove());
    const languageRecords = remoteRecords.filter((record) => catalogIncludes(record, 'language'));
    if (remoteCatalogLoaded) {
      staticRows.forEach((row) => row.remove());
    } else {
      staticRows.forEach((row) => {
        if (!tbody.contains(row)) tbody.appendChild(row);
      });
    }
    languageRecords.forEach((record) => tbody.appendChild(createCatalogRow(record)));
    sortRowsChronologically();
    updateStats();
    filterRows();
  };

  const renderEthnicityRows = () => {
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
    ethnicityRecords.forEach((record) => ethnicityTbody.appendChild(createCatalogRow(record)));
    sortRowsChronologicallyIn(ethnicityTbody);
    filterRows();
    updateActionsColumnVisibility();
    updateSelectionUi();
  };

  const renderUnverifiedRows = () => {
    if (!unverifiedTbody) {
      updateSelectionUi();
      return;
    }
    unverifiedTbody.replaceChildren();
    if (!currentUser || currentRole !== 'admin') {
      updateSelectionUi();
      return;
    }
    unverifiedRecords
      .slice()
      .sort((a, b) => (parseYearStart(a) || Number.POSITIVE_INFINITY) - (parseYearStart(b) || Number.POSITIVE_INFINITY))
      .forEach((record) => unverifiedTbody.appendChild(createCatalogRow(record, { showStatusBadge: false })));
    filterRows();
    updateSelectionUi();
  };

