// =====================================================
// MultiUserPaint — Canvas Çizim Motoru
// =====================================================

const CanvasEngine = {
  canvases: {},       // layerId -> canvas element
  contexts: {},       // layerId -> 2d context
  wrapper: null,
  container: null,
  isDrawing: false,
  currentTool: 'pen',
  currentColor: '#000000',
  brushSize: 3,
  brushOpacity: 1,
  lastPoint: null,
  currentAction: null,
  selectionStart: null,
  selectionRect: null,
};

function initCanvas() {
  CanvasEngine.wrapper = document.getElementById('canvas-wrapper');
  CanvasEngine.container = document.getElementById('canvas-container');
}

function setupCanvasForFile(fileData) {
  CanvasEngine.wrapper.innerHTML = '';
  CanvasEngine.canvases = {};
  CanvasEngine.contexts = {};

  const { width, height, layers } = fileData;

  layers.forEach((layer, index) => {
    createCanvasLayer(layer.id, width, height, index);
    // Mevcut aksiyonları çiz
    if (layer.actions && layer.actions.length > 0) {
      replayActions(layer.id, layer.actions);
    }
  });

  CanvasEngine.container.style.display = 'block';
  document.getElementById('canvas-placeholder').style.display = 'none';
  document.getElementById('canvas-size-display').textContent = `${width} × ${height}`;

  // İlk katmanı aktif yap
  if (layers.length > 0) {
    AppState.activeLayerId = layers[0].id;
    updateActiveLayerDisplay();
  }

  applyZoom();
  attachCanvasEvents();
}

function createCanvasLayer(layerId, width, height, zIndex) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.dataset.layerId = layerId;
  canvas.style.zIndex = zIndex;
  CanvasEngine.wrapper.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  CanvasEngine.canvases[layerId] = canvas;
  CanvasEngine.contexts[layerId] = ctx;
}

function removeCanvasLayer(layerId) {
  const canvas = CanvasEngine.canvases[layerId];
  if (canvas) {
    canvas.remove();
    delete CanvasEngine.canvases[layerId];
    delete CanvasEngine.contexts[layerId];
  }
}

function clearCanvasLayer(layerId) {
  const ctx = CanvasEngine.contexts[layerId];
  const canvas = CanvasEngine.canvases[layerId];
  if (ctx && canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function attachCanvasEvents() {
  // Tüm canvas'lardan olayları en üstteki aktif katmandan yakala
  CanvasEngine.wrapper.onmousedown = onCanvasMouseDown;
  CanvasEngine.wrapper.onmousemove = onCanvasMouseMove;
  CanvasEngine.wrapper.onmouseup = onCanvasMouseUp;
  CanvasEngine.wrapper.onmouseleave = onCanvasMouseUp;
}

function getCanvasPoint(e) {
  const canvas = CanvasEngine.canvases[AppState.activeLayerId];
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / AppState.zoom,
    y: (e.clientY - rect.top) / AppState.zoom,
  };
}

function onCanvasMouseDown(e) {
  if (!AppState.currentFileId || !AppState.activeLayerId) return;
  const point = getCanvasPoint(e);
  if (!point) return;

  // Koordinatları güncelle
  document.getElementById('coord-display').textContent = `X: ${Math.round(point.x)} Y: ${Math.round(point.y)}`;

  if (CanvasEngine.currentTool === 'select') {
    CanvasEngine.selectionStart = point;
    CanvasEngine.selectionRect = null;
    const overlay = document.getElementById('selection-overlay');
    overlay.style.display = 'block';
    overlay.style.left = point.x * AppState.zoom + 'px';
    overlay.style.top = point.y * AppState.zoom + 'px';
    overlay.style.width = '0px';
    overlay.style.height = '0px';
    return;
  }

  CanvasEngine.isDrawing = true;
  CanvasEngine.lastPoint = point;

  CanvasEngine.currentAction = {
    tool: CanvasEngine.currentTool,
    color: CanvasEngine.currentTool === 'eraser' ? '#FFFFFF' : CanvasEngine.currentColor,
    size: CanvasEngine.brushSize,
    opacity: CanvasEngine.brushOpacity,
    points: [point],
  };

  if (['line', 'rect', 'circle'].includes(CanvasEngine.currentTool)) {
    CanvasEngine.currentAction.startPoint = point;
  } else if (CanvasEngine.currentTool === 'fill') {
    CanvasEngine.isDrawing = false;
    performFill(point);
  } else {
    drawPoint(AppState.activeLayerId, point);
  }
}

function onCanvasMouseMove(e) {
  const point = getCanvasPoint(e);
  if (!point) return;

  document.getElementById('coord-display').textContent = `X: ${Math.round(point.x)} Y: ${Math.round(point.y)}`;

  if (CanvasEngine.currentTool === 'select' && CanvasEngine.selectionStart) {
    const s = CanvasEngine.selectionStart;
    const overlay = document.getElementById('selection-overlay');
    const x = Math.min(s.x, point.x) * AppState.zoom;
    const y = Math.min(s.y, point.y) * AppState.zoom;
    const w = Math.abs(point.x - s.x) * AppState.zoom;
    const h = Math.abs(point.y - s.y) * AppState.zoom;
    overlay.style.left = x + 'px';
    overlay.style.top = y + 'px';
    overlay.style.width = w + 'px';
    overlay.style.height = h + 'px';
    CanvasEngine.selectionRect = {
      x: Math.min(s.x, point.x), y: Math.min(s.y, point.y),
      w: Math.abs(point.x - s.x), h: Math.abs(point.y - s.y)
    };
    return;
  }

  if (!CanvasEngine.isDrawing) return;

  if (['line', 'rect', 'circle'].includes(CanvasEngine.currentTool)) {
    // Shape preview - temizle ve yeniden çiz
    previewShape(point);
  } else {
    drawLine(AppState.activeLayerId, CanvasEngine.lastPoint, point);
    CanvasEngine.lastPoint = point;
    CanvasEngine.currentAction.points.push(point);
  }
}

function onCanvasMouseUp(e) {
  if (CanvasEngine.currentTool === 'select') {
    CanvasEngine.selectionStart = null;
    return;
  }

  if (!CanvasEngine.isDrawing) return;
  CanvasEngine.isDrawing = false;

  const point = getCanvasPoint(e);

  if (['line', 'rect', 'circle'].includes(CanvasEngine.currentTool) && point) {
    CanvasEngine.currentAction.endPoint = point;
    drawShape(AppState.activeLayerId, CanvasEngine.currentAction);
  }

  // Aksiyonu sunucuya gönder
  if (CanvasEngine.currentAction && AppState.currentFileId) {
    window.api.drawAction(AppState.currentFileId, AppState.activeLayerId, CanvasEngine.currentAction);
  }

  CanvasEngine.currentAction = null;
  CanvasEngine.lastPoint = null;
}

// Çizim fonksiyonları
function drawPoint(layerId, point) {
  const ctx = CanvasEngine.contexts[layerId];
  if (!ctx) return;
  ctx.globalAlpha = CanvasEngine.brushOpacity;
  ctx.fillStyle = CanvasEngine.currentTool === 'eraser' ? '#FFFFFF' : CanvasEngine.currentColor;
  ctx.beginPath();
  ctx.arc(point.x, point.y, CanvasEngine.brushSize / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawLine(layerId, from, to) {
  const ctx = CanvasEngine.contexts[layerId];
  if (!ctx) return;
  ctx.globalAlpha = CanvasEngine.brushOpacity;
  ctx.strokeStyle = CanvasEngine.currentTool === 'eraser' ? '#FFFFFF' : CanvasEngine.currentColor;
  ctx.lineWidth = CanvasEngine.brushSize;

  if (CanvasEngine.currentTool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
  }

  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

function drawShape(layerId, action) {
  const ctx = CanvasEngine.contexts[layerId];
  if (!ctx || !action.startPoint || !action.endPoint) return;

  ctx.globalAlpha = action.opacity || 1;
  ctx.strokeStyle = action.color;
  ctx.lineWidth = action.size;
  ctx.beginPath();

  const s = action.startPoint, e = action.endPoint;

  switch (action.tool) {
    case 'line':
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
      break;
    case 'rect':
      ctx.strokeRect(s.x, s.y, e.x - s.x, e.y - s.y);
      break;
    case 'circle':
      const rx = Math.abs(e.x - s.x) / 2;
      const ry = Math.abs(e.y - s.y) / 2;
      const cx = s.x + (e.x - s.x) / 2;
      const cy = s.y + (e.y - s.y) / 2;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
  }
  ctx.globalAlpha = 1;
}

// Geçici preview canvas'ı üzerinde şekil önizleme
let previewCanvas = null;
let previewCtx = null;

function previewShape(currentPoint) {
  const activeCanvas = CanvasEngine.canvases[AppState.activeLayerId];
  if (!activeCanvas) return;

  if (!previewCanvas) {
    previewCanvas = document.createElement('canvas');
    previewCanvas.style.position = 'absolute';
    previewCanvas.style.top = '0';
    previewCanvas.style.left = '0';
    previewCanvas.style.zIndex = '999';
    previewCanvas.style.pointerEvents = 'none';
    CanvasEngine.wrapper.appendChild(previewCanvas);
  }

  previewCanvas.width = activeCanvas.width;
  previewCanvas.height = activeCanvas.height;
  previewCtx = previewCanvas.getContext('2d');
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  previewCtx.lineCap = 'round';
  previewCtx.lineJoin = 'round';

  drawShape_ctx(previewCtx, CanvasEngine.currentAction.startPoint, currentPoint,
    CanvasEngine.currentAction.tool, CanvasEngine.currentAction.color,
    CanvasEngine.currentAction.size, CanvasEngine.currentAction.opacity);
}

function drawShape_ctx(ctx, start, end, tool, color, size, opacity) {
  ctx.globalAlpha = opacity || 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.beginPath();
  switch (tool) {
    case 'line':
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      break;
    case 'rect':
      ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
      break;
    case 'circle':
      const rx = Math.abs(end.x - start.x) / 2;
      const ry = Math.abs(end.y - start.y) / 2;
      ctx.ellipse(start.x + (end.x - start.x) / 2, start.y + (end.y - start.y) / 2, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
  }
  ctx.globalAlpha = 1;
}

function finishShapePreview() {
  if (previewCanvas) {
    previewCanvas.remove();
    previewCanvas = null;
    previewCtx = null;
  }
}

function performFill(point) {
  const ctx = CanvasEngine.contexts[AppState.activeLayerId];
  const canvas = CanvasEngine.canvases[AppState.activeLayerId];
  if (!ctx || !canvas) return;

  const x = Math.round(point.x), y = Math.round(point.y);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;

  const targetIdx = (y * w + x) * 4;
  const targetR = data[targetIdx], targetG = data[targetIdx+1], targetB = data[targetIdx+2], targetA = data[targetIdx+3];

  const fillColor = hexToRgb(CanvasEngine.currentColor);
  if (targetR === fillColor.r && targetG === fillColor.g && targetB === fillColor.b) return;

  const stack = [[x, y]];
  const visited = new Set();

  while (stack.length > 0) {
    const [cx, cy] = stack.pop();
    if (cx < 0 || cy < 0 || cx >= w || cy >= canvas.height) continue;
    const key = cy * w + cx;
    if (visited.has(key)) continue;

    const idx = key * 4;
    if (Math.abs(data[idx] - targetR) > 10 || Math.abs(data[idx+1] - targetG) > 10 ||
        Math.abs(data[idx+2] - targetB) > 10 || Math.abs(data[idx+3] - targetA) > 30) continue;

    visited.add(key);
    data[idx] = fillColor.r;
    data[idx+1] = fillColor.g;
    data[idx+2] = fillColor.b;
    data[idx+3] = 255;

    stack.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);

    if (visited.size > 500000) break; // Güvenlik limiti
  }

  ctx.putImageData(imageData, 0, 0);

  const action = { tool: 'fill', color: CanvasEngine.currentColor, point, opacity: 1 };
  window.api.drawAction(AppState.currentFileId, AppState.activeLayerId, action);
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return { r, g, b };
}

// Uzaktan gelen çizim aksiyonunu uygula
function replayActions(layerId, actions) {
  const ctx = CanvasEngine.contexts[layerId];
  if (!ctx) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const action of actions) {
    replaySingleAction(layerId, action);
  }
}

function replaySingleAction(layerId, action) {
  const ctx = CanvasEngine.contexts[layerId];
  if (!ctx) return;

  if (action.tool === 'fill') {
    // Fill replay - basit şekilde rengi uygula
    const canvas = CanvasEngine.canvases[layerId];
    if (!canvas || !action.point) return;
    // Fill'i tekrar yap
    const tempColor = CanvasEngine.currentColor;
    CanvasEngine.currentColor = action.color;
    const tempLayerId = AppState.activeLayerId;
    AppState.activeLayerId = layerId;
    performFillReplay(ctx, canvas, action.point, action.color);
    CanvasEngine.currentColor = tempColor;
    AppState.activeLayerId = tempLayerId;
    return;
  }

  if (['line', 'rect', 'circle'].includes(action.tool)) {
    drawShape(layerId, action);
    return;
  }

  // Pen/Brush/Eraser
  if (!action.points || action.points.length === 0) return;

  ctx.globalAlpha = action.opacity || 1;
  ctx.strokeStyle = action.color || '#000000';
  ctx.lineWidth = action.size || 3;

  if (action.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
  }

  if (action.points.length === 1) {
    ctx.fillStyle = action.color;
    ctx.beginPath();
    ctx.arc(action.points[0].x, action.points[0].y, (action.size || 3) / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(action.points[0].x, action.points[0].y);
    for (let i = 1; i < action.points.length; i++) {
      ctx.lineTo(action.points[i].x, action.points[i].y);
    }
    ctx.stroke();
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

function performFillReplay(ctx, canvas, point, color) {
  const x = Math.round(point.x), y = Math.round(point.y);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const targetIdx = (y * w + x) * 4;
  const tR = data[targetIdx], tG = data[targetIdx+1], tB = data[targetIdx+2], tA = data[targetIdx+3];
  const fill = hexToRgb(color);
  if (tR === fill.r && tG === fill.g && tB === fill.b) return;
  const stack = [[x,y]];
  const visited = new Set();
  while (stack.length > 0) {
    const [cx,cy] = stack.pop();
    if (cx<0||cy<0||cx>=w||cy>=canvas.height) continue;
    const key = cy*w+cx;
    if (visited.has(key)) continue;
    const idx = key*4;
    if (Math.abs(data[idx]-tR)>10||Math.abs(data[idx+1]-tG)>10||Math.abs(data[idx+2]-tB)>10||Math.abs(data[idx+3]-tA)>30) continue;
    visited.add(key);
    data[idx]=fill.r; data[idx+1]=fill.g; data[idx+2]=fill.b; data[idx+3]=255;
    stack.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
    if (visited.size > 500000) break;
  }
  ctx.putImageData(imageData, 0, 0);
}

function onRemoteDraw(msg) {
  if (msg.fileId !== AppState.currentFileId) return;
  replaySingleAction(msg.layerId, msg.action);
}

function onRemoteClear(msg) {
  if (msg.fileId !== AppState.currentFileId) return;
  if (msg.layerId) {
    clearCanvasLayer(msg.layerId);
  } else {
    Object.keys(CanvasEngine.canvases).forEach(id => clearCanvasLayer(id));
  }
}

function onRemoteCut(msg) {
  if (msg.fileId !== AppState.currentFileId) return;
  // Kesilen alanı temizle
  if (msg.selection && msg.layerId) {
    const ctx = CanvasEngine.contexts[msg.layerId];
    if (ctx) {
      ctx.clearRect(msg.selection.x, msg.selection.y, msg.selection.w, msg.selection.h);
    }
  }
}

function onRemotePaste(msg) {
  if (msg.fileId !== AppState.currentFileId) return;
  if (msg.pasteData && msg.pasteData.actions) {
    for (const action of msg.pasteData.actions) {
      replaySingleAction(msg.layerId, action);
    }
  }
}

function applyZoom() {
  if (CanvasEngine.wrapper) {
    CanvasEngine.wrapper.style.transform = `scale(${AppState.zoom})`;
    CanvasEngine.wrapper.style.transformOrigin = 'center center';
    document.getElementById('zoom-level').textContent = Math.round(AppState.zoom * 100) + '%';
  }
}
