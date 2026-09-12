  const detailHeadingText = (record) => {
    const title = String(displayFields(record).title || '').trim();
    return title && title !== '—' ? title : 'Sursă fără denumire';
  };

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
    detailImageRecordKey = '';
    detailImageIndex = 0;
    detailCarouselState = null;
    updateDetailNavigation();
    updateDetailShareState(null);
    if (updateUrl) clearReferenceUrl();
  };

  let detailImageRecordKey = '';
  let detailImageIndex = 0;
  let detailCarouselState = null;

  const updateDetailCarousel = (state, index) => {
    if (!state) return;
    const activeIndex = Math.max(0, Math.min(Number(index) || 0, state.items.length - 1));
    state.index = activeIndex;
    detailImageIndex = activeIndex;
    state.track.style.transform = `translate3d(-${activeIndex * 100}%, 0, 0)`;
    state.previous.disabled = activeIndex === 0;
    state.next.disabled = activeIndex === state.items.length - 1;
    state.position.textContent = `${activeIndex + 1} / ${state.items.length}`;
    state.indicators.forEach((indicator, indicatorIndex) => {
      const selected = indicatorIndex === activeIndex;
      indicator.setAttribute('aria-selected', String(selected));
      indicator.tabIndex = selected ? 0 : -1;
    });
  };

  const createDetailImageFigure = (item, index, title, className) => {
    const figure = document.createElement('figure');
    figure.className = className;
    const image = document.createElement('img');
    image.src = item.url;
    image.alt = item.description || (title === '—'
      ? `Imaginea referinței ${index + 1}`
      : `${title} — imaginea ${index + 1}`);
    image.loading = index === 0 ? 'eager' : 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', () => {
      if (!figure.isConnected) return;
      image.hidden = true;
      figure.classList.add('is-unavailable');
    }, { once: true });
    const originalUrl = String(item.original_url || '').trim();
    if (originalUrl && originalUrl !== item.url) {
      const link = document.createElement('a');
      link.className = 'moldoveneasca-detail__image-original';
      link.href = originalUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = 'Deschide imaginea originală pentru zoom';
      link.setAttribute('aria-label', 'Deschide imaginea originală pentru zoom');
      link.appendChild(image);
      figure.appendChild(link);
    } else {
      figure.appendChild(image);
    }
    if (item.description) {
      const caption = document.createElement('figcaption');
      caption.className = 'moldoveneasca-detail__image-caption';
      caption.textContent = item.description;
      figure.appendChild(caption);
    }
    return figure;
  };

  const renderDetailImage = (record) => {
    if (!detailImage) return;
    const items = imageItems(record);
    const recordKey = String(record?.id || '');
    if (recordKey !== detailImageRecordKey) {
      detailImageRecordKey = recordKey;
      detailImageIndex = 0;
    }
    if (!items.length) {
      detailCarouselState = null;
      detailImage.replaceChildren();
      detailImage.hidden = true;
      return;
    }
    const fields = displayFields(record);
    const title = fields.title === '—' ? 'Sursă' : fields.title;
    const activeIndex = Math.max(0, Math.min(detailImageIndex, items.length - 1));
    detailImageIndex = activeIndex;
    const signature = items.map((item) => `${item.url}\u0000${item.description}\u0000${item.original_url || ''}\u0000${item.thumbnail_url || ''}`).join('\u0001');
    if (detailCarouselState?.recordKey === recordKey
      && detailCarouselState.signature === signature) {
      updateDetailCarousel(detailCarouselState, activeIndex);
      detailImage.hidden = false;
      return;
    }
    detailCarouselState = null;
    detailImage.replaceChildren();

    if (items.length === 1) {
      detailImage.appendChild(createDetailImageFigure(items[0], 0, title, 'moldoveneasca-detail__figure'));
      detailImage.hidden = false;
      return;
    }

    const carousel = document.createElement('section');
    carousel.className = 'moldoveneasca-detail__carousel';
    carousel.setAttribute('role', 'region');
    carousel.setAttribute('aria-roledescription', 'carousel');
    carousel.setAttribute('aria-label', `Imagini pentru ${title}`);
    carousel.tabIndex = 0;

    const viewport = document.createElement('div');
    viewport.className = 'moldoveneasca-detail__carousel-viewport';
    let pointerStartX = null;
    const state = {
      recordKey,
      signature,
      items,
      index: activeIndex,
      track: null,
      previous: null,
      next: null,
      position: null,
      indicators: []
    };
    const moveTo = (index) => updateDetailCarousel(state, index);
    viewport.addEventListener('pointerdown', (event) => {
      pointerStartX = event.clientX;
    });
    viewport.addEventListener('pointerup', (event) => {
      if (pointerStartX === null) return;
      const delta = event.clientX - pointerStartX;
      pointerStartX = null;
      if (Math.abs(delta) < 40) return;
      moveTo(state.index + (delta < 0 ? 1 : -1));
    });
    viewport.addEventListener('pointercancel', () => { pointerStartX = null; });

    const track = document.createElement('div');
    track.className = 'moldoveneasca-detail__carousel-track';
    state.track = track;
    items.forEach((item, index) => {
      track.appendChild(createDetailImageFigure(
        item,
        index,
        title,
        'moldoveneasca-detail__carousel-slide'
      ));
    });
    viewport.appendChild(track);
    carousel.appendChild(viewport);

    const controls = document.createElement('div');
    controls.className = 'moldoveneasca-detail__carousel-controls';
    const previous = document.createElement('button');
    previous.type = 'button';
    previous.className = 'moldoveneasca-icon-button';
    previous.textContent = '‹';
    previous.setAttribute('aria-label', 'Imaginea precedentă');
    previous.title = 'Imaginea precedentă';
    state.previous = previous;
    previous.addEventListener('click', () => moveTo(state.index - 1));
    const position = document.createElement('span');
    position.className = 'moldoveneasca-detail__carousel-position';
    state.position = position;
    position.setAttribute('aria-live', 'polite');
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'moldoveneasca-icon-button';
    next.textContent = '›';
    next.setAttribute('aria-label', 'Imaginea următoare');
    next.title = 'Imaginea următoare';
    state.next = next;
    next.addEventListener('click', () => moveTo(state.index + 1));
    controls.append(previous, position, next);
    carousel.appendChild(controls);

    const indicators = document.createElement('div');
    indicators.className = 'moldoveneasca-detail__carousel-indicators';
    indicators.setAttribute('role', 'tablist');
    indicators.setAttribute('aria-label', 'Selectează imaginea');
    items.forEach((item, index) => {
      const indicator = document.createElement('button');
      indicator.type = 'button';
      indicator.className = 'moldoveneasca-detail__carousel-indicator';
      indicator.setAttribute('role', 'tab');
      indicator.setAttribute('aria-label', `Imaginea ${index + 1} din ${items.length}`);
      indicator.setAttribute('aria-selected', String(index === activeIndex));
      indicator.tabIndex = index === activeIndex ? 0 : -1;
      indicator.addEventListener('click', () => moveTo(index));
      state.indicators.push(indicator);
      indicators.appendChild(indicator);
    });
    carousel.appendChild(indicators);
    carousel.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveTo(state.index - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveTo(state.index + 1);
      }
    });
    detailCarouselState = state;
    detailImage.appendChild(carousel);
    updateDetailCarousel(state, activeIndex);
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
    closeDetailButton?.focus();
  };

