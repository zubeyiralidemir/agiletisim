'use strict';

// =====================================================
// Dosya Yöneticisi (File Manager)
// Tuval dosyalarının CRUD işlemleri ve otomatik kaydetme
// =====================================================

const fs = require('fs');
const path = require('path');
const { generateId } = require('../shared/protocol');

const STORAGE_DIR = path.join(__dirname, 'storage');
const AUTO_SAVE_INTERVAL = 30000; // 30 saniye

class FileManager {
  constructor() {
    // fileId -> dosya metadata eşlemesi
    this.files = new Map();
    // fileId -> değişiklik bayrağı (dirty flag)
    this.dirtyFiles = new Set();

    // Storage dizinini oluştur
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }

    // Mevcut dosyaları yükle
    this._loadExistingFiles();

    // Otomatik kaydetme zamanlayıcısı
    this.autoSaveTimer = setInterval(() => this._autoSave(), AUTO_SAVE_INTERVAL);

    console.log(`[FileManager] Başlatıldı. Mevcut dosya sayısı: ${this.files.size}`);
  }

  /**
   * Yeni dosya oluştur
   * @param {string} owner - Dosya sahibinin kullanıcı adı
   * @param {string} fileName - Dosya adı
   * @param {number} width - Tuval genişliği (piksel)
   * @param {number} height - Tuval yüksekliği (piksel)
   * @returns {object} Oluşturulan dosya bilgisi
   */
  createFile(owner, fileName, width = 1200, height = 800) {
    const fileId = generateId();
    const now = Date.now();

    const fileData = {
      fileId,
      fileName: fileName || `Adsız_${fileId.slice(0, 4)}`,
      owner,
      width,
      height,
      shared: true,
      createdAt: now,
      modifiedAt: now,
      layers: [
        {
          id: generateId(),
          name: 'Katman 1',
          visible: true,
          opacity: 1.0,
          order: 0,
          actions: [],
        }
      ],
      editors: [], // Şu an düzenleyen kullanıcılar
    };

    this.files.set(fileId, fileData);
    this._saveToDisk(fileId);

    console.log(`[FileManager] Dosya oluşturuldu: ${fileName} (${fileId}) - Sahip: ${owner}`);
    return this._getFileInfo(fileId);
  }

  /**
   * Dosya listesini döndür
   * @returns {Array} Dosya bilgileri listesi
   */
  getFileList() {
    const list = [];
    for (const [fileId, file] of this.files) {
      if (file.shared) {
        list.push({
          fileId: file.fileId,
          fileName: file.fileName,
          owner: file.owner,
          width: file.width,
          height: file.height,
          createdAt: file.createdAt,
          modifiedAt: file.modifiedAt,
          editorCount: file.editors.length,
          layerCount: file.layers.length,
        });
      }
    }
    return list;
  }

  /**
   * Dosyayı aç — tam veri döndür
   * @param {string} fileId
   * @param {string} username - Açan kullanıcı
   * @returns {object|null}
   */
  openFile(fileId, username) {
    const file = this.files.get(fileId);
    if (!file) return null;

    // Editör listesine ekle
    if (!file.editors.includes(username)) {
      file.editors.push(username);
    }

    return {
      fileId: file.fileId,
      fileName: file.fileName,
      owner: file.owner,
      width: file.width,
      height: file.height,
      layers: file.layers,
      editors: file.editors,
    };
  }

  /**
   * Dosyayı kapat
   * @param {string} fileId
   * @param {string} username
   */
  closeFile(fileId, username) {
    const file = this.files.get(fileId);
    if (!file) return;

    file.editors = file.editors.filter(e => e !== username);
    this.dirtyFiles.add(fileId);
  }

  /**
   * Dosya paylaşımını aç/kapat
   * @param {string} fileId
   * @param {boolean} shared
   */
  setShared(fileId, shared) {
    const file = this.files.get(fileId);
    if (file) {
      file.shared = shared;
      this.dirtyFiles.add(fileId);
    }
  }

  /**
   * Dosyayı sil
   * @param {string} fileId
   * @returns {boolean}
   */
  deleteFile(fileId) {
    const file = this.files.get(fileId);
    if (!file) return false;

    this.files.delete(fileId);
    this.dirtyFiles.delete(fileId);

    // Diskten sil
    const filePath = path.join(STORAGE_DIR, `${fileId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    console.log(`[FileManager] Dosya silindi: ${file.fileName} (${fileId})`);
    return true;
  }

  /**
   * Çizim aksiyonu ekle
   * @param {string} fileId
   * @param {string} layerId
   * @param {object} action - Çizim verisi
   */
  addDrawAction(fileId, layerId, action) {
    const file = this.files.get(fileId);
    if (!file) return false;

    const layer = file.layers.find(l => l.id === layerId);
    if (!layer) return false;

    layer.actions.push(action);
    file.modifiedAt = Date.now();
    this.dirtyFiles.add(fileId);
    return true;
  }

  /**
   * Tuvali temizle
   * @param {string} fileId
   * @param {string} layerId - null ise tüm katmanlar temizlenir
   */
  clearCanvas(fileId, layerId = null) {
    const file = this.files.get(fileId);
    if (!file) return false;

    if (layerId) {
      const layer = file.layers.find(l => l.id === layerId);
      if (layer) layer.actions = [];
    } else {
      file.layers.forEach(l => l.actions = []);
    }

    file.modifiedAt = Date.now();
    this.dirtyFiles.add(fileId);
    return true;
  }

  // --- Katman İşlemleri ---

  /**
   * Yeni katman ekle
   * @param {string} fileId
   * @param {string} name
   * @returns {object|null} Eklenen katman
   */
  addLayer(fileId, name) {
    const file = this.files.get(fileId);
    if (!file) return null;

    const layer = {
      id: generateId(),
      name: name || `Katman ${file.layers.length + 1}`,
      visible: true,
      opacity: 1.0,
      order: file.layers.length,
      actions: [],
    };

    file.layers.push(layer);
    file.modifiedAt = Date.now();
    this.dirtyFiles.add(fileId);

    console.log(`[FileManager] Katman eklendi: ${layer.name} -> ${file.fileName}`);
    return layer;
  }

  /**
   * Katman sil
   * @param {string} fileId
   * @param {string} layerId
   * @returns {boolean}
   */
  removeLayer(fileId, layerId) {
    const file = this.files.get(fileId);
    if (!file || file.layers.length <= 1) return false; // En az 1 katman olmalı

    file.layers = file.layers.filter(l => l.id !== layerId);
    // Sırayı güncelle
    file.layers.forEach((l, i) => l.order = i);
    file.modifiedAt = Date.now();
    this.dirtyFiles.add(fileId);
    return true;
  }

  /**
   * Katman adını değiştir
   */
  renameLayer(fileId, layerId, newName) {
    const file = this.files.get(fileId);
    if (!file) return false;

    const layer = file.layers.find(l => l.id === layerId);
    if (!layer) return false;

    layer.name = newName;
    this.dirtyFiles.add(fileId);
    return true;
  }

  /**
   * Katman görünürlüğünü değiştir
   */
  setLayerVisibility(fileId, layerId, visible) {
    const file = this.files.get(fileId);
    if (!file) return false;

    const layer = file.layers.find(l => l.id === layerId);
    if (!layer) return false;

    layer.visible = visible;
    this.dirtyFiles.add(fileId);
    return true;
  }

  /**
   * Katman opaklığını değiştir
   */
  setLayerOpacity(fileId, layerId, opacity) {
    const file = this.files.get(fileId);
    if (!file) return false;

    const layer = file.layers.find(l => l.id === layerId);
    if (!layer) return false;

    layer.opacity = Math.max(0, Math.min(1, opacity));
    this.dirtyFiles.add(fileId);
    return true;
  }

  /**
   * Katman sırasını değiştir
   */
  reorderLayers(fileId, layerIds) {
    const file = this.files.get(fileId);
    if (!file) return false;

    const reordered = [];
    for (const id of layerIds) {
      const layer = file.layers.find(l => l.id === id);
      if (layer) reordered.push(layer);
    }

    if (reordered.length === file.layers.length) {
      reordered.forEach((l, i) => l.order = i);
      file.layers = reordered;
      this.dirtyFiles.add(fileId);
      return true;
    }
    return false;
  }

  /**
   * Dosya bilgisini döndür
   */
  getFileInfo(fileId) {
    return this._getFileInfo(fileId);
  }

  // --- Dahili Yardımcılar ---

  _getFileInfo(fileId) {
    const file = this.files.get(fileId);
    if (!file) return null;
    return {
      fileId: file.fileId,
      fileName: file.fileName,
      owner: file.owner,
      width: file.width,
      height: file.height,
      shared: file.shared,
      createdAt: file.createdAt,
      modifiedAt: file.modifiedAt,
      layerCount: file.layers.length,
      editorCount: file.editors.length,
    };
  }

  _saveToDisk(fileId) {
    const file = this.files.get(fileId);
    if (!file) return;

    const filePath = path.join(STORAGE_DIR, `${fileId}.json`);
    const dataToSave = { ...file };
    delete dataToSave.editors; // Editör listesi kalıcı değil

    try {
      fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2), 'utf8');
    } catch (err) {
      console.error(`[FileManager] Kaydetme hatası (${fileId}):`, err.message);
    }
  }

  _autoSave() {
    if (this.dirtyFiles.size === 0) return;

    console.log(`[FileManager] Otomatik kaydetme: ${this.dirtyFiles.size} dosya`);
    for (const fileId of this.dirtyFiles) {
      this._saveToDisk(fileId);
    }
    this.dirtyFiles.clear();
  }

  _loadExistingFiles() {
    if (!fs.existsSync(STORAGE_DIR)) return;

    const files = fs.readdirSync(STORAGE_DIR).filter(f => f.endsWith('.json'));
    for (const fileName of files) {
      try {
        const filePath = path.join(STORAGE_DIR, fileName);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        data.editors = []; // Editör listesini sıfırla
        this.files.set(data.fileId, data);
      } catch (err) {
        console.error(`[FileManager] Dosya yükleme hatası (${fileName}):`, err.message);
      }
    }
  }

  /**
   * Temizlik — sunucu kapanırken çağrılır
   */
  shutdown() {
    clearInterval(this.autoSaveTimer);
    this._autoSave(); // Son kaydetme
    console.log('[FileManager] Kapatıldı.');
  }
}

module.exports = FileManager;
