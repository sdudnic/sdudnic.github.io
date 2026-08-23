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

  const imageMaxEdge = 1600;
  const imageJpegQuality = 0.82;
  let imageSourceDataUrl = '';
  let imageHasExternalRed = false;
  let imageStrokes = [];
  let activeImageStroke = null;

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
      resolve({
        dataUrl: canvas.toDataURL('image/jpeg', imageJpegQuality),
        width,
        height,
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
        : 'Trasează cu mouse-ul sau degetul o linie roșie sub glotonim; anul și marca discretă dudnic.com se adaugă automat.';
    }
    if (imageUndoButton) imageUndoButton.hidden = imageHasExternalRed;
    if (imageClearButton) imageClearButton.hidden = imageHasExternalRed;
    imageInput.value = imageCanvas.toDataURL('image/jpeg', 0.88);
    renderImagePreview();
  };

  const resetImageMarkup = () => {
    imageSourceDataUrl = '';
    imageHasExternalRed = false;
    imageStrokes = [];
    activeImageStroke = null;
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
      if (imageMarkup) imageMarkup.hidden = false;
      await paintImageMarkup();
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

