  const createCatalogRow = (record, options = {}) => {
    const fields = displayFields(record);
    const row = document.createElement('tr');
    row.catalogRecord = record;
    if (record.id) {
      row.dataset.remoteReference = record.id;
      row.dataset.referenceId = record.id;
    }
    const selectionCell = document.createElement('td');
    selectionCell.className = 'moldoveneasca-table__selection-cell';
    selectionCell.dataset.selectionCell = 'true';
    const isPrimaryOwner = String(currentUser?.email || '').trim().toLowerCase() === 'sdudnic@gmail.com';
    selectionCell.hidden = !isPrimaryOwner;
    if (record.id) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'moldoveneasca-reference-select';
      checkbox.dataset.referenceSelect = record.id;
      checkbox.checked = selectedReferenceIds.has(record.id);
      checkbox.setAttribute('aria-label', `Selectează referința ${fields.title === '—' ? fields.yearDisplay : fields.title}`);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedReferenceIds.add(record.id);
        else selectedReferenceIds.delete(record.id);
        updateSelectionUi();
      });
      selectionCell.appendChild(checkbox);
    }
    row.appendChild(selectionCell);
    row.appendChild(textCell(fields.yearDisplay, 'moldoveneasca-table__year'));

    const titleCell = document.createElement('td');
    titleCell.className = 'moldoveneasca-table__title';
    const titleText = fields.title || '—';
    const titleLink = document.createElement('a');
    titleLink.href = '#reference-detail';
    titleLink.className = 'moldoveneasca-table__detail-link';
    titleLink.textContent = titleText;
    titleLink.title = titleText === '—' ? `Deschide detaliile referinței din ${fields.yearDisplay}` : titleText;
    titleLink.setAttribute('aria-label', titleText === '—'
      ? `Deschide detaliile referinței din ${fields.yearDisplay}`
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
    row.appendChild(textCell(
      fields.language,
      'moldoveneasca-table__language',
      languageTooltip(fields.language, fields.languageFull)
    ));
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
        link.textContent = `[${index + 1}]`;
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
    const isPrimaryAdmin = String(currentUser?.email || '').trim().toLowerCase() === 'sdudnic@gmail.com';
    const canEdit = Boolean(currentUser && (
      isPrimaryAdmin
      || currentRole === 'admin'
      || (currentUser.id === record.owner_id && record.status === 'pending')
      || record.status === 'published'
    ));
    const canSuggestDeletion = Boolean(currentUser && record.id && !isPrimaryAdmin && record.status === 'published');
    if ((canEdit || canSuggestDeletion) && record.id) {
      const actions = document.createElement('div');
      actions.className = 'moldoveneasca-table__actions';
      if (canEdit) {
        actions.appendChild(createIconButton(
          'Editează referința',
          'edit',
          () => openEditor(record),
          'moldoveneasca-table__edit-button'
        ));
      }
      if (canSuggestDeletion) {
        actions.appendChild(createIconButton(
          'Sugerează ștergerea referinței',
          'delete',
          () => requestRecordDeletion(record),
          'moldoveneasca-table__delete-button moldoveneasca-icon-button--danger'
        ));
      }
      actionsCell.appendChild(actions);
    }

    if (options.showStatusBadge !== false && record.status && record.status !== 'published') {
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
  const ethnicityStaticEntries = ethnicityTbody
    ? Array.from(ethnicityTbody.rows).map((row) => {
      const record = recordFromEthnicityStaticRow(row);
      const converted = createCatalogRow(record);
      row.replaceWith(converted);
      return { row: converted, record };
    })
    : [];

