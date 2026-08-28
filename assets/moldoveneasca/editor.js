  const setStatus = (message, tone = '') => {
    if (!formStatus) return;
    formStatus.textContent = message;
    formStatus.dataset.tone = tone;
  };

  const isPrimaryAdmin = () => String(currentUser?.email || '').trim().toLowerCase() === 'sdudnic@gmail.com';

  const canEditRecord = (record = null) => {
    if (!currentUser) return false;
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
      if (editDetailButton) {
        editDetailButton.hidden = !(returnToDetail && canEditRecord(currentDetailRecord));
      }
      if (returnToDetail && detailTitle && currentDetailRecord) {
        const fields = displayFields(currentDetailRecord);
        detailTitle.textContent = fields.title === '—' ? 'Detalii referință' : fields.title;
        editDetailButton?.focus();
      }
    }
  };

  const setField = (name, value) => {
    const field = editorForm?.elements.namedItem(name);
    if (field) field.value = value || '';
  };

  const openEditor = async (record = null, { inDetail = false } = {}) => {
    if (!editorPanel || !editorForm) return;
    const canEdit = canEditRecord(record);
    if (!canEdit) {
      setStatus('Contul nu are drepturi de editare.', 'error');
      return;
    }
    if (record) await loadRecordImage(record);
    if (inDetail && detailEditorHost) {
      if (!editorPanel.hidden) closeEditor({ returnToDetail: false });
      editorInDetail = true;
      detailEditorHost.appendChild(editorPanel);
      detailEditorHost.hidden = false;
      if (detailView) detailView.hidden = true;
      if (editDetailButton) editDetailButton.hidden = true;
    }
    resetImageMarkup();
    editingId = record?.id || null;
    const imported = record?.source_type === 'Import din tabelul existent';
    const fields = displayFields(record);
    const urls = sourceUrls(record);
    if (formTitle) formTitle.textContent = editingId ? 'Editează referința' : 'Adaugă o referință';
    setField('year_label', record
      ? (citationYearIsExact(record) ? publicationYearLabel(record) : centuryLabel(record))
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
    setField('image_url', record?.image_url);
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

