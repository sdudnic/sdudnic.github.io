  class ReferenceGrid {
    constructor({
      table,
      tbody,
      status,
      pagination,
      firstButton,
      previousButton,
      nextButton,
      lastButton,
      pageStatus,
      currentValue,
      totalValue,
      pageSize: size,
      getPage,
      setPage
    }) {
      this.table = table;
      this.tbody = tbody;
      this.status = status;
      this.pagination = pagination;
      this.firstButton = firstButton;
      this.previousButton = previousButton;
      this.nextButton = nextButton;
      this.lastButton = lastButton;
      this.pageStatus = pageStatus;
      this.currentValue = currentValue;
      this.totalValue = totalValue;
      this.pageSize = size;
      this.getPage = getPage;
      this.setPage = setPage;
      this.frame = this.ensureFrame();
      this.page = 1;
      this.totalPages = 1;
      this.totalRows = 0;
      this.loading = false;
      this.onPageChange = null;
      [
        [this.firstButton, () => 1],
        [this.previousButton, () => this.page - 1],
        [this.nextButton, () => this.page + 1],
        [this.lastButton, () => this.totalPages]
      ].forEach(([button, getTarget]) => {
        button?.addEventListener('click', () => this.requestPage(getTarget()));
      });
    }

    ensureFrame() {
      if (!this.table?.parentElement) return null;
      const existingFrame = this.table.closest('.moldoveneasca-grid-frame');
      if (existingFrame) return existingFrame;
      const parent = this.table.parentElement;
      const frame = document.createElement('div');
      frame.className = 'moldoveneasca-grid-frame';
      parent.insertBefore(frame, this.table);
      frame.appendChild(this.table);
      if (this.status?.parentElement === parent) frame.appendChild(this.status);
      else if (this.pagination?.parentElement === parent) frame.appendChild(this.pagination);
      return frame;
    }

    requestPage(page) {
      if (this.loading) return;
      const targetPage = Math.min(Math.max(1, Number(page) || 1), this.totalPages);
      if (typeof this.onPageChange === 'function') {
        this.onPageChange(targetPage);
      } else {
        this.setPage(targetPage);
        this.page = targetPage;
        this.renderControls();
      }
    }

    renderControls() {
      const page = Math.min(Math.max(1, Number(this.getPage()) || 1), this.totalPages);
      this.setPage(page);
      this.page = page;
      // Toate gridurile păstrează același control, inclusiv pe o singură pagină.
      if (this.pagination) this.pagination.hidden = false;
      if (this.firstButton) this.firstButton.disabled = this.loading || page <= 1;
      if (this.previousButton) this.previousButton.disabled = this.loading || page <= 1;
      if (this.nextButton) this.nextButton.disabled = this.loading || page >= this.totalPages;
      if (this.lastButton) this.lastButton.disabled = this.loading || page >= this.totalPages;
      if (this.currentValue) this.currentValue.textContent = String(page);
      if (this.totalValue) this.totalValue.textContent = String(this.totalPages);
      if (this.pageStatus) this.pageStatus.setAttribute('aria-label', `Pagina ${page} din ${this.totalPages}`);
    }

    updateControls(totalRows = this.totalRows, loading = this.loading) {
      this.totalRows = Math.max(0, Number(totalRows) || 0);
      this.loading = loading;
      this.totalPages = Math.max(1, Math.ceil(this.totalRows / this.pageSize));
      this.renderControls();
      return this.totalPages;
    }

    update(rows, { matchedRows = rows, totalRows = matchedRows.length, serverPaged = false, loading = this.loading } = {}) {
      this.totalRows = Math.max(0, Number(totalRows) || 0);
      this.totalPages = Math.max(1, Math.ceil(this.totalRows / this.pageSize));
      this.loading = loading;
      const page = Math.min(Math.max(1, Number(this.getPage()) || 1), this.totalPages);
      this.setPage(page);
      this.page = page;
      const matchedSet = new Set(matchedRows);
      const firstVisible = serverPaged ? 0 : (page - 1) * this.pageSize;
      const lastVisible = firstVisible + this.pageSize;
      rows.forEach((row) => {
        const matchIndex = matchedRows.indexOf(row);
        row.hidden = !matchedSet.has(row) || (!serverPaged && (matchIndex < firstVisible || matchIndex >= lastVisible));
      });
      this.renderControls();
      const visibleCount = serverPaged ? matchedRows.length : Math.max(0, Math.min(this.pageSize, matchedRows.length - firstVisible));
      return {
        page,
        totalPages: this.totalPages,
        visibleStart: matchedRows.length ? (serverPaged ? ((page - 1) * this.pageSize) + 1 : firstVisible + 1) : 0,
        visibleEnd: matchedRows.length ? (serverPaged ? ((page - 1) * this.pageSize) + visibleCount : firstVisible + visibleCount) : 0
      };
    }
  }

  const languageGrid = new ReferenceGrid({
    table,
    tbody,
    status: statusBar,
    pagination,
    firstButton: firstPageButton,
    previousButton: previousPageButton,
    nextButton: nextPageButton,
    lastButton: lastPageButton,
    pageStatus,
    currentValue: currentPageValue,
    totalValue: totalPagesValue,
    pageSize,
    getPage: () => currentPage,
    setPage: (page) => { currentPage = page; }
  });
  const ethnicityGrid = new ReferenceGrid({
    table: ethnicityTable,
    tbody: ethnicityTbody,
    status: ethnicityStatus,
    pagination: ethnicityPagination,
    firstButton: ethnicityFirstPageButton,
    previousButton: ethnicityPreviousPageButton,
    nextButton: ethnicityNextPageButton,
    lastButton: ethnicityLastPageButton,
    pageStatus: ethnicityPageStatus,
    currentValue: ethnicityCurrentPageValue,
    totalValue: ethnicityTotalPagesValue,
    pageSize,
    getPage: () => ethnicityCurrentPage,
    setPage: (page) => { ethnicityCurrentPage = page; }
  });
  const unverifiedGrid = new ReferenceGrid({
    table: unverifiedTable,
    tbody: unverifiedTbody,
    status: unverifiedStatus,
    pagination: unverifiedPagination,
    firstButton: unverifiedFirstPageButton,
    previousButton: unverifiedPreviousPageButton,
    nextButton: unverifiedNextPageButton,
    lastButton: unverifiedLastPageButton,
    pageStatus: unverifiedPageStatus,
    currentValue: unverifiedCurrentPageValue,
    totalValue: unverifiedTotalPagesValue,
    pageSize,
    getPage: () => unverifiedCurrentPage,
    setPage: (page) => { unverifiedCurrentPage = page; }
  });

