  const setStatus = (message, tone = '') => {
    if (!formStatus) return;
    formStatus.textContent = message;
    formStatus.dataset.tone = tone;
  };

  const isPrimaryAdmin = () => String(currentUser?.email || '').trim().toLowerCase() === 'sdudnic@gmail.com';

  const canEditRecord = (record = null) => {
    if (!currentUser) return false;
    if (!record) return true;
    if (isPrimaryAdmin() || currentRole === 'admin') return true;
    return Boolean(record?.id && (
      (record.owner_id === currentUser.id && record.status === 'pending')
      || record.status === 'published'
    ));
  };

  const setRole = (role) => {
    currentRole = ['viewer', 'editor', 'admin'].includes(role) ? role : 'viewer';
    if (roleBadge) {
      roleBadge.textContent = currentRole;
      roleBadge.dataset.role = currentRole;
      roleBadge.hidden = !currentUser;
    }
    if (openFormButton) openFormButton.hidden = !currentUser;
    if (adminOnlyField) adminOnlyField.hidden = !isPrimaryAdmin();
    if (unverifiedSection) unverifiedSection.hidden = !currentUser;
    if (editDetailButton) {
      editDetailButton.hidden = !canEditRecord(currentDetailRecord);
    }
    renderUnverifiedRows();
    updateSelectionUi();
  };

  const restoreEditorHome = () => {
    if (!editorPanel || !editorHomeParent) return;
    if (editorHomeNextSibling?.parentNode === editorHomeParent) {
      editorHomeParent.insertBefore(editorPanel, editorHomeNextSibling);
    } else {
      editorHomeParent.appendChild(editorPanel);
    }
  };

  const closeEditor = ({ returnToDetail = true } = {}) => {
    const wasInDetail = editorInDetail;
    editingId = null;
    if (editorForm) editorForm.reset();
    renderImageGalleryEditor();
    updateQuoteRequirement();
    resetImageMarkup();
    renderImagePreview();
    if (imageHint) imageHint.textContent = 'Lipește cu Ctrl+V captura paginii unde apare citatul; pentru un PDF păstrează doar pagina citată și, ideal, subliniază cu roșu glotonimul.';
    if (formTitle) formTitle.textContent = 'Adaugă o referință';
    setStatus('');
    if (editorPanel) editorPanel.hidden = true;
    if (wasInDetail) {
      restoreEditorHome();
      editorInDetail = false;
      if (detailEditorHost) detailEditorHost.hidden = true;
      if (detailView) detailView.hidden = !returnToDetail;
      updateDetailShareState(returnToDetail ? currentDetailRecord : null);
      if (editDetailButton) {
        editDetailButton.hidden = !(returnToDetail && canEditRecord(currentDetailRecord));
      }
      updateDetailNavigation();
      if (returnToDetail && detailTitle && currentDetailRecord) {
        detailTitle.textContent = detailHeadingText(currentDetailRecord);
        editDetailButton?.focus();
      }
    }
  };

  const setField = (name, value) => {
    const field = editorForm?.elements.namedItem(name);
    if (field) field.value = value || '';
  };

  const setHiddenField = (name, value) => {
    if (!editorForm) return;
    let field = editorForm.elements.namedItem(name);
    if (!field) {
      field = document.createElement('input');
      field.type = 'hidden';
      field.name = name;
      editorForm.appendChild(field);
    }
    field.value = value || '';
  };

  const createImageGalleryEditorItem = (item = {}) => {
    const row = document.createElement('span');
    row.className = 'moldoveneasca-image-gallery-item';

    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.name = 'image_item_url';
    urlInput.value = item.url || '';
    urlInput.placeholder = 'URL HTTPS sau data: pentru imaginea suplimentară';
    urlInput.setAttribute('aria-label', 'URL imagine suplimentară');

    const descriptionInput = document.createElement('textarea');
    descriptionInput.name = 'image_item_description';
    descriptionInput.rows = 2;
    descriptionInput.maxLength = 1000;
    descriptionInput.value = item.description || '';
    descriptionInput.placeholder = 'Descrierea acestei imagini';
    descriptionInput.setAttribute('aria-label', 'Descriere imagine suplimentară');

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'moldoveneasca-icon-button moldoveneasca-icon-button--danger';
    removeButton.textContent = '×';
    removeButton.setAttribute('aria-label', 'Elimină imaginea suplimentară');
    removeButton.title = 'Elimină imaginea suplimentară';
    removeButton.addEventListener('click', () => row.remove());

    const originalUrlInput = document.createElement('input');
    originalUrlInput.type = 'hidden';
    originalUrlInput.name = 'image_item_original_url';
    originalUrlInput.value = item.original_url || '';
    const thumbnailUrlInput = document.createElement('input');
    thumbnailUrlInput.type = 'hidden';
    thumbnailUrlInput.name = 'image_item_thumbnail_url';
    thumbnailUrlInput.value = item.thumbnail_url || '';

    row.append(urlInput, descriptionInput, originalUrlInput, thumbnailUrlInput, removeButton);
    return row;
  };

  const renderImageGalleryEditor = (record = null) => {
    if (!imageGalleryList) return;
    imageGalleryList.replaceChildren();
    imageItems(record).slice(1).forEach((item) => {
      imageGalleryList.appendChild(createImageGalleryEditorItem(item));
    });
  };

  const appendImageGalleryItem = () => {
    if (!imageGalleryList) return;
    const row = createImageGalleryEditorItem();
    imageGalleryList.appendChild(row);
    row.querySelector('input')?.focus();
  };

  const openEditor = async (record = null, { inDetail = false } = {}) => {
    if (!editorPanel || !editorForm) return;
    const canEdit = canEditRecord(record);
    if (!canEdit) {
      setStatus('Contul nu are drepturi de editare.', 'error');
      return;
    }
    if (record) {
      const original = record;
      try {
        record = await loadRecordImage(record);
      } catch (error) {
        setAuthMessage(`Editorul nu a putut încărca imaginea existentă: ${error.message}. Reîncearcă.`);
        if (inDetail) setDetailShareStatus('Imaginea existentă nu a putut fi încărcată. Reîncearcă editarea.');
        return;
      }
      if (!canEditRecord(record) || (inDetail && currentDetailRecord?.id !== original.id)) return;
    }
    if (inDetail && detailEditorHost) {
      if (!editorPanel.hidden) closeEditor({ returnToDetail: false });
      editorInDetail = true;
      detailEditorHost.appendChild(editorPanel);
      detailEditorHost.hidden = false;
      if (detailView) detailView.hidden = true;
      if (editDetailButton) editDetailButton.hidden = true;
      updateDetailShareState(null);
      updateDetailNavigation();
    }
    resetImageMarkup();
    editingId = record?.id || null;
    const imported = record?.source_type === 'Import din tabelul existent';
    const fields = displayFields(record);
    const urls = sourceUrls(record);
    if (formTitle) formTitle.textContent = editingId ? 'Editează referința' : 'Adaugă o referință';
    setField('year_label', record
      ? (normalize(record.year_label) === 'necunoscut' ? 'necunoscut' : (citationYearIsExact(record) ? publicationYearLabel(record) : centuryLabel(record)))
      : '');
    setField('title', imported ? (fields.title === '—' ? null : fields.title) : record?.title);
    setField('language', record ? citationLanguageCode(record) : '');
    setField('author', record?.author);
    setField('source_type', record?.source_type);
    setField('catalog_type', recordCatalogType(record));
    updateQuoteRequirement();
    setField('description', recordComments(record));
    setField('quote', fields.quote);
    setField('location', record?.location);
    setField('source_url', record?.source_url || urls[0]);
    const galleryItems = imageItems(record);
    setField('image_url', galleryItems[0]?.url || record?.image_url);
    setField('image_description', galleryItems[0]?.description);
    setHiddenField('image_original_url', galleryItems[0]?.original_url);
    setHiddenField('image_thumbnail_url', galleryItems[0]?.thumbnail_url);
    renderImageGalleryEditor(record);
    renderImagePreview();
    setField('status', record?.status || 'pending');
    setStatus('');
    editorPanel.hidden = false;
    if (inDetail) {
      editorForm.elements.namedItem('year_label')?.focus();
    } else {
      editorPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

