// =====================================================
// MultiUserPaint — UI, Panel ve Araç Yönetimi
// =====================================================

// --- UI Başlatma ---
function initUI() {
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      CanvasEngine.currentTool = btn.dataset.tool;
    });
  });


  const colorPicker = document.getElementById('color-picker');
  const colorPreview = document.getElementById('color-preview');
  colorPicker.addEventListener('input', (e) => {
    CanvasEngine.currentColor = e.target.value;
    colorPreview.style.backgroundColor = e.target.value;
  });

  document.querySelectorAll('.color-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.dataset.color;
      colorPicker.value = color;
      CanvasEngine.currentColor = color;
      colorPreview.style.backgroundColor = color;
    });
  });


  const brushSize = document.getElementById('brush-size');
  const brushSizeLabel = document.getElementById('brush-size-label');
  brushSize.addEventListener('input', (e) => {
    CanvasEngine.brushSize = parseInt(e.target.value);
    brushSizeLabel.textContent = e.target.value;
  });


  const brushOpacity = document.getElementById('brush-opacity');
  const brushOpacityLabel = document.getElementById('brush-opacity-label');
  brushOpacity.addEventListener('input', (e) => {
    CanvasEngine.brushOpacity = parseInt(e.target.value) / 100;
    brushOpacityLabel.textContent = e.target.value;
  });


  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    AppState.zoom = Math.min(AppState.zoom + 0.1, 3);
    applyZoom();
  });
  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    AppState.zoom = Math.max(AppState.zoom - 0.1, 0.1);
    applyZoom();
  });
  document.getElementById('btn-zoom-reset').addEventListener('click', () => {
    AppState.zoom = 1;
    applyZoom();
  });


  document.getElementById('btn-clear-layer').addEventListener('click', () => {
    if (!AppState.currentFileId || !AppState.activeLayerId) return;
    if (confirm('Aktif katmanı temizlemek istediğinize emin misiniz?')) {
      window.api.canvasClear(AppState.currentFileId, AppState.activeLayerId);
      clearCanvasLayer(AppState.activeLayerId);
    }
  });


  document.getElementById('btn-cut').addEventListener('click', () => {
    if (!AppState.currentFileId || !AppState.activeLayerId) return;
    if (!CanvasEngine.selectionRect) {
      alert('Lütfen önce seçim aracı ile bir alan seçin.');
      return;
    }
    const { x, y, w, h } = CanvasEngine.selectionRect;
    const ctx = CanvasEngine.contexts[AppState.activeLayerId];
    if (!ctx) return;
    
    const imageData = ctx.getImageData(x, y, w, h);
    AppState.clipboard = { type: 'image', w, h, data: Array.from(imageData.data) };
    
    ctx.clearRect(x, y, w, h);
    document.getElementById('selection-overlay').style.display = 'none';
    CanvasEngine.selectionRect = null;
    
    window.api.cut(AppState.currentFileId, AppState.activeLayerId, { x, y, w, h });
  });


  document.getElementById('btn-copy').addEventListener('click', () => {
    if (!AppState.currentFileId || !AppState.activeLayerId) return;
    if (!CanvasEngine.selectionRect) {
      alert('Lütfen önce seçim aracı ile bir alan seçin.');
      return;
    }
    const { x, y, w, h } = CanvasEngine.selectionRect;
    const ctx = CanvasEngine.contexts[AppState.activeLayerId];
    if (!ctx) return;
    
    const imageData = ctx.getImageData(x, y, w, h);
    AppState.clipboard = { type: 'image', w, h, data: Array.from(imageData.data) };
    document.getElementById('selection-overlay').style.display = 'none';
    CanvasEngine.selectionRect = null;
  });


  document.getElementById('btn-paste').addEventListener('click', () => {
    if (!AppState.currentFileId || !AppState.activeLayerId) return;
    if (!AppState.clipboard) {
      alert('Pano boş.');
      return;
    }
    const ctx = CanvasEngine.contexts[AppState.activeLayerId];
    if (!ctx) return;
    
    // Basit yapıştırma (sol üst veya merkeze)
    const px = 100, py = 100; // Örnek koordinat
    const { w, h, data } = AppState.clipboard;
    const imgData = new ImageData(new Uint8ClampedArray(data), w, h);
    ctx.putImageData(imgData, px, py);
  });


  document.getElementById('btn-add-layer').addEventListener('click', () => {
    if (!AppState.currentFileId) return;
    const name = prompt('Katman adı:', `Katman ${AppState.currentFile.layers.length + 1}`);
    if (name) {
      window.api.layerAdd(AppState.currentFileId, name);
    }
  });


  document.getElementById('btn-new-file').addEventListener('click', () => {
    document.getElementById('modal-new-file').style.display = 'flex';
  });
  document.getElementById('btn-modal-cancel').addEventListener('click', () => {
    document.getElementById('modal-new-file').style.display = 'none';
  });
  document.getElementById('btn-modal-create').addEventListener('click', () => {
    const name = document.getElementById('new-file-name').value.trim() || 'Yeni Dosya';
    const width = parseInt(document.getElementById('new-file-width').value) || 1200;
    const height = parseInt(document.getElementById('new-file-height').value) || 800;
    window.api.fileCreate(name, width, height);
    document.getElementById('modal-new-file').style.display = 'none';
  });


  document.getElementById('btn-refresh-files').addEventListener('click', refreshFileList);
  document.getElementById('btn-disconnect').addEventListener('click', disconnectFromServer);
}



function renderFileList() {
  const ul = document.getElementById('file-list');
  ul.innerHTML = '';

  if (AppState.files.length === 0) {
    ul.innerHTML = '<li class="empty-state">Henüz paylaşılan dosya yok</li>';
    return;
  }

  AppState.files.forEach(file => {
    const li = document.createElement('li');
    if (AppState.currentFileId === file.fileId) {
      li.classList.add('active');
    }

    li.innerHTML = `
      <div class="file-icon">📄</div>
      <div class="file-info">
        <span class="file-title">${file.fileName}</span>
        <span class="file-meta">${file.owner} • ${file.width}x${file.height}</span>
      </div>
      <div class="file-editors" title="${file.editorCount} aktif kullanıcı">${file.editorCount}</div>
    `;

    li.addEventListener('click', () => {
      if (AppState.currentFileId !== file.fileId) {
        openFileById(file.fileId);
      }
    });

    ul.appendChild(li);
  });
}

function renderUserList() {
  const ul = document.getElementById('user-list');
  ul.innerHTML = '';
  document.getElementById('user-count').textContent = AppState.users.length;

  if (AppState.users.length === 0) {
    ul.innerHTML = '<li class="empty-state">Kimse bağlı değil</li>';
    return;
  }

  AppState.users.forEach(user => {
    const li = document.createElement('li');
    const color = getUserColor(user.username);
    const initial = user.username.charAt(0).toUpperCase();
    const isMe = user.userId === AppState.userId;

    li.innerHTML = `
      <div class="user-avatar" style="background-color: ${color}">${initial}</div>
      <div class="user-name">${user.username}</div>
      ${isMe ? '<div class="user-you">Sen</div>' : ''}
    `;
    ul.appendChild(li);
  });
}

function renderLayerList() {
  const ul = document.getElementById('layer-list');
  ul.innerHTML = '';

  if (!AppState.currentFile || !AppState.currentFile.layers) {
    ul.innerHTML = '<li class="empty-state">Dosya açılmadı</li>';
    return;
  }

  const layers = [...AppState.currentFile.layers].reverse(); // Üsttekiler üstte görünsün

  layers.forEach(layer => {
    const li = document.createElement('li');
    if (AppState.activeLayerId === layer.id) {
      li.classList.add('active');
    }

    li.innerHTML = `
      <div class="layer-visibility" data-id="${layer.id}">
        ${layer.visible ? '👁️' : '🕶️'}
      </div>
      <div class="layer-name">${layer.name}</div>
      <div class="layer-actions">
        <button class="layer-action-btn btn-rename" title="Yeniden Adlandır">✏️</button>
        <button class="layer-action-btn btn-delete" title="Sil">🗑️</button>
      </div>
    `;

    // Katman Seçimi
    li.addEventListener('click', (e) => {
      if (!e.target.closest('.layer-visibility') && !e.target.closest('.layer-actions')) {
        AppState.activeLayerId = layer.id;
        renderLayerList();
        updateActiveLayerDisplay();
      }
    });

    // Görünürlük
    li.querySelector('.layer-visibility').addEventListener('click', (e) => {
      e.stopPropagation();
      const visible = !layer.visible;
      layer.visible = visible;
      if (CanvasEngine.canvases[layer.id]) {
        CanvasEngine.canvases[layer.id].style.display = visible ? 'block' : 'none';
      }
      window.api.layerVisibility(AppState.currentFileId, layer.id, visible);
      renderLayerList();
    });

    // Adlandırma
    li.querySelector('.btn-rename').addEventListener('click', (e) => {
      e.stopPropagation();
      const newName = prompt('Yeni katman adı:', layer.name);
      if (newName && newName.trim() !== '') {
        window.api.layerRename(AppState.currentFileId, layer.id, newName.trim());
      }
    });

    // Silme
    li.querySelector('.btn-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      if (layers.length <= 1) {
        alert('En az bir katman olmalıdır.');
        return;
      }
      if (confirm(`'${layer.name}' katmanını silmek istediğinize emin misiniz?`)) {
        window.api.layerRemove(AppState.currentFileId, layer.id);
      }
    });

    ul.appendChild(li);
  });
}

function updateActiveLayerDisplay() {
  if (!AppState.currentFile || !AppState.activeLayerId) {
    document.getElementById('active-layer-display').textContent = '-';
    return;
  }
  const layer = AppState.currentFile.layers.find(l => l.id === AppState.activeLayerId);
  if (layer) {
    document.getElementById('active-layer-display').textContent = `Katman: ${layer.name}`;
  }
}

// --- Olay İşleyiciler (Bağlantı & Dosya) ---

function onFileOpened(fileData) {
  if (AppState.currentFileId) {
    window.api.fileClose(AppState.currentFileId);
  }

  AppState.currentFileId = fileData.fileId;
  AppState.currentFile = fileData;
  document.getElementById('current-file-name').textContent = fileData.fileName;

  setupCanvasForFile(fileData);
  renderFileList();
  renderLayerList();
}

function onFileClosed(fileId) {
  if (AppState.currentFileId === fileId) {
    AppState.currentFileId = null;
    AppState.currentFile = null;
    AppState.activeLayerId = null;
    document.getElementById('current-file-name').textContent = 'Dosya seçilmedi';
    document.getElementById('canvas-container').style.display = 'none';
    document.getElementById('canvas-placeholder').style.display = 'flex';
    document.getElementById('canvas-size-display').textContent = '-';
    renderLayerList();
    renderFileList();
  }
}

function onLayerUpdate(msg) {
  if (msg.fileId !== AppState.currentFileId || !AppState.currentFile) return;

  switch (msg.action) {
    case 'add':
      AppState.currentFile.layers.push(msg.layer);
      createCanvasLayer(msg.layer.id, AppState.currentFile.width, AppState.currentFile.height, msg.layer.order);
      break;
    case 'remove':
      AppState.currentFile.layers = AppState.currentFile.layers.filter(l => l.id !== msg.layerId);
      removeCanvasLayer(msg.layerId);
      if (AppState.activeLayerId === msg.layerId) {
        AppState.activeLayerId = AppState.currentFile.layers[0].id;
      }
      break;
    case 'rename':
      const layer1 = AppState.currentFile.layers.find(l => l.id === msg.layerId);
      if (layer1) layer1.name = msg.name;
      break;
    case 'visibility':
      const layer2 = AppState.currentFile.layers.find(l => l.id === msg.layerId);
      if (layer2) {
        layer2.visible = msg.visible;
        if (CanvasEngine.canvases[msg.layerId]) {
          CanvasEngine.canvases[msg.layerId].style.display = msg.visible ? 'block' : 'none';
        }
      }
      break;
  }
  
  renderLayerList();
  updateActiveLayerDisplay();
}
