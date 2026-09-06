  const detailHeadingText = (record) => {
    const title = String(displayFields(record).title || '').trim();
    return title && title !== '—' ? title : 'Sursă fără denumire';
  };

  let detailSourceTable = null;

  const detailNavigationEntries = () => {
    if (!detailSourceTable) return [];
    return [...detailSourceTable.querySelectorAll('tbody tr')]
      .map((row) => ({ row, record: row.catalogRecord }))
      .filter(({ record }) => record);
  };

  const sameDetailRecord = (left, right) => left === right
    || Boolean(left?.id && right?.id && String(left.id) === String(right.id));

  const findDetailSourceTable = (record) => [table, ethnicityTable, unverifiedTable]
    .filter(Boolean)
    .find((candidate) => [...candidate.querySelectorAll('tbody tr')]
      .some((row) => sameDetailRecord(row.catalogRecord, record))) || null;

  const detailNavigationPosition = () => {
    const entries = detailNavigationEntries();
    return {
      entries,
      index: entries.findIndex(({ record }) => sameDetailRecord(record, currentDetailRecord))
    };
  };

  const updateDetailNavigation = () => {
    const { entries, index } = detailNavigationPosition();
    const available = Boolean(currentDetailRecord && !editorInDetail && index >= 0);
    if (detailPreviousButton) {
      detailPreviousButton.hidden = !available;
      detailPreviousButton.disabled = !available || index <= 0;
    }
    if (detailNextButton) {
      detailNextButton.hidden = !available;
      detailNextButton.disabled = !available || index >= entries.length - 1;
    }
  };

  const navigateDetail = (offset) => {
    const { entries, index } = detailNavigationPosition();
    const target = entries[index + offset];
    if (!target) return;
    const trigger = target.row.querySelector('.moldoveneasca-table__detail-link');
    openDetail(target.record, trigger);
  };

  const closeDetail = ({ updateUrl = true } = {}) => {
    detailRestoreToken += 1;
    if (editorInDetail) closeEditor({ returnToDetail: false });
    if (detailPanel) {
      detailPanel.classList.remove('is-open');
      detailPanel.hidden = true;
    }
    if (detailBackdrop) detailBackdrop.hidden = true;
    document.body.classList.remove('moldoveneasca-detail-open');
    if (lastDetailTrigger?.isConnected) lastDetailTrigger.focus();
    lastDetailTrigger = null;
    currentDetailRecord = null;
    detailSourceTable = null;
    updateDetailNavigation();
    updateDetailShareState(null);
    if (updateUrl) clearReferenceUrl();
  };

  const renderDetailImage = (record) => {
    if (!detailImage) return;
    detailImage.replaceChildren();
    const url = imageUrl(record);
    if (!url) {
      detailImage.hidden = true;
      return;
    }
    const fields = displayFields(record);
    const image = document.createElement('img');
    image.src = url;
    image.alt = fields.title === '—' ? 'Imaginea referinței' : fields.title;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', () => {
      detailImage.replaceChildren();
      detailImage.hidden = true;
    }, { once: true });
    detailImage.appendChild(image);
    detailImage.hidden = false;
  };

  const openDetail = (record, trigger, { updateUrl = true, replaceUrl = false } = {}) => {
    if (!detailPanel || !detailContent) return;
    if (editorInDetail) closeEditor({ returnToDetail: false });
    detailSourceTable = trigger?.closest?.('table') || findDetailSourceTable(record);
    currentDetailRecord = record || null;
    if (updateUrl) setReferenceUrl(currentDetailRecord, { replace: replaceUrl });
    updateDetailShareState(currentDetailRecord);
    const fields = displayFields(record);
    const urls = sourceUrls(record);
    detailContent.replaceChildren();
    if (detailTitle) detailTitle.textContent = detailHeadingText(record);
    renderDetailImage(record);
    loadRecordImage(record).then((loadedRecord) => {
      if (currentDetailRecord === record || (record?.id && currentDetailRecord?.id === record.id)) {
        renderDetailImage(loadedRecord);
      }
    }).catch(() => {
      if (currentDetailRecord === record) setDetailShareStatus('Imaginea nu a putut fi încărcată. Redeschide referința pentru a reîncerca.');
    });

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

    addDetailField('Anul citatului', fields.yearDetail);
    addDetailField('Limba', fields.languageDetail);
    addDetailField('Autor', fields.author);
    addDetailField('Proveniență', record?.source_type);
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
          link.textContent = `[${index + 1}]`;
          link.title = url;
          content.appendChild(link);
          if (index < urls.length - 1) content.appendChild(document.createTextNode(', '));
        });
      });
    }

    if (detailView) detailView.hidden = false;
    if (detailEditorHost) detailEditorHost.hidden = true;
    updateDetailNavigation();
    if (editDetailButton) {
      const isPrimaryAdmin = String(currentUser?.email || '').trim().toLowerCase() === 'sdudnic@gmail.com';
      editDetailButton.hidden = !(currentUser && record?.id && (
        isPrimaryAdmin
        || currentRole === 'admin'
        || (record.owner_id === currentUser.id && record.status === 'pending')
        || record.status === 'published'
      ));
    }
    lastDetailTrigger = trigger || null;
    detailPanel.hidden = false;
    if (detailBackdrop) detailBackdrop.hidden = false;
    detailPanel.classList.add('is-open');
    document.body.classList.add('moldoveneasca-detail-open');
    updateDetailNavigation();
    closeDetailButton?.focus();
  };

