  const goToPage = async (page) => {
    if (isRemotePageLoading) return;
    const targetPage = Math.max(1, Math.min(catalogTotalPages, Number(page) || 1));
    const hasFilter = Boolean(normalize(searchInput?.value) || normalize(centurySelect?.value));
    const isServerPage = remoteDataMode === 'page' && remoteCatalogLoaded && !hasFilter;
    if (isServerPage && supabaseClient) {
      try {
        await loadRemoteRecords({ page: targetPage, allRecords: false, refreshRelated: false });
      } catch (error) {
        if (result) result.textContent = `Pagina nu a putut fi încărcată: ${error.message}`;
      }
      return;
    }
    currentPage = targetPage;
    filterRows();
  };

  languageGrid.onPageChange = goToPage;
  ethnicityGrid.onPageChange = (page) => {
    ethnicityCurrentPage = page;
    filterRows();
  };
  unverifiedGrid.onPageChange = (page) => {
    unverifiedCurrentPage = page;
    filterRows();
  };

  selectionAll?.addEventListener('change', () => setVisibleSelection(selectionAll.checked));
  selectionClearButton?.addEventListener('click', () => {
    selectedReferenceIds.clear();
    updateSelectionUi();
  });
  selectionDeleteButton?.addEventListener('click', deleteSelectedRecords);
  searchInput?.addEventListener('input', scheduleSearch);
  searchInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applySearch().catch((error) => {
        if (result) result.textContent = `Filtrarea nu a putut fi încărcată: ${error.message}`;
      });
    }
  });
  centurySelect?.addEventListener('change', () => {
    applySearch().catch((error) => {
      if (result) result.textContent = `Filtrarea nu a putut fi încărcată: ${error.message}`;
    });
  });
  resetButton?.addEventListener('click', () => {
    if (searchDebounceTimer) window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
    if (searchInput) searchInput.value = '';
    if (centurySelect) centurySelect.value = '';
    applySearch().catch((error) => {
      if (result) result.textContent = `Filtrarea nu a putut fi încărcată: ${error.message}`;
    });
    searchInput?.focus();
  });
  googleLoginButton?.addEventListener('click', () => signIn('google'));
  githubLoginButton?.addEventListener('click', () => signIn('github'));
  logoutButton?.addEventListener('click', signOut);
  openFormButton?.addEventListener('click', () => openEditor());
  cancelEditButton?.addEventListener('click', closeEditor);
  catalogTypeField?.addEventListener('change', updateQuoteRequirement);
  editDetailButton?.addEventListener('click', () => {
    if (currentDetailRecord) openEditor(currentDetailRecord, { inDetail: true });
  });
  detailPreviousButton?.addEventListener('click', () => navigateDetail(-1));
  detailNextButton?.addEventListener('click', () => navigateDetail(1));
  shareDetailButton?.addEventListener('click', shareCurrentDetail);
  closeDetailButton?.addEventListener('click', closeDetail);
  closeImageLightboxButton?.addEventListener('click', closeImageLightbox);
  imageLightboxBackdrop?.addEventListener('click', closeImageLightbox);
  imageInput?.addEventListener('input', () => {
    renderImagePreview();
    if (!imageSourceDataUrl) imageOcrButtonState();
  });
  quoteField?.addEventListener('input', () => {
    if (!imageAutoAnnotated) return;
    imageAutoAnnotated = false;
    if (imageOcrStatus) imageOcrStatus.textContent = 'Citatul s-a schimbat; verifică sau regenerează sublinierea OCR.';
    paintImageMarkup();
  });
  editorForm?.addEventListener('paste', (event) => {
    const item = [...(event.clipboardData?.items || [])].find((entry) => entry.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    event.preventDefault();
    setImageFromFile(file);
  });
  imagePickButton?.addEventListener('click', () => imageFileInput?.click());
  imageFileInput?.addEventListener('change', () => setImageFromFile(imageFileInput.files?.[0]));
  imageGalleryAddButton?.addEventListener('click', appendImageGalleryItem);
  imageAutoUnderlineButton?.addEventListener('click', () => autoUnderlineImage());
  const imageCanvasPoint = (event) => {
    if (!imageCanvas) return null;
    const bounds = imageCanvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    return {
      x: (event.clientX - bounds.left) * (imageCanvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (imageCanvas.height / bounds.height)
    };
  };
  imageCanvas?.addEventListener('pointerdown', (event) => {
    if (imageHasExternalRed || !imageSourceDataUrl) return;
    const point = imageCanvasPoint(event);
    if (!point) return;
    event.preventDefault();
    imageAutoAnnotated = false;
    activeImageStroke = [point];
    imageStrokes.push(activeImageStroke);
    const context = imageCanvas.getContext('2d');
    if (context) drawRedStroke(context, activeImageStroke, imageCanvas.width);
    imageCanvas.setPointerCapture?.(event.pointerId);
  });
  imageCanvas?.addEventListener('pointermove', (event) => {
    if (!activeImageStroke) return;
    const point = imageCanvasPoint(event);
    const previous = activeImageStroke.at(-1);
    if (!point || !previous) return;
    activeImageStroke.push(point);
    const context = imageCanvas.getContext('2d');
    if (context) drawRedStrokeSegment(context, previous, point, imageCanvas.width);
  });
  const finishImageStroke = (event) => {
    if (!activeImageStroke) return;
    activeImageStroke = null;
    imageCanvas?.releasePointerCapture?.(event.pointerId);
    if (imageCanvas && imageInput) {
      const encoded = encodeCanvasWithinLimit(imageCanvas, imageCanvas.width, imageCanvas.height);
      imageInput.value = encoded.dataUrl;
      renderImagePreview();
    }
  };
  imageCanvas?.addEventListener('pointerup', finishImageStroke);
  imageCanvas?.addEventListener('pointercancel', finishImageStroke);
  imageUndoButton?.addEventListener('click', async () => {
    if (imageHasExternalRed || !imageStrokes.length) return;
    imageAutoAnnotated = false;
    imageStrokes.pop();
    await paintImageMarkup();
  });
  imageClearButton?.addEventListener('click', async () => {
    if (imageHasExternalRed || !imageStrokes.length) return;
    imageAutoAnnotated = false;
    imageStrokes = [];
    await paintImageMarkup();
  });
  yearInput?.addEventListener('input', () => {
    if (!imageHasExternalRed && imageSourceDataUrl) paintImageMarkup();
  });
  detailBackdrop?.addEventListener('click', closeDetail);
  document.addEventListener('keydown', (event) => {
    if (imageLightbox && !imageLightbox.hidden) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeImageLightbox();
        return;
      }
      if (event.key === 'Tab') {
        const focusable = [...imageLightbox.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]')]
          .filter((element) => !element.disabled && element.getClientRects().length);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (first && last && (event.shiftKey && (document.activeElement === first || !imageLightbox.contains(document.activeElement)))) {
          event.preventDefault();
          last.focus();
          return;
        }
        if (first && last && (!event.shiftKey && (document.activeElement === last || !imageLightbox.contains(document.activeElement)))) {
          event.preventDefault();
          first.focus();
          return;
        }
      }
    }
    if (event.key === 'Escape' && detailPanel && !detailPanel.hidden) closeDetail();
    if (event.key === 'Tab' && detailPanel && !detailPanel.hidden) {
      const focusable = [...detailPanel.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]')]
        .filter((element) => !element.disabled && element.getClientRects().length);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || !detailPanel.contains(document.activeElement))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !detailPanel.contains(document.activeElement))) {
        event.preventDefault();
        first?.focus();
      }
    }
  });
  window.addEventListener('popstate', async () => {
    if (detailPanel && !detailPanel.hidden) closeDetail({ updateUrl: false });
    if (sharedReferenceKeyFromUrl()) {
      await restoreDetailFromUrl();
    }
  });
  editorForm?.addEventListener('submit', saveRecord);

  updateQuoteRequirement();
  sortRowsChronologically();
  updateStats();
  filterRows();
  setRole('viewer');

  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    setCatalogLoading(false);
    restoreDetailFromUrl();
    updateSelectionUi();
    loginButtons.forEach((button) => { button.disabled = true; });
    setAuthMessage('Catalogul public și căutarea funcționează fără cont; autentificarea Google/GitHub nu este încă configurată.');
    return;
  }

  (async () => {
    try {
      const supabase = await loadSupabaseScript();
      supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      const { data: sessionData } = await supabaseClient.auth.getSession();
      await loadProfile(sessionData?.session?.user || null);
      await loadRemoteRecords({ page: 1, allRecords: false });
      setCatalogLoading(false);
      await restoreDetailFromUrl();
      updateSelectionUi();
      supabaseClient.auth.onAuthStateChange((_event, session) => {
        if ((session?.user?.id || null) === (currentUser?.id || null)) return;
        window.setTimeout(async () => {
          try {
            recordImageCache.clear();
            pendingRecordImages.clear();
            if (currentDetailRecord?.status && currentDetailRecord.status !== 'published') closeDetail();
            unverifiedRecords = [];
            await loadProfile(session?.user || null);
            await loadRemoteRecords();
          } catch (error) {
            setAuthMessage(`Profilul nu a putut fi încărcat: ${error.message}`);
          }
        }, 0);
      });
    } catch (error) {
      setCatalogLoading(false);
      restoreDetailFromUrl();
      updateSelectionUi();
      loginButtons.forEach((button) => { button.disabled = true; });
      if (result) result.textContent = 'Sursa live nu răspunde; se afișează copia locală.';
      setAuthMessage(`Catalogul public funcționează, dar autentificarea nu este disponibilă: ${error.message}`);
    }
  })();
})();
