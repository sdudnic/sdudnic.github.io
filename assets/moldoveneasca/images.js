  const loadRecordImage = async (record) => {
    if (!record) return record;
    const id = String(record.id || '');
    if (Object.prototype.hasOwnProperty.call(record, 'image_url')) {
      if (id) recordImageCache.set(id, record.image_url || null);
      return record;
    }
    if (id && recordImageCache.has(id)) {
      record.image_url = recordImageCache.get(id);
      return record;
    }
    if (!id || !supabaseClient) return record;
    const { data, error } = await supabaseClient
      .from('language_references')
      .select('image_url')
      .eq('id', id)
      .maybeSingle();
    if (!error) {
      record.image_url = data?.image_url || null;
      recordImageCache.set(id, record.image_url);
    }
    return record;
  };

  // 2400 px păstrează detaliile unei pagini scanate la afișare și la zoom;
  // aproximativ 1,5 MB este limita pentru o imagine data URL stocată în BD.
  const imageMaxEdge = 2400;
  const imageMaxBytes = 1_500_000;
  const imageMaxDataUrlChars = 2_100_000;
  const imageJpegQualities = [0.84, 0.78, 0.72, 0.68, 0.64];
  const imageScaleFactors = [1, 0.9, 0.8, 0.7, 0.6, 0.5];
  let imageSourceDataUrl = '';
  let imageHasExternalRed = false;
  let imageStrokes = [];
  let activeImageStroke = null;
  let imageAutoAnnotated = false;
  let imageOcrRunning = false;
  let imageOcrScriptPromise = null;
  const imageOcrWorkers = new Map();
  const imageOcrScriptUrl = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

  const normalizeOcrToken = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');

  const ocrLanguageForField = (value, quoteValue = '') => {
    const raw = `${String(value || '')} ${String(quoteValue || '')}`;
    const normalized = normalizeOcrToken(raw);
    if (/\b(?:fr|fra|francais|franceza)\b/i.test(raw) || normalized.includes('francez') || normalized.includes('langue')) return 'fra';
    if (/\b(?:de|deu|german|germana)\b/i.test(raw) || normalized.includes('german') || normalized.includes('sprache')) return 'deu';
    if (/\b(?:ru|rus|rusa|russo)\b/i.test(raw) || normalized.includes('rus')) return 'rus';
    if (/\b(?:ro|ron|romana|moldoveneasca)\b/i.test(raw) || normalized.includes('roman') || normalized.includes('moldoven')) return 'ron';
    if (/\b(?:pl|pol|polona)\b/i.test(raw) || normalized.includes('polon') || normalized.includes('jezyk')) return 'pol';
    if (/\b(?:uk|ukr|ucraineana)\b/i.test(raw) || normalized.includes('ucraine')) return 'ukr';
    if (/\b(?:tr|tur|turca)\b/i.test(raw) || normalized.includes('turc')) return 'tur';
    if (/\b(?:bg|bul|bulgara)\b/i.test(raw) || normalized.includes('bulgar')) return 'bul';
    if (/\b(?:it|ita|italiana)\b/i.test(raw) || normalized.includes('ital') || normalized.includes('lingua')) return 'ita';
    if (/\b(?:la|lat|latina)\b/i.test(raw) || normalized.includes('latin')) return 'lat';
    return 'eng';
  };

  const ocrTargetFromQuote = (value) => {
    const quote = String(value || '').trim();
    const match = quote.match(/(?:moldoveneasc\p{L}*|moldav\p{L}*|moldau\p{L}*|moldovan\p{L}*|moldaw\p{L}*|молдав\p{L}*|молдов\p{L}*|молдовськ\p{L}*)/iu);
    return match?.[0] || quote;
  };

  const loadImageOcrLibrary = () => {
    if (window.Tesseract?.createWorker) return Promise.resolve(window.Tesseract);
    if (imageOcrScriptPromise) return imageOcrScriptPromise;
    imageOcrScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = imageOcrScriptUrl;
      script.async = true;
      script.onload = () => window.Tesseract?.createWorker
        ? resolve(window.Tesseract)
        : reject(new Error('Motorul OCR nu a putut fi inițializat.'));
      script.onerror = () => reject(new Error('Motorul OCR nu a putut fi încărcat.'));
      document.head.appendChild(script);
    });
    return imageOcrScriptPromise;
  };

  const getImageOcrWorker = async (language) => {
    if (imageOcrWorkers.has(language)) return imageOcrWorkers.get(language);
    const tesseract = await loadImageOcrLibrary();
    const worker = await tesseract.createWorker(language, 1);
    imageOcrWorkers.set(language, worker);
    return worker;
  };

  const ocrWordsForTarget = (words, target) => {
    const targetTokens = String(target || '').split(/\s+/).map(normalizeOcrToken).filter(Boolean);
    if (!targetTokens.length) return [];
    const candidates = (Array.isArray(words) ? words : [])
      .map((word) => ({
        text: String(word?.text || '').trim(),
        token: normalizeOcrToken(word?.text),
        confidence: Number(word?.confidence ?? word?.conf ?? 0),
        bbox: word?.bbox || null
      }))
      .filter((word) => word.token && word.bbox && word.confidence >= 45);
    const matches = [];
    for (let index = 0; index <= candidates.length - targetTokens.length; index += 1) {
      const slice = candidates.slice(index, index + targetTokens.length);
      if (slice.length !== targetTokens.length || slice.some((word, offset) => word.token !== targetTokens[offset])) continue;
      matches.push(slice);
    }
    return matches;
  };

  const imageOcrButtonState = () => {
    if (!imageAutoUnderlineButton) return;
    imageAutoUnderlineButton.disabled = imageOcrRunning || !imageSourceDataUrl || imageHasExternalRed;
    imageAutoUnderlineButton.textContent = imageOcrRunning ? 'Se analizează captura…' : 'Subliniază automat din OCR';
  };

  const detectRedAnnotations = (context, width, height) => {
    const pixels = context.getImageData(0, 0, width, height).data;
    let redPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      if (red >= 150 && red > green * 1.45 && red > blue * 1.45 && green <= 140) redPixels += 1;
    }
    return redPixels >= Math.max(24, width * height * 0.00015);
  };

  const readImageFile = (file) => new Promise((resolve, reject) => {
    if (!file || !String(file.type || '').startsWith('image/')) {
      reject(new Error('Alege o imagine.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Imaginea nu a putut fi citită.'));
    reader.readAsDataURL(file);
  });

  const imageDataUrlPattern = /^data:image\/(avif|gif|jpeg|jpg|png|webp);base64,([a-z0-9+/=]+)$/i;

  const imageDataUrlBytes = (value) => {
    const match = String(value || '').replace(/\s+/g, '').match(imageDataUrlPattern);
    if (!match) return 0;
    const padding = match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor(match[2].length * 3 / 4) - padding);
  };

  const imageValueWithinLimit = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized || /^https:\/\//i.test(normalized)) return true;
    if (!imageDataUrlPattern.test(normalized.replace(/\s+/g, ''))) return true;
    return normalized.length <= imageMaxDataUrlChars && imageDataUrlBytes(normalized) <= imageMaxBytes;
  };

  const encodeCanvasWithinLimit = (sourceCanvas, width, height) => {
    const sourceWidth = Math.max(1, Number(width) || sourceCanvas.width || 1);
    const sourceHeight = Math.max(1, Number(height) || sourceCanvas.height || 1);
    const baseScale = Math.min(1, imageMaxEdge / Math.max(sourceWidth, sourceHeight));
    let last = null;

    for (const scaleFactor of imageScaleFactors) {
      const outputWidth = Math.max(1, Math.round(sourceWidth * baseScale * scaleFactor));
      const outputHeight = Math.max(1, Math.round(sourceHeight * baseScale * scaleFactor));
      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Browserul nu poate pregăti imaginea.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, outputWidth, outputHeight);
      context.drawImage(sourceCanvas, 0, 0, outputWidth, outputHeight);

      for (const quality of imageJpegQualities) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        last = { dataUrl, width: outputWidth, height: outputHeight, bytes: imageDataUrlBytes(dataUrl) };
        if (last.bytes <= imageMaxBytes && dataUrl.length <= imageMaxDataUrlChars) return last;
      }
    }

    if (last) return last;
    throw new Error('Imaginea nu a putut fi compactată.');
  };

  const resizeImageData = (dataUrl) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const longestEdge = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height);
      const scale = longestEdge > imageMaxEdge ? imageMaxEdge / longestEdge : 1;
      const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
      const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) {
        reject(new Error('Browserul nu poate pregăti imaginea.'));
        return;
      }
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      const encoded = encodeCanvasWithinLimit(canvas, width, height);
      resolve({
        dataUrl: encoded.dataUrl,
        width: encoded.width,
        height: encoded.height,
        bytes: encoded.bytes,
        originalWidth: image.naturalWidth || image.width,
        originalHeight: image.naturalHeight || image.height,
        hasRedAnnotations: detectRedAnnotations(context, width, height)
      });
    };
    image.onerror = () => reject(new Error('Imaginea nu a putut fi pregătită.'));
    image.src = dataUrl;
  });

  const loadImageData = (dataUrl) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Imaginea nu a putut fi pregătită.'));
    image.src = dataUrl;
  });

  const drawRedStroke = (context, points, width) => {
    if (!points?.length) return;
    context.save();
    context.strokeStyle = '#c62828';
    context.fillStyle = '#c62828';
    context.lineWidth = Math.max(3, Math.round(width / 250));
    context.lineCap = 'round';
    context.lineJoin = 'round';
    if (points.length === 1) {
      context.beginPath();
      context.arc(points[0].x, points[0].y, context.lineWidth / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      context.stroke();
    }
    context.restore();
  };

  const drawRedStrokeSegment = (context, from, to, width) => {
    if (!from || !to) return;
    context.save();
    context.strokeStyle = '#c62828';
    context.lineWidth = Math.max(3, Math.round(width / 250));
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.restore();
  };

  const paintImageMarkup = async () => {
    if (!imageCanvas || !imageSourceDataUrl) return;
    const image = await loadImageData(imageSourceDataUrl);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    imageCanvas.width = width;
    imageCanvas.height = height;
    const context = imageCanvas.getContext('2d', { alpha: false });
    if (!context) return;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    if (!imageHasExternalRed) {
      const year = String(yearInput?.value || '').trim();
      const yearSize = Math.max(24, Math.round(width * 0.035));
      if (year) {
        context.font = `700 ${yearSize}px sans-serif`;
        const yearWidth = context.measureText(year).width;
        context.fillStyle = 'rgba(255, 255, 255, 0.76)';
        context.fillRect(12, 12, yearWidth + 20, yearSize + 18);
        context.fillStyle = '#c62828';
        context.fillText(year, 22, yearSize + 18);
      }
      const watermarkSize = Math.max(12, Math.round(width * 0.012));
      const watermark = 'dudnic.com/moldoveneasca';
      context.font = `400 ${watermarkSize}px sans-serif`;
      const watermarkWidth = context.measureText(watermark).width;
      context.fillStyle = 'rgba(255, 255, 255, 0.68)';
      context.fillRect(width - watermarkWidth - 18, height - watermarkSize - 14, watermarkWidth + 12, watermarkSize + 8);
      context.fillStyle = 'rgba(70, 70, 70, 0.72)';
      context.fillText(watermark, width - watermarkWidth - 12, height - 10);
      imageStrokes.forEach((stroke) => drawRedStroke(context, stroke, width));
    }

    if (imageMarkupStatus) {
      imageMarkupStatus.textContent = imageHasExternalRed
        ? 'Scanul are deja adnotări roșii; îl păstrăm exact așa și nu adăugăm marcaje dudnic.com.'
        : imageAutoAnnotated
          ? 'Sublinierea a fost generată automat din OCR; verifică faptul că linia este sub glotonimul corect înainte de publicare.'
          : 'Trasează cu mouse-ul sau degetul o linie roșie sub glotonim; anul și marca discretă dudnic.com se adaugă automat.';
    }
    if (imageUndoButton) imageUndoButton.hidden = imageHasExternalRed;
    if (imageClearButton) imageClearButton.hidden = imageHasExternalRed;
    const encoded = encodeCanvasWithinLimit(imageCanvas, width, height);
    imageInput.value = encoded.dataUrl;
    renderImagePreview();
  };

  const autoUnderlineImage = async () => {
    if (!imageSourceDataUrl) {
      if (imageOcrStatus) imageOcrStatus.textContent = 'Încarcă mai întâi captura locală a paginii.';
      return;
    }
    if (imageHasExternalRed) {
      if (imageOcrStatus) imageOcrStatus.textContent = 'Imaginea are deja marcaje roșii; nu o modific automat.';
      return;
    }
    const target = ocrTargetFromQuote(quoteField?.value);
    if (!target) {
      if (imageOcrStatus) imageOcrStatus.textContent = 'Completează citatul înainte de analiza OCR.';
      return;
    }

    imageOcrRunning = true;
    imageOcrButtonState();
    if (imageOcrStatus) imageOcrStatus.textContent = 'Se încarcă motorul OCR; prima analiză poate dura puțin…';
    try {
      const language = ocrLanguageForField(languageField?.value, quoteField?.value);
      const worker = await getImageOcrWorker(language);
      if (imageOcrStatus) imageOcrStatus.textContent = `Se caută exact „${target}” în captura ${language}…`;
      const result = await worker.recognize(imageSourceDataUrl);
      const matches = ocrWordsForTarget(result?.data?.words, target);
      if (matches.length !== 1) {
        imageAutoAnnotated = false;
        if (imageOcrStatus) imageOcrStatus.textContent = matches.length
          ? `OCR-ul a găsit ${matches.length} apariții pentru „${target}”. Pentru a evita o dovadă ambiguă, subliniază manual apariția din citat.`
          : `OCR-ul nu a găsit exact „${target}”. Verifică limba, rezoluția și subliniază manual.`;
        return;
      }

      imageStrokes = matches[0].map((word) => {
        const box = word.bbox;
        const x0 = Number(box.x0 ?? box.left ?? 0);
        const x1 = Number(box.x1 ?? (box.left ?? 0) + (box.width ?? 0));
        const y1 = Number(box.y1 ?? (box.top ?? 0) + (box.height ?? 0));
        const offset = Math.max(3, Math.round((y1 - Number(box.y0 ?? box.top ?? 0)) * 0.16));
        return [{ x: x0, y: y1 + offset }, { x: x1, y: y1 + offset }];
      });
      imageAutoAnnotated = true;
      await paintImageMarkup();
      if (imageOcrStatus) imageOcrStatus.textContent = `Am găsit exact „${target}” și am generat sublinierea. Verifică imaginea înainte de publicare.`;
    } catch (error) {
      if (imageOcrStatus) imageOcrStatus.textContent = error.message || 'Analiza OCR nu a reușit; subliniază manual.';
    } finally {
      imageOcrRunning = false;
      imageOcrButtonState();
    }
  };

  const resetImageMarkup = () => {
    imageSourceDataUrl = '';
    imageHasExternalRed = false;
    imageStrokes = [];
    activeImageStroke = null;
    imageAutoAnnotated = false;
    imageOcrRunning = false;
    if (imageOcrStatus) imageOcrStatus.textContent = '';
    imageOcrButtonState();
    if (imageMarkup) imageMarkup.hidden = true;
    if (imageCanvas) {
      const context = imageCanvas.getContext('2d');
      context?.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
    }
  };

  const renderImagePreview = () => {
    if (!imagePreview || !imageInput) return;
    const value = String(imageInput.value || '').trim();
    const url = imageUrl({ image_url: value });
    imagePreview.replaceChildren();
    if (!url) {
      imagePreview.hidden = true;
      return;
    }
    const preview = document.createElement('img');
    preview.src = url;
    preview.alt = 'Previzualizarea paginii cu citatul';
    preview.loading = 'lazy';
    imagePreview.appendChild(preview);
    imagePreview.hidden = false;
  };

  const setImageFromFile = async (file) => {
    if (!imageInput || !file) return;
    try {
      if (imageHint) imageHint.textContent = 'Se pregătește captura…';
      const source = await readImageFile(file);
      const prepared = await resizeImageData(source);
      imageSourceDataUrl = prepared.dataUrl;
      imageHasExternalRed = prepared.hasRedAnnotations;
      imageStrokes = [];
      imageAutoAnnotated = false;
      if (imageOcrStatus) imageOcrStatus.textContent = '';
      if (imageMarkup) imageMarkup.hidden = false;
      await paintImageMarkup();
      imageOcrButtonState();
      if (imageHint) {
        const resized = prepared.width !== prepared.originalWidth || prepared.height !== prepared.originalHeight;
        const compacted = resized ? ' Imaginea mare a fost compactată automat.' : '';
        imageHint.textContent = imageHasExternalRed
          ? `Captură pregătită (${prepared.width}×${prepared.height}px). Au fost păstrate marcajele roșii existente; nu se adaugă altele.`
          : `Captură pregătită (${prepared.width}×${prepared.height}px).${compacted}`;
      }
    } catch (error) {
      if (imageHint) imageHint.textContent = error.message || 'Imaginea nu a putut fi pregătită.';
    } finally {
      if (imageFileInput) imageFileInput.value = '';
    }
  };

