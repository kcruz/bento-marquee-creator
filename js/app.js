(() => {
  let currentStep = 1;
  let selectedTemplate = null;
  let compressedImages = [];
  let loopMultiplier = 1;
  let selectedConfigRow = 0;
  let activeConfigTab = 'general';

  const compressor = new ImageCompressor();
  const previewCanvas = document.getElementById('preview-canvas');
  const exportCanvas = document.getElementById('export-preview-canvas');
  const renderer = new MarqueeRenderer(previewCanvas);
  const exportRenderer = new MarqueeRenderer(exportCanvas);
  const exporter = new Exporter(exportRenderer);

  let exportFormat = 'gif';
  let exportQuality = 'mid';

  function init() {
    renderTemplates();
    bindNavigation();
    bindRowCount();
    bindConfig();
    bindExport();
    goToStep(1);
  }

  // --- Step Navigation ---
  function goToStep(step) {
    if (step < 1 || step > 3) return;
    currentStep = step;
    document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`step-${step}`).classList.add('active');

    document.querySelectorAll('.step-dot').forEach(d => {
      const s = parseInt(d.dataset.step);
      d.classList.remove('active', 'completed');
      if (s === step) d.classList.add('active');
      else if (s < step) d.classList.add('completed');
    });

    if (step === 2) startPreview();
    if (step === 3) startExportPreview();
  }

  function bindNavigation() {
    document.querySelectorAll('.step-dot').forEach(d => {
      d.addEventListener('click', () => {
        const step = parseInt(d.dataset.step);
        if (step <= currentStep || canGoToStep(step)) goToStep(step);
      });
    });

    document.getElementById('btn-to-preview').addEventListener('click', () => goToStep(2));
    document.getElementById('btn-to-export').addEventListener('click', () => goToStep(3));
    document.getElementById('btn-back-to-upload').addEventListener('click', () => goToStep(1));
    document.getElementById('btn-back-to-preview').addEventListener('click', () => goToStep(2));
  }

  function canGoToStep(step) {
    if (step >= 2 && (!selectedTemplate || compressedImages.flat().length < 1)) return false;
    return true;
  }

  // --- Templates ---
  function renderTemplates() {
    const grid = document.getElementById('template-grid');
    grid.innerHTML = '';

    TEMPLATES.forEach(tpl => {
      const card = document.createElement('div');
      card.className = 'template-card';
      card.dataset.id = tpl.id;

      const previewDiv = document.createElement('div');
      previewDiv.className = 'template-preview';
      const miniCanvas = document.createElement('canvas');
      miniCanvas.width = 320;
      miniCanvas.height = 180;
      previewDiv.appendChild(miniCanvas);

      card.appendChild(previewDiv);

      const info = document.createElement('div');
      info.innerHTML = `
        <div class="template-name">${tpl.name}</div>
        <div class="template-desc">${tpl.description}</div>
        <div class="template-tags">
          ${tpl.tags.map(t => `<span class="template-tag">${t}</span>`).join('')}
        </div>
      `;
      card.appendChild(info);

      card.addEventListener('click', () => selectTemplate(tpl, card));
      grid.appendChild(card);

      animateTemplatePreview(miniCanvas, tpl);
    });
  }

  function animateTemplatePreview(canvas, template) {
    const ctx = canvas.getContext('2d');
    const placeholders1D = createPlaceholderImages(6);
    const placeholders2D = [
      placeholders1D.slice(0, 2),
      placeholders1D.slice(2, 4),
      placeholders1D.slice(4, 6),
      placeholders1D.slice(0, 2),
      placeholders1D.slice(2, 4)
    ];
    
    const config = {
      bgColor: '#0a0a0a',
      borderRadius: 8,
      borderWidth: 0,
      borderColor: '#333',
      speed: template.speed,
      direction: 'default',
      perspective: template.perspective,
      gap: 10,
      margin: 24,
      visibleCount: 3,
      imageScale: Array.from({ length: template.defaultRowCount || 3 }, () => 50),
      rowCount: template.defaultRowCount,
      rowTypes: ['desktop', 'desktop', 'desktop']
    };
    const start = performance.now() / 1000;

    function draw() {
      const t = performance.now() / 1000 - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = config.bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      template.render(ctx, placeholders2D, config, t);
      requestAnimationFrame(draw);
    }
    draw();
  }

  function createPlaceholderImages(count) {
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#22d3ee'];
    return colors.slice(0, count).map((color) => {
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 200;
      const ctx = c.getContext('2d');

      const grd = ctx.createLinearGradient(0, 0, c.width, c.height);
      grd.addColorStop(0, color);
      grd.addColorStop(1, shiftColor(color, 40));
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, c.width, c.height);

      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(20, 20, 120, 12);
      ctx.fillRect(20, 42, 80, 12);
      ctx.fillRect(20, 70, 200, 60);
      ctx.fillRect(20, 145, 100, 10);
      ctx.fillRect(130, 145, 60, 10);

      return c;
    });
  }

  function shiftColor(hex, amount) {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.min(255, ((num >> 16) & 0xFF) + amount);
    const g = Math.min(255, ((num >> 8) & 0xFF) + amount);
    const b = Math.min(255, (num & 0xFF) + amount);
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
  }

  function selectTemplate(tpl, card) {
    selectedTemplate = tpl;
    document.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    document.getElementById('btn-to-preview').disabled = compressedImages.flat().length < 1;

    renderer.setTemplate(tpl);
    exportRenderer.setTemplate(tpl);

    const defaultCount = tpl.defaultRowCount;
    setRowCount(defaultCount, true);

    document.getElementById('cfg-perspective').value = tpl.perspective;
    document.getElementById('cfg-perspective-val').textContent = tpl.perspective + '°';
  }

  function setRowCount(count, resetTypes = false) {
    const min = 1, max = 5;
    count = Math.max(min, Math.min(max, count));

    // Extend or trim rowTypes preserving existing values
    const existing = renderer.config.rowTypes || [];
    const newTypes = Array.from({length: count}, (_, r) =>
      resetTypes ? 'desktop' : (existing[r] || 'desktop')
    );

    // Sync arrays for Row Settings
    const syncArr = (key, defaultVal) => {
      const arr = [...(renderer.config[key] || [])];
      while (arr.length < count) {
        arr.push(typeof defaultVal === 'function' ? defaultVal(arr.length) : defaultVal);
      }
      if (arr.length > count) arr.length = count;
      return arr;
    };
    const newSpeeds = syncArr('speed', 1);
    
    const newDirs = syncArr('direction', (i) => {
      const baseDir = selectedTemplate ? selectedTemplate.direction : 'left';
      if (selectedTemplate && selectedTemplate.id === 'vertical-cascade') return baseDir;
      if (baseDir === 'left') return i % 2 === 0 ? 'left' : 'right';
      if (baseDir === 'right') return i % 2 === 0 ? 'right' : 'left';
      if (baseDir === 'up') return i % 2 === 0 ? 'up' : 'down';
      if (baseDir === 'down') return i % 2 === 0 ? 'down' : 'up';
      return 'left';
    });
    
    const newVis = syncArr('visibleCount', 4);
    const newImageScale = syncArr('imageScale', 100);

    // Sync compressedImages array length
    while (compressedImages.length < count) {
      compressedImages.push([]);
    }
    if (compressedImages.length > count) {
      compressedImages.length = count;
      updateCompressionInfo(); // recalculate
    }

    renderer.updateConfig('rowCount', count);
    renderer.updateConfig('rowTypes', newTypes);
    renderer.updateConfig('speed', newSpeeds);
    renderer.updateConfig('direction', newDirs);
    renderer.updateConfig('visibleCount', newVis);
    renderer.updateConfig('imageScale', newImageScale);
    
    exportRenderer.updateConfig('rowCount', count);
    exportRenderer.updateConfig('rowTypes', [...newTypes]);
    exportRenderer.updateConfig('speed', [...newSpeeds]);
    exportRenderer.updateConfig('direction', [...newDirs]);
    exportRenderer.updateConfig('visibleCount', [...newVis]);
    exportRenderer.updateConfig('imageScale', [...newImageScale]);

    // Build configuration tabs in Step 3
    const tabsHeader = document.getElementById('config-tabs-header');
    if (tabsHeader) {
      tabsHeader.innerHTML = '';
      
      const createTab = (label, id, isRow, index) => {
        const btn = document.createElement('button');
        btn.className = 'config-tab';
        btn.textContent = label;
        btn.dataset.id = id;
        
        btn.onclick = () => {
          tabsHeader.querySelectorAll('.config-tab').forEach(t => t.classList.remove('active'));
          btn.classList.add('active');
          
          activeConfigTab = id;
          
          document.querySelectorAll('.config-tab-pane').forEach(p => p.classList.remove('active'));
          if (isRow) {
            document.getElementById('tab-row').classList.add('active');
            selectedConfigRow = index;
            if (typeof updateRowSettingsUI === 'function') updateRowSettingsUI();
          } else {
            document.getElementById('tab-general').classList.add('active');
          }
        };
        return btn;
      };

      const isVertical = selectedTemplate?.id === 'vertical-cascade';
      tabsHeader.appendChild(createTab('General Settings', 'general', false, null));
      for (let i = 0; i < count; i++) {
        tabsHeader.appendChild(createTab(isVertical ? `Column ${i + 1}` : `Row ${i + 1}`, `row-${i}`, true, i));
      }
      
      if (selectedConfigRow >= count) {
        selectedConfigRow = Math.max(0, count - 1);
        if (activeConfigTab && activeConfigTab.startsWith('row-')) {
          activeConfigTab = `row-${selectedConfigRow}`;
        }
      }
      
      // Restore active tab
      const activeTabId = activeConfigTab || 'general';
      const tabToClick = tabsHeader.querySelector(`.config-tab[data-id="${activeTabId}"]`) || tabsHeader.firstChild;
      if (tabToClick) tabToClick.click();
    }

    const isVertical = selectedTemplate?.id === 'vertical-cascade';
    document.getElementById('row-config-label').textContent = isVertical ? 'Columns' : 'Rows';
    document.getElementById('row-count-val').textContent = count;
    document.getElementById('row-count-badge').textContent = count;
    document.getElementById('row-count-dec').disabled = count <= min;
    document.getElementById('row-count-inc').disabled = count >= max;

    buildRowTypeUI(count, newTypes);
    refreshSeamlessDuration();
  }

  function bindRowCount() {
    document.getElementById('row-count-dec').addEventListener('click', () => {
      setRowCount(renderer.config.rowCount - 1);
    });
    document.getElementById('row-count-inc').addEventListener('click', () => {
      setRowCount(renderer.config.rowCount + 1);
    });
  }

  function buildRowTypeUI(rowCount, rowTypes) {
    const container = document.getElementById('upload-row-types');
    container.innerHTML = '';
    if (rowCount === 0) return;

    const isVertical = selectedTemplate?.id === 'vertical-cascade';
    const rowLabel = r => {
      if (isVertical) return rowCount === 1 ? 'Column' : `Column ${r + 1}`;
      if (rowCount === 1) return 'Row';
      if (rowCount === 2) return r === 0 ? 'Top' : 'Bottom';
      const names = ['Top', 'Middle', 'Bottom', 'Row 4', 'Row 5'];
      return names[r] || `Row ${r + 1}`;
    };

    const list = document.createElement('div');
    list.className = 'row-type-list';

    let dragSrcIndex = null;

    const buildItem = (r, currentType) => {
      const item = document.createElement('div');
      item.className = 'row-type-item';
      item.draggable = true;
      item.dataset.index = r;

      const header = document.createElement('div');
      header.className = 'row-type-header';

      // Drag handle
      const handle = document.createElement('span');
      handle.className = 'drag-handle';
      handle.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="6" r="1.2" fill="currentColor"/><circle cx="15" cy="6" r="1.2" fill="currentColor"/><circle cx="9" cy="12" r="1.2" fill="currentColor"/><circle cx="15" cy="12" r="1.2" fill="currentColor"/><circle cx="9" cy="18" r="1.2" fill="currentColor"/><circle cx="15" cy="18" r="1.2" fill="currentColor"/></svg>';

      const label = document.createElement('span');
      label.className = 'row-type-label';
      label.textContent = rowLabel(r);

      const toggle = document.createElement('div');
      toggle.className = 'row-type-toggle';

      ['desktop', 'mobile'].forEach(type => {
        const btn = document.createElement('button');
        btn.className = 'row-type-btn' + (currentType === type ? ' active' : '');
        btn.dataset.type = type;
        btn.innerHTML = type === 'desktop'
          ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 20h8M12 18v2"/></svg> Desktop'
          : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="7" y="2" width="10" height="20" rx="2"/><circle cx="12" cy="18" r="1" fill="currentColor"/></svg> Mobile';
        btn.addEventListener('click', () => {
          toggle.querySelectorAll('.row-type-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const types = [...renderer.config.rowTypes];
          types[parseInt(item.dataset.index)] = type;
          renderer.updateConfig('rowTypes', types);
          exportRenderer.updateConfig('rowTypes', [...types]);
          refreshSeamlessDuration();
        });
        toggle.appendChild(btn);
      });

      header.appendChild(handle);
      header.appendChild(label);
      header.appendChild(toggle);
      item.appendChild(header);

      // Upload area
      const uploadArea = document.createElement('div');
      uploadArea.className = 'row-upload-area';
      uploadArea.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <p>Drop screenshots for ${rowLabel(r)}</p>
      `;
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.multiple = true;
      fileInput.accept = 'image/*';
      fileInput.hidden = true;
      uploadArea.appendChild(fileInput);
      item.appendChild(uploadArea);

      // Upload Preview
      const previewArea = document.createElement('div');
      previewArea.className = 'row-upload-preview';
      previewArea.id = `row-preview-${r}`;
      item.appendChild(previewArea);

      // Upload bindings
      uploadArea.addEventListener('click', () => fileInput.click());
      uploadArea.addEventListener('dragover', e => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
      });
      uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
      uploadArea.addEventListener('drop', e => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleFiles(e.dataTransfer.files, parseInt(item.dataset.index));
      });
      fileInput.addEventListener('change', () => {
        handleFiles(fileInput.files, parseInt(item.dataset.index));
        fileInput.value = '';
      });

      // Drag events for row reordering
      item.addEventListener('dragstart', e => {
        dragSrcIndex = parseInt(item.dataset.index);
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        list.querySelectorAll('.row-type-item').forEach(el => el.classList.remove('drag-over'));
      });

      item.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        list.querySelectorAll('.row-type-item').forEach(el => el.classList.remove('drag-over'));
        if (parseInt(item.dataset.index) !== dragSrcIndex) {
          item.classList.add('drag-over');
        }
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });

      item.addEventListener('drop', e => {
        e.preventDefault();
        const destIndex = parseInt(item.dataset.index);
        if (dragSrcIndex === null || dragSrcIndex === destIndex) return;

        const types = [...renderer.config.rowTypes];
        const [movedType] = types.splice(dragSrcIndex, 1);
        types.splice(destIndex, 0, movedType);

        // Also swap images!
        const [movedImages] = compressedImages.splice(dragSrcIndex, 1);
        compressedImages.splice(destIndex, 0, movedImages);

        renderer.updateConfig('rowTypes', types);
        exportRenderer.updateConfig('rowTypes', [...types]);
        
        renderer.setImages(compressedImages);
        exportRenderer.setImages(compressedImages);
        
        refreshSeamlessDuration();
        buildRowTypeUI(rowCount, types);
      });

      return item;
    };

    for (let r = 0; r < rowCount; r++) {
      list.appendChild(buildItem(r, (rowTypes || [])[r] || 'desktop'));
    }

    container.appendChild(list);
    
    // Update all previews
    for (let r = 0; r < rowCount; r++) {
      updateUploadPreview(r);
    }
  }

  async function handleFiles(fileList, rowIdx) {
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;

    if (!compressedImages[rowIdx]) compressedImages[rowIdx] = [];

    const maxImages = 20;
    const remaining = maxImages - compressedImages[rowIdx].length;
    const toProcess = files.slice(0, remaining);

    for (const file of toProcess) {
      try {
        const result = await compressor.compress(file);
        const img = result.image;
        img._originalSize = result.originalSize;
        img._compressedSize = result.compressedSize;
        compressedImages[rowIdx].push(img);
      } catch (err) {
        console.warn('Failed to compress image:', err);
      }
    }

    updateUploadPreview(rowIdx);
    updateCompressionInfo();

    renderer.setImages(compressedImages);
    exportRenderer.setImages(compressedImages);

    document.getElementById('btn-to-preview').disabled = !selectedTemplate || compressedImages.flat().length < 1;
    refreshSeamlessDuration();
  }

  function updateUploadPreview(rowIdx) {
    const container = document.getElementById(`row-preview-${rowIdx}`);
    if (!container) return;
    container.innerHTML = '';

    const rowImages = compressedImages[rowIdx] || [];
    rowImages.forEach((img, i) => {
      const thumb = document.createElement('div');
      thumb.className = 'upload-thumb';

      const imgEl = document.createElement('img');
      imgEl.src = imageToDataURL(img);
      thumb.appendChild(imgEl);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', e => {
        e.stopPropagation();
        compressedImages[rowIdx].splice(i, 1);
        updateUploadPreview(rowIdx);
        updateCompressionInfo();
        renderer.setImages(compressedImages);
        exportRenderer.setImages(compressedImages);
        document.getElementById('btn-to-preview').disabled = !selectedTemplate || compressedImages.flat().length < 1;
        refreshSeamlessDuration();
      });
      thumb.appendChild(removeBtn);
      container.appendChild(thumb);
    });
  }

  function imageToDataURL(img) {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/jpeg', 0.7);
  }

  function updateCompressionInfo() {
    let orig = 0, comp = 0;
    compressedImages.flat().forEach(img => {
      orig += img._originalSize || 0;
      comp += img._compressedSize || 0;
    });

    const info = document.getElementById('compression-info');
    if (compressedImages.flat().length === 0) {
      info.hidden = true;
      return;
    }
    info.hidden = false;
    document.getElementById('original-size').textContent = `Original: ${formatBytes(orig)}`;
    document.getElementById('compressed-size').textContent = `Compressed: ${formatBytes(comp)}`;
    const pct = orig > 0 ? Math.round((1 - comp / orig) * 100) : 0;
    document.getElementById('savings').textContent = `(${pct}% saved)`;
  }

  // --- Config ---
  function bindRange(id, key, format, parser) {
    const el = document.getElementById(id);
    const valEl = document.getElementById(id + '-val');
    el.addEventListener('input', () => {
      const v = parser ? parser(el.value) : parseFloat(el.value);
      valEl.textContent = format ? format(el.value) : v;
      renderer.updateConfig(key, v);
      exportRenderer.updateConfig(key, v);
      refreshSeamlessDuration();
    });
  }

  function bindRowRange(id, key, format, parser) {
    const el = document.getElementById(id);
    const valEl = document.getElementById(id + '-val');
    el.addEventListener('input', () => {
      const v = parser ? parser(el.value) : parseFloat(el.value);
      valEl.textContent = format ? format(el.value) : v;
      
      const arr = [...renderer.config[key]];
      arr[selectedConfigRow] = v;
      
      renderer.updateConfig(key, arr);
      exportRenderer.updateConfig(key, [...arr]);
      refreshSeamlessDuration();
    });
  }

  function bindSelect(id, key) {
    const el = document.getElementById(id);
    el.addEventListener('change', () => {
      renderer.updateConfig(key, el.value);
      exportRenderer.updateConfig(key, el.value);
      refreshSeamlessDuration();
    });
  }

  function bindRowSelect(id, key) {
    const el = document.getElementById(id);
    el.addEventListener('change', () => {
      const arr = [...renderer.config[key]];
      arr[selectedConfigRow] = el.value;
      renderer.updateConfig(key, arr);
      exportRenderer.updateConfig(key, [...arr]);
      refreshSeamlessDuration();
    });
  }

  function updateRowSettingsUI() {
    if (!renderer.config.speed) return;
    const config = renderer.config;
    
    document.getElementById('cfg-speed').value = config.speed[selectedConfigRow];
    document.getElementById('cfg-speed-val').textContent = config.speed[selectedConfigRow] + 'x';
    
    document.getElementById('cfg-direction').value = config.direction[selectedConfigRow];
    
    document.getElementById('cfg-visible').value = config.visibleCount[selectedConfigRow];
    document.getElementById('cfg-visible-val').textContent = config.visibleCount[selectedConfigRow];

    const imgSc = Array.isArray(config.imageScale)
      ? (config.imageScale[selectedConfigRow] ?? 100)
      : 100;
    document.getElementById('cfg-image-scale').value = imgSc;
    document.getElementById('cfg-image-scale-val').textContent = imgSc + '%';
  }

  function bindConfig() {
    bindRange('cfg-radius', 'borderRadius', v => v + 'px', v => parseInt(v));
    bindRange('cfg-border-width', 'borderWidth', v => v + 'px', v => parseInt(v));
    bindRange('cfg-perspective', 'perspective', v => v + '°', v => parseInt(v));
    bindRange('cfg-gap', 'gap', v => v + 'px', v => parseInt(v));
    bindRange('cfg-margin', 'margin', v => v + 'px', v => parseInt(v));

    bindRowRange('cfg-speed', 'speed', v => v + 'x');
    bindRowRange('cfg-visible', 'visibleCount', v => v, v => parseInt(v));
    bindRowRange('cfg-image-scale', 'imageScale', v => parseInt(v, 10) + '%', v => parseInt(v, 10));

    const bindColor = (colorId, textId, key) => {
      const colorEl = document.getElementById(colorId);
      const textEl = document.getElementById(textId);
      colorEl.addEventListener('input', () => {
        textEl.value = colorEl.value;
        renderer.updateConfig(key, colorEl.value);
        exportRenderer.updateConfig(key, colorEl.value);
      });
      textEl.addEventListener('change', () => {
        if (/^#[0-9a-fA-F]{6}$/.test(textEl.value)) {
          colorEl.value = textEl.value;
          renderer.updateConfig(key, textEl.value);
          exportRenderer.updateConfig(key, textEl.value);
        }
      });
    };

    bindColor('cfg-bg-color', 'cfg-bg-color-text', 'bgColor');
    bindColor('cfg-border-color', 'cfg-border-color-text', 'borderColor');

    bindRowSelect('cfg-direction', 'direction');

    document.getElementById('cfg-size').addEventListener('change', e => {
      const [w, h] = e.target.value.split('x').map(Number);
      renderer.resize(w, h);
      exportRenderer.resize(w, h);
      refreshSeamlessDuration();
    });
  }

  // --- Preview ---
  function startPreview() {
    const sizeVal = document.getElementById('cfg-size').value;
    const [w, h] = sizeVal.split('x').map(Number);
    renderer.resize(w, h);
    renderer.play();
    document.getElementById('icon-play').hidden = true;
    document.getElementById('icon-pause').hidden = false;

    document.getElementById('btn-play-pause').onclick = () => {
      if (renderer.playing) {
        renderer.pause();
        document.getElementById('icon-play').hidden = false;
        document.getElementById('icon-pause').hidden = true;
      } else {
        renderer.play();
        document.getElementById('icon-play').hidden = true;
        document.getElementById('icon-pause').hidden = false;
      }
    };
  }

  // --- Seamless Duration ---
  function computeSeamlessDuration() {
    if (!selectedTemplate || compressedImages.flat().length === 0) return null;
    const sizeVal = document.getElementById('cfg-size').value;
    const [w, h] = sizeVal.split('x').map(Number);
    const config = exportRenderer.config;
    return selectedTemplate.seamlessDuration(config, w, h, compressedImages);
  }

  function refreshSeamlessDuration() {
    const secs = computeSeamlessDuration();
    if (secs === null) return;

    document.getElementById('seamless-duration-val').textContent = secs.toFixed(2) + 's';

    const total = secs * loopMultiplier;
    document.getElementById('total-duration-val').textContent = total.toFixed(2) + 's';

    updateEstimate(total);
  }

  // --- Export ---
  function startExportPreview() {
    const sizeVal = document.getElementById('cfg-size').value;
    const [w, h] = sizeVal.split('x').map(Number);

    Object.keys(renderer.config).forEach(k => {
      exportRenderer.updateConfig(k, renderer.config[k]);
    });

    exportRenderer.resize(w, h);
    exportRenderer.play();
    refreshSeamlessDuration();
  }

  function bindExport() {
    document.querySelectorAll('.fmt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.fmt-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        exportFormat = btn.dataset.format;
        refreshSeamlessDuration();
      });
    });

    document.querySelectorAll('.qual-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.qual-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        exportQuality = btn.dataset.quality;
        const descs = { low: 'Half resolution, smallest file', mid: 'Full resolution, efficient encoding', high: 'Full resolution, maximum quality' };
        document.getElementById('quality-desc').textContent = descs[exportQuality];
        refreshSeamlessDuration();
      });
    });

    document.querySelectorAll('.mult-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mult-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loopMultiplier = parseInt(btn.dataset.mult);
        refreshSeamlessDuration();
      });
    });

    document.getElementById('btn-export').addEventListener('click', doExport);
  }

  function updateEstimate(duration) {
    if (!duration) return;
    const sizeVal = document.getElementById('cfg-size').value;
    const [w, h] = sizeVal.split('x').map(Number);
    const scale = exporter.getScale(exportQuality);
    const outW = Math.round(w * scale);
    const outH = Math.round(h * scale);

    const est = exporter.estimateSize(exportFormat, exportQuality, duration, outW, outH);

    document.getElementById('est-size').textContent = '~' + formatBytes(est.size);
    document.getElementById('est-resolution').textContent = `${outW} x ${outH}`;
    document.getElementById('est-frames').textContent = est.frames;
  }

  async function doExport() {
    const seamlessSecs = computeSeamlessDuration();
    if (!seamlessSecs) return;

    const duration = seamlessSecs * loopMultiplier;

    const btn = document.getElementById('btn-export');
    const progressEl = document.getElementById('export-progress');
    const resultEl = document.getElementById('export-result');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');

    btn.disabled = true;
    progressEl.hidden = false;
    resultEl.hidden = true;

    const options = { quality: exportQuality, duration, loop: true };

    const onProgress = (p) => {
      progressFill.style.width = Math.round(p * 100) + '%';
      if (p < 0.7) {
        progressText.textContent = `Rendering frames... ${Math.round(p / 0.7 * 100)}%`;
      } else {
        progressText.textContent = `Encoding ${exportFormat.toUpperCase()}... ${Math.round((p - 0.7) / 0.3 * 100)}%`;
      }
    };

    try {
      let blob;
      if (exportFormat === 'gif') {
        blob = await exporter.exportGIF(options, onProgress);
      } else {
        blob = await exporter.exportVideo(options, onProgress);
      }

      progressText.textContent = 'Done!';
      progressFill.style.width = '100%';

      const ext = exportFormat === 'gif' ? 'gif' : 'webm';
      const filename = `bento-marquee-${Date.now()}.${ext}`;

      resultEl.hidden = false;
      document.getElementById('result-filename').textContent = filename;
      document.getElementById('result-size').textContent = formatBytes(blob.size);

      document.getElementById('btn-download').onclick = () => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      };
    } catch (err) {
      progressText.textContent = 'Export failed: ' + err.message;
      console.error(err);
    }

    btn.disabled = false;
  }

  // --- Utilities ---
  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  init();
})();
