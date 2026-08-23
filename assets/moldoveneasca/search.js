  const selectionRows = () => [
    ...table.querySelectorAll('tbody tr[data-remote-reference]'),
    ...(unverifiedTable ? [...unverifiedTable.querySelectorAll('tbody tr[data-remote-reference]')] : []),
    ...(ethnicityTable ? [...ethnicityTable.querySelectorAll('tbody tr[data-remote-reference]')] : [])
  ];

  const visibleSelectionRows = () => selectionRows().filter((row) => (
    !row.hidden && row.querySelector('[data-reference-select]')
  ));

  const updateSelectionUi = () => {
    const isAdmin = Boolean(currentUser && currentRole === 'admin');
    const catalogTables = [table, unverifiedTable, ethnicityTable].filter(Boolean);

    if (!isAdmin) selectedReferenceIds.clear();
    catalogTables.forEach((catalogTable) => {
      catalogTable.querySelectorAll('[data-selection-heading], [data-selection-cell]').forEach((cell) => {
        cell.hidden = !isAdmin;
      });
      catalogTable.querySelectorAll('[data-reference-select]').forEach((checkbox) => {
        checkbox.hidden = !isAdmin;
        checkbox.checked = isAdmin && selectedReferenceIds.has(checkbox.dataset.referenceSelect);
      });
    });

    const selectedCount = selectedReferenceIds.size;
    if (selectionToolbar) selectionToolbar.hidden = isCatalogLoading || !isAdmin;
    if (selectionCount) selectionCount.textContent = `Selectate: ${selectedCount}`;
    if (selectionDeleteButton) selectionDeleteButton.disabled = !isAdmin || selectedCount === 0;

    const visibleIds = visibleSelectionRows().map((row) => row.dataset.referenceId);
    const selectedVisibleCount = visibleIds.filter((id) => selectedReferenceIds.has(id)).length;
    if (selectionAll) {
      selectionAll.disabled = !isAdmin || visibleIds.length === 0;
      selectionAll.checked = isAdmin && visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
      selectionAll.indeterminate = isAdmin && selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
    }
  };

  const setVisibleSelection = (checked) => {
    visibleSelectionRows().forEach((row) => {
      const id = row.dataset.referenceId;
      const checkbox = row.querySelector('[data-reference-select]');
      if (!id || !checkbox) return;
      checkbox.checked = checked;
      if (checked) selectedReferenceIds.add(id);
      else selectedReferenceIds.delete(id);
    });
    updateSelectionUi();
  };

  const updateGridSummary = ({ page, total, filtered, resultElement, totalElement, filteredElement }) => {
    if (totalElement) totalElement.textContent = String(total);
    if (filteredElement) filteredElement.textContent = String(filtered);
    if (resultElement) {
      resultElement.textContent = filtered && page.visibleStart
        ? `Afișate ${page.visibleStart}–${page.visibleEnd}`
        : 'Niciun rezultat';
    }
  };

  const filterRows = () => {
    const query = normalize(searchInput?.value).trim();
    updateCenturyOptions();
    const century = normalize(centurySelect?.value).trim();
    const isServerPage = remoteDataMode === 'page' && remoteCatalogLoaded && !query && !century;
    const languageCatalogRows = currentRows();
    const ethnicityCatalogRows = ethnicityRows();
    const unverifiedCatalogRows = unverifiedSection && !unverifiedSection.hidden ? unverifiedRows() : [];
    const matchedRows = languageCatalogRows.filter((row) => rowMatchesFilter(row, query, century));
    const matchedEthnicityRows = ethnicityCatalogRows.filter((row) => rowMatchesFilter(row, query, century));
    const matchedUnverifiedRows = unverifiedCatalogRows.filter((row) => rowMatchesFilter(row, query, century));
    const totalLanguageRows = isServerPage ? catalogTotalRecords : languageCatalogRows.length;
    const languagePage = languageGrid.update(languageCatalogRows, {
      matchedRows,
      totalRows: isServerPage ? catalogTotalRecords : matchedRows.length,
      serverPaged: isServerPage,
      loading: isRemotePageLoading
    });
    catalogTotalPages = languagePage.totalPages;
    const ethnicityPage = ethnicityGrid.update(ethnicityCatalogRows, { matchedRows: matchedEthnicityRows });
    const unverifiedPage = unverifiedGrid.update(unverifiedCatalogRows, { matchedRows: matchedUnverifiedRows });
    const filteredLanguageCount = isServerPage ? totalLanguageRows : matchedRows.length;
    updateGridSummary({
      page: languagePage,
      total: totalLanguageRows,
      filtered: filteredLanguageCount,
      resultElement: result,
      totalElement: recordCount,
      filteredElement: filteredCount
    });
    updateGridSummary({
      page: ethnicityPage,
      total: ethnicityCatalogRows.length,
      filtered: matchedEthnicityRows.length,
      resultElement: ethnicityResult,
      totalElement: ethnicityRecordCount,
      filteredElement: ethnicityFilteredCount
    });
    updateGridSummary({
      page: unverifiedPage,
      total: unverifiedCatalogRows.length,
      filtered: matchedUnverifiedRows.length,
      resultElement: unverifiedResult,
      totalElement: unverifiedRecordCount,
      filteredElement: unverifiedFilteredCount
    });
    if (resetButton) resetButton.hidden = !query && !century;
    updateActionsColumnVisibility();
    updateSelectionUi();
  };

  const applySearch = async () => {
    if (searchDebounceTimer) window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
    currentPage = 1;
    ethnicityCurrentPage = 1;
    unverifiedCurrentPage = 1;
    if (remoteCatalogLoaded && remoteDataMode === 'all') {
      filterRows();
      return;
    }
    if (supabaseClient) {
      try {
        await loadRemoteRecords({ page: 1, allRecords: true });
      } catch (error) {
        if (result) result.textContent = `Filtrarea nu a putut fi încărcată: ${error.message}`;
      }
      return;
    }
    filterRows();
  };

  const scheduleSearch = () => {
    if (searchDebounceTimer) window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(() => {
      applySearch().catch((error) => {
        if (result) result.textContent = `Filtrarea nu a putut fi încărcată: ${error.message}`;
      });
    }, searchDebounceMs);
  };

