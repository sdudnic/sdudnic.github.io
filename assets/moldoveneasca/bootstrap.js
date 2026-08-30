(() => {
  const root = document.querySelector('[data-moldoveneasca-catalog]');
  if (!root) return;

  const config = window.MOLDOVENEASCA_CONFIG || {};
  const table = document.querySelector('.post-content table') || document.querySelector('table');
  const tbody = table?.querySelector('tbody');
  const searchInput = root.querySelector('[data-catalog-search]');
  const centurySelect = root.querySelector('[data-catalog-century]');
  const resetButton = root.querySelector('[data-catalog-reset]');
  const result = document.querySelector('[data-catalog-result]');
  const authMessages = [...document.querySelectorAll('[data-auth-message]')];
  const setAuthMessage = (message) => {
    authMessages.forEach((element) => { element.textContent = message; });
  };
  const authUser = document.querySelector('[data-auth-user]');
  const roleBadge = document.querySelector('[data-role-badge]');
  const googleLoginButton = document.querySelector('[data-login-google]');
  const githubLoginButton = document.querySelector('[data-login-github]');
  const loginButtons = [googleLoginButton, githubLoginButton].filter(Boolean);
  const logoutButton = document.querySelector('[data-logout]');
  const openFormButton = root.querySelector('[data-open-form]');
  const editorPanel = root.querySelector('[data-reference-editor]');
  const editorForm = root.querySelector('[data-reference-form]');
  const imageInput = editorForm?.elements.namedItem('image_url');
  const imagePickButton = root.querySelector('[data-image-pick]');
  const imageFileInput = root.querySelector('[data-image-file]');
  const imageAutoUnderlineButton = root.querySelector('[data-image-auto-underline]');
  const imageOcrStatus = root.querySelector('[data-image-ocr-status]');
  const imagePreview = root.querySelector('[data-image-preview]');
  const imageHint = root.querySelector('#image-help');
  const imageMarkup = root.querySelector('[data-image-markup]');
  const imageMarkupStatus = root.querySelector('[data-image-markup-status]');
  const imageCanvas = root.querySelector('[data-image-canvas]');
  const imageUndoButton = root.querySelector('[data-image-undo]');
  const imageClearButton = root.querySelector('[data-image-clear]');
  const yearInput = editorForm?.elements.namedItem('year_label');
  const formTitle = root.querySelector('[data-form-title]');
  const formStatus = root.querySelector('[data-form-status]');
  const cancelEditButton = root.querySelector('[data-cancel-edit]');
  const adminOnlyField = root.querySelector('[data-admin-only]');
  const recordCount = document.querySelector('[data-record-count]');
  const filteredCount = document.querySelector('[data-filtered-count]');
  const statusBar = document.querySelector('[data-catalog-status]');
  const loadingIndicator = document.querySelector('[data-catalog-loading]');
  const pagination = document.querySelector('[data-catalog-pagination]');
  const firstPageButton = document.querySelector('[data-page-first]');
  const previousPageButton = document.querySelector('[data-page-previous]');
  const nextPageButton = document.querySelector('[data-page-next]');
  const lastPageButton = document.querySelector('[data-page-last]');
  const pageStatus = document.querySelector('[data-page-status]');
  const currentPageValue = document.querySelector('[data-page-current]');
  const totalPagesValue = document.querySelector('[data-page-total]');
  const ethnicityStatus = document.querySelector('[data-ethnicity-status]');
  const ethnicityResult = document.querySelector('[data-ethnicity-result]');
  const ethnicityRecordCount = document.querySelector('[data-ethnicity-record-count]');
  const ethnicityFilteredCount = document.querySelector('[data-ethnicity-filtered-count]');
  const ethnicityPagination = document.querySelector('[data-ethnicity-pagination]');
  const ethnicityFirstPageButton = document.querySelector('[data-ethnicity-page-first]');
  const ethnicityPreviousPageButton = document.querySelector('[data-ethnicity-page-previous]');
  const ethnicityNextPageButton = document.querySelector('[data-ethnicity-page-next]');
  const ethnicityLastPageButton = document.querySelector('[data-ethnicity-page-last]');
  const ethnicityPageStatus = document.querySelector('[data-ethnicity-page-status]');
  const ethnicityCurrentPageValue = document.querySelector('[data-ethnicity-page-current]');
  const ethnicityTotalPagesValue = document.querySelector('[data-ethnicity-page-total]');
  const unverifiedStatus = document.querySelector('[data-unverified-status]');
  const unverifiedResult = document.querySelector('[data-unverified-result]');
  const unverifiedRecordCount = document.querySelector('[data-unverified-record-count]');
  const unverifiedFilteredCount = document.querySelector('[data-unverified-filtered-count]');
  const unverifiedPagination = document.querySelector('[data-unverified-pagination]');
  const unverifiedFirstPageButton = document.querySelector('[data-unverified-page-first]');
  const unverifiedPreviousPageButton = document.querySelector('[data-unverified-page-previous]');
  const unverifiedNextPageButton = document.querySelector('[data-unverified-page-next]');
  const unverifiedLastPageButton = document.querySelector('[data-unverified-page-last]');
  const unverifiedPageStatus = document.querySelector('[data-unverified-page-status]');
  const unverifiedCurrentPageValue = document.querySelector('[data-unverified-page-current]');
  const unverifiedTotalPagesValue = document.querySelector('[data-unverified-page-total]');
  const selectionToolbar = document.querySelector('[data-selection-toolbar]');
  const selectionCount = document.querySelector('[data-selection-count]');
  const selectionAll = document.querySelector('[data-selection-all]');
  const selectionDeleteButton = document.querySelector('[data-selection-delete]');
  const selectionClearButton = document.querySelector('[data-selection-clear]');
  const unverifiedSection = document.querySelector('[data-unverified-section]');
  const unverifiedTable = document.querySelector('[data-unverified-table]');
  const unverifiedTbody = unverifiedTable?.querySelector('tbody');
  const ethnicityTable = document.querySelector('[data-ethnicity-table]');
  const ethnicityTbody = ethnicityTable?.querySelector('tbody');
  const detailPanel = root.querySelector('[data-reference-detail]');
  const detailBackdrop = root.querySelector('[data-reference-detail-backdrop]');
  const detailTitle = root.querySelector('[data-detail-title]');
  const detailImage = root.querySelector('[data-detail-image]');
  const detailContent = root.querySelector('[data-detail-content]');
  const detailView = root.querySelector('[data-detail-view]');
  const detailEditorHost = root.querySelector('[data-detail-editor-host]');
  const editDetailButton = root.querySelector('[data-edit-detail]');
  const closeDetailButton = root.querySelector('[data-close-detail]');
  const quoteHint = root.querySelector('[data-catalog-quote-hint]');
  const catalogTypeField = editorForm?.elements.namedItem('catalog_type');
  const quoteField = editorForm?.elements.namedItem('quote');
  const languageField = editorForm?.elements.namedItem('language');
  const sourceUrlField = editorForm?.elements.namedItem('source_url');
  const sourceUrlHint = root.querySelector('[data-source-url-hint]');

  if (!table || !tbody) return;
  table.classList.add('moldoveneasca-table');

  let isCatalogLoading = Boolean(config.supabaseUrl && config.supabaseAnonKey);

  const setCatalogLoading = (loading) => {
    isCatalogLoading = loading;
    if (loadingIndicator) loadingIndicator.hidden = !loading;
    table.hidden = loading;
    if (statusBar) statusBar.hidden = loading;
    if (loading) {
      document.documentElement.dataset.moldoveneascaCatalogPending = 'true';
    } else {
      document.documentElement.removeAttribute('data-moldoveneasca-catalog-pending');
    }
  };

  setCatalogLoading(isCatalogLoading);

  const ensureTableAccessibility = (catalogTable, label) => {
    if (!catalogTable) return;
    let caption = catalogTable.querySelector('caption');
    if (!caption) {
      caption = document.createElement('caption');
      caption.className = 'sr-only';
      catalogTable.insertBefore(caption, catalogTable.firstChild);
    }
    if (!caption.textContent.trim()) caption.textContent = label;
    catalogTable.querySelectorAll('thead th').forEach((header) => {
      if (!header.hasAttribute('scope')) header.setAttribute('scope', 'col');
    });
  };

  ensureTableAccessibility(table, 'Referințe istorice despre limba moldovenească');
  ensureTableAccessibility(unverifiedTable, 'Referințe neverificate despre limba moldovenească');
  ensureTableAccessibility(ethnicityTable, 'Referințe despre etnie, națiune și popor');

  const wrapPublicGrid = () => {
    if (!statusBar || !table.parentElement || statusBar.parentElement !== table.parentElement) return;
    const frame = document.createElement('div');
    frame.className = 'moldoveneasca-grid-frame';
    frame.setAttribute('role', 'region');
    frame.setAttribute('aria-label', 'Tabelul catalogului; derulați orizontal pe ecrane mici');
    frame.setAttribute('tabindex', '0');
    table.parentElement.insertBefore(frame, table);
    if (selectionToolbar) frame.appendChild(selectionToolbar);
    frame.appendChild(table);
    frame.appendChild(statusBar);
  };

  wrapPublicGrid();

  let supabaseClient = null;
  let currentUser = null;
  let currentRole = 'viewer';
  let editingId = null;
  let remoteRecords = [];
  let ethnicityRecords = [];
  let unverifiedRecords = [];
  let remoteCatalogLoaded = false;
  let remoteDataMode = 'fallback';
  let catalogTotalRecords = 0;
  let isRemotePageLoading = false;
  let remoteLoadToken = 0;
  let ethnicityCurrentPage = 1;
  let unverifiedCurrentPage = 1;
  let sortAscending = true;
  let sortButton = null;
  let rowSequence = 0;
  const pageSize = 20;
  let currentPage = 1;
  let catalogTotalPages = 1;
  let lastDetailTrigger = null;
  let currentDetailRecord = null;
  let editorInDetail = false;
  let searchDebounceTimer = null;
  const searchDebounceMs = 120;
  const selectedReferenceIds = new Set();
  const catalogTypeValues = new Set(['language', 'ethnicity', 'both']);
  const recordImageCache = new Map();
  const editorHomeParent = editorPanel?.parentNode || null;
  const editorHomeNextSibling = editorPanel?.nextSibling || null;

