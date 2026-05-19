'use strict';

// =====================================================
// MultiUserPaint — Electron Preload Script
// contextBridge ile renderer'a güvenli API sunumu
// =====================================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // --- Bağlantı ---
  connect: (host, port, username) =>
    ipcRenderer.invoke('connect', { host, port, username }),

  disconnect: () =>
    ipcRenderer.invoke('disconnect'),

  getConnectionStatus: () =>
    ipcRenderer.invoke('get-connection-status'),

  // --- Dosya İşlemleri ---
  fileCreate: (fileName, width, height) =>
    ipcRenderer.invoke('file-create', { fileName, width, height }),

  fileList: () =>
    ipcRenderer.invoke('file-list'),

  fileOpen: (fileId) =>
    ipcRenderer.invoke('file-open', { fileId }),

  fileClose: (fileId) =>
    ipcRenderer.invoke('file-close', { fileId }),

  // --- Çizim ---
  drawAction: (fileId, layerId, action) =>
    ipcRenderer.invoke('draw-action', { fileId, layerId, action }),

  canvasClear: (fileId, layerId) =>
    ipcRenderer.invoke('canvas-clear', { fileId, layerId }),

  // --- Pano (Clipboard) ---
  cut: (fileId, layerId, selection) =>
    ipcRenderer.invoke('cut', { fileId, layerId, selection }),

  paste: (fileId, layerId, pasteData, position) =>
    ipcRenderer.invoke('paste', { fileId, layerId, pasteData, position }),

  // --- Katman ---
  layerAdd: (fileId, name) =>
    ipcRenderer.invoke('layer-add', { fileId, name }),

  layerRemove: (fileId, layerId) =>
    ipcRenderer.invoke('layer-remove', { fileId, layerId }),

  layerRename: (fileId, layerId, name) =>
    ipcRenderer.invoke('layer-rename', { fileId, layerId, name }),

  layerVisibility: (fileId, layerId, visible) =>
    ipcRenderer.invoke('layer-visibility', { fileId, layerId, visible }),

  layerOpacity: (fileId, layerId, opacity) =>
    ipcRenderer.invoke('layer-opacity', { fileId, layerId, opacity }),

  // --- Genel Mesaj Gönderimi ---
  sendMessage: (type, data) =>
    ipcRenderer.invoke('send-message', { type, data }),

  // --- Olayları Dinle ---
  onServerMessage: (callback) => {
    ipcRenderer.on('server-message', (event, msg) => callback(msg));
  },

  onConnectionLost: (callback) => {
    ipcRenderer.on('connection-lost', () => callback());
  },

  // --- Olay Dinleyicilerini Temizle ---
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('server-message');
    ipcRenderer.removeAllListeners('connection-lost');
  }
});
