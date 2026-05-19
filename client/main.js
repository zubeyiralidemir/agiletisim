'use strict';

// =====================================================
// MultiUserPaint — Electron Ana Süreç (Main Process)
// TCP bağlantısı ve pencere yönetimi
// =====================================================

const { app, BrowserWindow, ipcMain } = require('electron');
const net = require('net');
const path = require('path');
const { MessageType, ProtocolParser, encode } = require('../shared/protocol');

let mainWindow = null;
let tcpSocket = null;
let protocolParser = null;
let isConnected = false;

// =============================================
// Electron Pencere Oluşturma
// =============================================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'MultiUserPaint',
    icon: path.join(__dirname, 'renderer', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0a0a1a',
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    disconnectFromServer();
  });

  // DevTools açmak için (geliştirme sırasında)
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

// =============================================
// TCP Bağlantı Yönetimi
// =============================================

function connectToServer(host, port, username) {
  return new Promise((resolve, reject) => {
    if (tcpSocket) {
      tcpSocket.destroy();
    }

    tcpSocket = new net.Socket();
    protocolParser = new ProtocolParser();

    // Mesaj alındığında renderer'a ilet
    protocolParser.onMessage = (msg) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('server-message', msg);
      }

      // CONNECT_ACK geldiğinde bağlantı başarılı
      if (msg.type === MessageType.CONNECT_ACK) {
        isConnected = true;
        resolve({ success: true, ...msg });
      }
      // CONNECT_REJECT geldiğinde hata
      if (msg.type === MessageType.CONNECT_REJECT) {
        resolve({ success: false, reason: msg.reason });
      }
    };

    // TCP Bağlantı
    tcpSocket.connect(port, host, () => {
      console.log(`[TCP] Sunucuya bağlanıldı: ${host}:${port}`);
      // CONNECT mesajı gönder
      sendToServer(MessageType.CONNECT, { username });
    });

    // Veri alındığında parser'a ilet
    tcpSocket.on('data', (data) => {
      protocolParser.feed(data);
    });

    // Bağlantı kapandığında
    tcpSocket.on('close', () => {
      console.log('[TCP] Bağlantı kapandı');
      isConnected = false;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('connection-lost');
      }
    });

    // Hata
    tcpSocket.on('error', (err) => {
      console.error('[TCP] Hata:', err.message);
      isConnected = false;
      reject(err.message);
    });

    // Timeout
    tcpSocket.setTimeout(10000, () => {
      if (!isConnected) {
        tcpSocket.destroy();
        reject('Bağlantı zaman aşımına uğradı');
      }
    });
  });
}

function disconnectFromServer() {
  if (tcpSocket && !tcpSocket.destroyed) {
    sendToServer(MessageType.DISCONNECT, {});
    setTimeout(() => {
      if (tcpSocket && !tcpSocket.destroyed) {
        tcpSocket.destroy();
      }
    }, 500);
  }
  isConnected = false;
  tcpSocket = null;
  protocolParser = null;
}

function sendToServer(type, data = {}) {
  if (tcpSocket && !tcpSocket.destroyed) {
    try {
      tcpSocket.write(encode(type, data));
    } catch (err) {
      console.error('[TCP] Gönderme hatası:', err.message);
    }
  }
}

// =============================================
// IPC İşleyicileri — Renderer ile iletişim
// =============================================

// Sunucuya bağlan
ipcMain.handle('connect', async (event, { host, port, username }) => {
  try {
    const result = await connectToServer(host, parseInt(port), username);
    return result;
  } catch (err) {
    return { success: false, reason: String(err) };
  }
});

// Sunucu bağlantısını kes
ipcMain.handle('disconnect', async () => {
  disconnectFromServer();
  return { success: true };
});

// Sunucuya mesaj gönder (genel amaçlı)
ipcMain.handle('send-message', async (event, { type, data }) => {
  sendToServer(type, data);
  return { sent: true };
});

// Dosya oluştur
ipcMain.handle('file-create', async (event, { fileName, width, height }) => {
  sendToServer(MessageType.FILE_CREATE, { fileName, width, height });
});

// Dosya listesi iste
ipcMain.handle('file-list', async () => {
  sendToServer(MessageType.FILE_LIST_REQ, {});
});

// Dosya aç
ipcMain.handle('file-open', async (event, { fileId }) => {
  sendToServer(MessageType.FILE_OPEN, { fileId });
});

// Dosya kapat
ipcMain.handle('file-close', async (event, { fileId }) => {
  sendToServer(MessageType.FILE_CLOSE, { fileId });
});

// Çizim aksiyonu gönder
ipcMain.handle('draw-action', async (event, { fileId, layerId, action }) => {
  sendToServer(MessageType.DRAW_ACTION, { fileId, layerId, action });
});

// Tuvali temizle
ipcMain.handle('canvas-clear', async (event, { fileId, layerId }) => {
  sendToServer(MessageType.CANVAS_CLEAR, { fileId, layerId });
});

// Kes
ipcMain.handle('cut', async (event, { fileId, layerId, selection }) => {
  sendToServer(MessageType.CUT, { fileId, layerId, selection });
});

// Yapıştır
ipcMain.handle('paste', async (event, { fileId, layerId, pasteData, position }) => {
  sendToServer(MessageType.PASTE, { fileId, layerId, pasteData, position });
});

// Katman ekle
ipcMain.handle('layer-add', async (event, { fileId, name }) => {
  sendToServer(MessageType.LAYER_ADD, { fileId, name });
});

// Katman sil
ipcMain.handle('layer-remove', async (event, { fileId, layerId }) => {
  sendToServer(MessageType.LAYER_REMOVE, { fileId, layerId });
});

// Katman yeniden adlandır
ipcMain.handle('layer-rename', async (event, { fileId, layerId, name }) => {
  sendToServer(MessageType.LAYER_RENAME, { fileId, layerId, name });
});

// Katman görünürlük
ipcMain.handle('layer-visibility', async (event, { fileId, layerId, visible }) => {
  sendToServer(MessageType.LAYER_VISIBILITY, { fileId, layerId, visible });
});

// Katman opaklık
ipcMain.handle('layer-opacity', async (event, { fileId, layerId, opacity }) => {
  sendToServer(MessageType.LAYER_OPACITY, { fileId, layerId, opacity });
});

// Bağlantı durumu
ipcMain.handle('get-connection-status', async () => {
  return { connected: isConnected };
});

// =============================================
// Uygulama Yaşam Döngüsü
// =============================================

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  disconnectFromServer();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
