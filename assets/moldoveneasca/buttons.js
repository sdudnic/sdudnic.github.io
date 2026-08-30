  const createIconSvg = (kind) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const paths = {
      edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM14.06 4.94l3.75 3.75',
      delete: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
      reset: 'M20 11a8 8 0 1 0 2 5M20 5v6h-6',
      add: 'M12 5v14M5 12h14',
      previous: 'M19 12H5M12 19l-7-7 7-7',
      next: 'M5 12h14M12 5l7 7-7 7',
      first: 'M11 5L4 12l7 7M20 5l-7 7 7 7',
      last: 'M4 5l7 7-7 7M13 5l7 7-7 7',
      cancel: 'M6 6l12 12M18 6L6 18',
      save: 'M5 12l4 4L19 6',
      undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 6 6v1',
      login: 'M10 17l5-5-5-5M15 12H3M21 3v18',
      logout: 'M14 17l5-5-5-5M19 12H7M3 3v18',
      image: 'M4 5h16v14H4zM7 15l3-3 2 2 2-2 3 3M8.5 9.5h.01',
      'sort-up': 'M7 14l5-5 5 5',
      'sort-down': 'M7 10l5 5 5-5'
    };
    path.setAttribute('d', paths[kind] || paths.cancel);
    svg.appendChild(path);
    return svg;
  };

  const createIconButton = (label, kind, onClick, modifier = '') => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `moldoveneasca-icon-button${modifier ? ` ${modifier}` : ''}`;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.dataset.tooltip = label;
    button.appendChild(createIconSvg(kind));
    button.addEventListener('click', onClick);
    return button;
  };

  const configureIconButton = (button, label, kind) => {
    if (!button) return;
    button.classList.remove('moldoveneasca-button', 'moldoveneasca-button--quiet');
    button.classList.add('moldoveneasca-icon-button');
    button.replaceChildren(createIconSvg(kind));
    button.setAttribute('aria-label', label);
    button.title = label;
    button.dataset.tooltip = label;
  };

  const configureCatalogButtons = () => {
    configureIconButton(resetButton, 'Resetează căutarea', 'reset');
    configureIconButton(openFormButton, 'Adaugă referință', 'add');
    configureIconButton(cancelEditButton, 'Anulează editarea', 'cancel');
    configureIconButton(editorForm?.querySelector('button[type="submit"]'), 'Salvează referința', 'save');
    configureIconButton(firstPageButton, 'Prima pagină', 'first');
    configureIconButton(previousPageButton, 'Pagina anterioară', 'previous');
    configureIconButton(nextPageButton, 'Pagina următoare', 'next');
    configureIconButton(lastPageButton, 'Ultima pagină', 'last');
    configureIconButton(ethnicityFirstPageButton, 'Prima pagină', 'first');
    configureIconButton(ethnicityPreviousPageButton, 'Pagina anterioară', 'previous');
    configureIconButton(ethnicityNextPageButton, 'Pagina următoare', 'next');
    configureIconButton(ethnicityLastPageButton, 'Ultima pagină', 'last');
    configureIconButton(unverifiedFirstPageButton, 'Prima pagină', 'first');
    configureIconButton(unverifiedPreviousPageButton, 'Pagina anterioară', 'previous');
    configureIconButton(unverifiedNextPageButton, 'Pagina următoare', 'next');
    configureIconButton(unverifiedLastPageButton, 'Ultima pagină', 'last');
    configureIconButton(editDetailButton, 'Modifică referința', 'edit');
    configureIconButton(closeDetailButton, 'Închide detaliile', 'cancel');
    configureIconButton(imagePickButton, 'Încarcă imaginea paginii citate', 'image');
    configureIconButton(imageUndoButton, 'Anulează ultima subliniere', 'undo');
    configureIconButton(imageClearButton, 'Elimină sublinierile adăugate', 'cancel');
    configureIconButton(selectionDeleteButton, 'Șterge referințele selectate', 'delete');
    configureIconButton(selectionClearButton, 'Deselectează referințele selectate', 'cancel');
  };

