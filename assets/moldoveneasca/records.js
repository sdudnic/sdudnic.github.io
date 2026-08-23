  const recordFromStaticRow = (row) => {
    const secondCell = extractCellText(row.cells[1]);
    const legacyCentury = row.cells.length >= 7
      || (row.cells.length === 6 && /^[IVXLCDM]+(?:\s*[–—-]\s*[IVXLCDM]+)?$/i.test(secondCell));
    const structured = legacyCentury ? row.cells.length >= 7 : row.cells.length >= 6;
    const offset = legacyCentury ? 1 : 0;
    const sourceIndex = structured ? 5 + offset : 1;
    const yearLabel = row.cells[0]?.textContent.trim() || '';
    const sourceCell = row.cells[sourceIndex];
    const sourceText = extractCellText(structured ? row : row.cells[1]);
    const urls = [...(sourceCell?.querySelectorAll('a[href]') || [])].map((link) => link.href);
    const title = structured
      ? extractCellText(row.cells[1 + offset])
      : (extractTitle(sourceText) || sourceText);
    const quote = structured
      ? cleanQuote(extractCellText(row.cells[2 + offset]))
      : extractQuote(sourceText);
    const [yearStartBound, yearEnd] = yearBoundsFromLabel(yearLabel);
    const yearStart = sortYearFromValues(yearLabel) || yearStartBound;
    return {
      year_label: yearLabel,
      year_start: yearStart,
      year_end: yearEnd,
      title,
      quote: quote || null,
      language: structured ? (extractCellText(row.cells[3 + offset]) || null) : null,
      author: structured ? (extractCellText(row.cells[4 + offset]) || 'necunoscut') : extractAuthor(sourceText),
      source_url: urls[0] || null,
      source_urls: urls,
      source_type: structured ? 'Tabel static structurat' : 'Import din tabelul existent',
      location: null,
      description: structured ? null : sourceText,
      image_url: null,
      status: 'published',
      owner_id: null
    };
  };

  const recordFromEthnicityStaticRow = (row) => {
    const secondCell = extractCellText(row.cells[1]);
    const legacyCentury = row.cells.length >= 7
      || (row.cells.length === 6 && /^[IVXLCDM]+(?:\s*[–—-]\s*[IVXLCDM]+)?$/i.test(secondCell));
    const structured = legacyCentury ? row.cells.length >= 7 : row.cells.length >= 5;
    const offset = legacyCentury ? 1 : 0;
    const titleIndex = 1 + offset;
    const quoteIndex = 2 + offset;
    const languageIndex = 3 + offset;
    const authorIndex = row.cells.length >= 6 + offset ? 4 + offset : -1;
    const sourceIndex = structured ? row.cells.length - 1 : 5;
    const sourceCell = row.cells[sourceIndex];
    const sourceUrlsFromRow = [...(sourceCell?.querySelectorAll('a[href]') || [])].map((link) => link.href);
    const yearLabel = row.cells[0]?.textContent.trim() || '';
    const [yearStartBound, yearEnd] = yearBoundsFromLabel(yearLabel);
    const yearStart = sortYearFromValues(yearLabel) || yearStartBound;
    return {
      year_label: yearLabel,
      year_start: yearStart,
      year_end: yearEnd,
      title: structured ? extractCellText(row.cells[titleIndex]) : extractCellText(row.cells[2]),
      quote: structured ? cleanQuote(extractCellText(row.cells[quoteIndex])) : cleanQuote(extractCellText(row.cells[3])),
      language: structured ? (extractCellText(row.cells[languageIndex]) || null) : null,
      author: structured && authorIndex >= 0 ? (extractCellText(row.cells[authorIndex]) || 'necunoscut') : 'necunoscut',
      source_url: sourceUrlsFromRow[0] || null,
      source_urls: sourceUrlsFromRow,
      source_type: structured ? 'Tabel static structurat' : 'Import din tabelul existent',
      location: null,
      description: structured ? null : [
        extractCellText(row.cells[titleIndex]),
        extractCellText(row.cells[quoteIndex])
      ].filter(Boolean).join(' — '),
      image_url: null,
      catalog_type: 'ethnicity',
      status: 'published',
      owner_id: null
    };
  };

  const displayFields = (record) => {
    const raw = record?.title || '';
    const imported = record?.source_type === 'Import din tabelul existent';
    const title = imported ? (extractTitle(raw) || '—') : (raw || '—');
    const directQuote = cleanQuote(record?.quote);
    const quote = imported
      ? (extractQuote(record?.quote) || extractQuote(raw) || directQuote || null)
      : (directQuote || null);
    const language = citationLanguageCode(record);
    const year = publicationYearLabel(record);
    const century = centuryLabel(record);
    const languageFull = languageTooltip(language, language) || 'necunoscută';
    const yearDisplay = year !== '—'
      ? year
      : century !== '—' ? `sec. ${century}` : '—';
    const yearDetail = year !== '—' && century !== '—'
      ? `${year} - sec. ${century}`
      : yearDisplay;
    return {
      year,
      yearDisplay,
      yearDetail,
      century,
      title,
      quote,
      language,
      languageFull,
      languageDetail: [languageFull, language].filter(Boolean).join(' - '),
      author: record?.author || (imported ? extractAuthor(raw) : null) || '—'
    };
  };

  const recordCatalogType = (record) => catalogTypeValues.has(record?.catalog_type)
    ? record.catalog_type
    : 'language';

  const catalogIncludes = (record, catalog) => {
    const type = recordCatalogType(record);
    return type === catalog || type === 'both';
  };

  const removeImportedQuote = (value, quote) => {
    let text = cleanImportedText(value);
    if (!text || !quote) return text;
    const variants = [
      `«${quote}»`,
      `“${quote}”`,
      `„${quote}”`,
      `"${quote}"`,
      `'${quote}'`,
      quote
    ];
    const variant = variants.find((candidate) => text.includes(candidate));
    if (variant) text = text.replace(variant, ' ');
    return text
      .replace(/\s*\(\s*sursa(?:\s+suplimentară)?\s*\d*\s*\)\s*/gi, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^\s*[,;:–—-]\s*/, '')
      .replace(/\s*[,;:–—-]\s*$/, '')
      .trim();
  };

  const recordComments = (record) => {
    const comments = [];
    const description = cleanImportedText(record?.description);
    const raw = cleanImportedText(record?.title);
    const imported = record?.source_type === 'Import din tabelul existent';
    if (description && (!imported || description !== raw)) comments.push(description);
    if (imported && raw) {
      const residual = removeImportedQuote(raw, extractQuote(record?.quote) || extractQuote(raw));
      if (residual && !comments.includes(residual)) comments.push(residual);
    }
    return comments.join('\n\n') || null;
  };

