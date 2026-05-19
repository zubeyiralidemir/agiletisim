'use strict';


const net = require('net');
const { MessageType, ProtocolParser, encode } = require('../shared/protocol');
const SessionManager = require('./sessionManager');
const FileManager = require('./fileManager');

const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';
const HEARTBEAT_INTERVAL = 15000;

class PaintServer {
  constructor() {
    this.sessionManager = new SessionManager();
    this.fileManager = new FileManager();


    this.server = net.createServer({ allowHalfOpen: false }, (socket) => {
      this._handleConnection(socket);
    });


    this.heartbeatTimer = setInterval(() => this._sendHeartbeats(), HEARTBEAT_INTERVAL);
  }

  /**
   * Sunucuyu başlat
   */
  start() {
    this.server.listen(PORT, HOST, () => {
      console.log('============================================');
      console.log('  MultiUserPaint TCP Sunucu');
      console.log(`  Dinleniyor: ${HOST}:${PORT}`);
      console.log('  Protokol: TCP (NonBlocking, Event-Driven)');
      console.log('============================================');
    });

    this.server.on('error', (err) => {
      console.error('[Sunucu] Hata:', err.message);
      if (err.code === 'EADDRINUSE') {
        console.error(`[Sunucu] Port ${PORT} zaten kullanılıyor!`);
        process.exit(1);
      }
    });


    process.on('SIGINT', () => this._shutdown());
    process.on('SIGTERM', () => this._shutdown());
  }


  _handleConnection(socket) {
    const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`[Bağlantı] Yeni bağlantı: ${remoteAddr}`);


    const parser = new ProtocolParser();


    parser.onMessage = (msg) => {
      this._handleMessage(socket, msg);
    };


    socket.on('data', (data) => {
      parser.feed(data);
    });


    socket.on('close', () => {
      this._handleDisconnect(socket);
    });


    socket.on('error', (err) => {
      console.error(`[Bağlantı] Soket hatası (${remoteAddr}):`, err.message);
    });


    socket.setKeepAlive(true, 10000);
    socket.setNoDelay(true);
  }

  _handleMessage(socket, msg) {
    const { type } = msg;

    try {
      switch (type) {

        case MessageType.CONNECT:
          this._onConnect(socket, msg);
          break;
        case MessageType.DISCONNECT:
          this._onDisconnect(socket);
          break;
        case MessageType.HEARTBEAT:
          this._send(socket, MessageType.HEARTBEAT, { timestamp: Date.now() });
          break;


        case MessageType.FILE_CREATE:
          this._onFileCreate(socket, msg);
          break;
        case MessageType.FILE_LIST_REQ:
          this._onFileListReq(socket);
          break;
        case MessageType.FILE_OPEN:
          this._onFileOpen(socket, msg);
          break;
        case MessageType.FILE_CLOSE:
          this._onFileClose(socket, msg);
          break;
        case MessageType.FILE_SHARE:
          this._onFileShare(socket, msg);
          break;
        case MessageType.FILE_DELETE:
          this._onFileDelete(socket, msg);
          break;


        case MessageType.DRAW_ACTION:
          this._onDrawAction(socket, msg);
          break;
        case MessageType.CANVAS_CLEAR:
          this._onCanvasClear(socket, msg);
          break;


        case MessageType.CUT:
          this._onCut(socket, msg);
          break;
        case MessageType.PASTE:
          this._onPaste(socket, msg);
          break;


        case MessageType.LAYER_ADD:
          this._onLayerAdd(socket, msg);
          break;
        case MessageType.LAYER_REMOVE:
          this._onLayerRemove(socket, msg);
          break;
        case MessageType.LAYER_RENAME:
          this._onLayerRename(socket, msg);
          break;
        case MessageType.LAYER_VISIBILITY:
          this._onLayerVisibility(socket, msg);
          break;
        case MessageType.LAYER_OPACITY:
          this._onLayerOpacity(socket, msg);
          break;
        case MessageType.LAYER_REORDER:
          this._onLayerReorder(socket, msg);
          break;

        default:
          this._send(socket, MessageType.ERROR, {
            message: `Bilinmeyen mesaj tipi: ${type}`
          });
      }
    } catch (err) {
      console.error(`[Sunucu] Mesaj işleme hatası (${type}):`, err.message);
      this._send(socket, MessageType.ERROR, { message: 'Sunucu hatası' });
    }
  }




  _onConnect(socket, msg) {
    const { username } = msg;
    const result = this.sessionManager.registerUser(socket, username);

    if (result.success) {

      this._send(socket, MessageType.CONNECT_ACK, {
        userId: result.userId,
        username: username,
        message: 'Bağlantı başarılı'
      });


      this._broadcast(MessageType.USER_JOIN, {
        userId: result.userId,
        username: username
      }, socket);


      this._broadcastUserList();
    } else {
      this._send(socket, MessageType.CONNECT_REJECT, {
        reason: result.reason
      });
    }
  }

  _onDisconnect(socket) {
    const session = this.sessionManager.getSession(socket);
    if (session) {

      for (const fileId of session.openFiles) {
        this.fileManager.closeFile(fileId, session.username);
      }

      this._send(socket, MessageType.DISCONNECT_ACK, {});


      this._broadcast(MessageType.USER_LEAVE, {
        userId: session.userId,
        username: session.username
      }, socket);

      this.sessionManager.removeUser(socket);
      this._broadcastUserList();
    }
    socket.end();
  }

  _handleDisconnect(socket) {
    const session = this.sessionManager.getSession(socket);
    if (session) {
      console.log(`[Bağlantı] Bağlantı koptu: ${session.username}`);


      for (const fileId of session.openFiles) {
        this.fileManager.closeFile(fileId, session.username);
      }


      this._broadcast(MessageType.USER_LEAVE, {
        userId: session.userId,
        username: session.username
      }, socket);

      this.sessionManager.removeUser(socket);
      this._broadcastUserList();
    }
  }




  _onFileCreate(socket, msg) {
    const session = this.sessionManager.getSession(socket);
    if (!session) return this._sendError(socket, 'Oturum bulunamadı');

    const { fileName, width, height } = msg;
    const fileInfo = this.fileManager.createFile(
      session.username,
      fileName,
      width || 1200,
      height || 800
    );

    this._send(socket, MessageType.FILE_CREATE_ACK, { file: fileInfo });


    this._broadcast(MessageType.FILE_NOTIFY, {
      action: 'created',
      file: fileInfo,
      by: session.username
    }, socket);
  }

  _onFileListReq(socket) {
    const files = this.fileManager.getFileList();
    this._send(socket, MessageType.FILE_LIST_RES, { files });
  }

  _onFileOpen(socket, msg) {
    const session = this.sessionManager.getSession(socket);
    if (!session) return this._sendError(socket, 'Oturum bulunamadı');

    const { fileId } = msg;
    const fileData = this.fileManager.openFile(fileId, session.username);

    if (fileData) {
      this.sessionManager.openFile(socket, fileId);
      this._send(socket, MessageType.FILE_OPEN_ACK, { file: fileData });


      this._broadcastToFile(fileId, MessageType.USER_JOIN, {
        username: session.username,
        fileId: fileId
      }, socket);
    } else {
      this._sendError(socket, 'Dosya bulunamadı');
    }
  }

  _onFileClose(socket, msg) {
    const session = this.sessionManager.getSession(socket);
    if (!session) return;

    const { fileId } = msg;
    this.fileManager.closeFile(fileId, session.username);
    this.sessionManager.closeFile(socket, fileId);

    this._send(socket, MessageType.FILE_CLOSE_ACK, { fileId });


    this._broadcastToFile(fileId, MessageType.USER_LEAVE, {
      username: session.username,
      fileId: fileId
    }, socket);
  }

  _onFileShare(socket, msg) {
    const session = this.sessionManager.getSession(socket);
    if (!session) return;

    const { fileId, shared } = msg;
    this.fileManager.setShared(fileId, shared !== false);
    this._send(socket, MessageType.FILE_SHARE_ACK, { fileId, shared });


    this._broadcast(MessageType.FILE_NOTIFY, {
      action: shared ? 'shared' : 'unshared',
      file: this.fileManager.getFileInfo(fileId),
      by: session.username
    }, socket);
  }

  _onFileDelete(socket, msg) {
    const session = this.sessionManager.getSession(socket);
    if (!session) return;

    const { fileId } = msg;
    const success = this.fileManager.deleteFile(fileId);
    this._send(socket, MessageType.FILE_DELETE_ACK, { fileId, success });

    if (success) {
      this._broadcast(MessageType.FILE_NOTIFY, {
        action: 'deleted',
        fileId,
        by: session.username
      });
    }
  }







  _onDrawAction(socket, msg) {
    const session = this.sessionManager.getSession(socket);
    if (!session) return;

    const { fileId, layerId, action } = msg;


    this.fileManager.addDrawAction(fileId, layerId, {
      ...action,
      userId: session.userId,
      username: session.username,
      timestamp: Date.now()
    });


    this._broadcastToFile(fileId, MessageType.DRAW_BROADCAST, {
      fileId,
      layerId,
      action: {
        ...action,
        username: session.username
      }
    }, socket);
  }

  _onCanvasClear(socket, msg) {
    const session = this.sessionManager.getSession(socket);
    if (!session) return;

    const { fileId, layerId } = msg;
    this.fileManager.clearCanvas(fileId, layerId);

    this._broadcastToFile(fileId, MessageType.CANVAS_CLEAR_BROADCAST, {
      fileId,
      layerId,
      by: session.username
    }, socket);
  }




  _onCut(socket, msg) {
    const session = this.sessionManager.getSession(socket);
    if (!session) return;

    const { fileId, layerId, selection } = msg;


    this._broadcastToFile(fileId, MessageType.CUT_BROADCAST, {
      fileId,
      layerId,
      selection,
      by: session.username
    }, socket);
  }

  _onPaste(socket, msg) {
    const session = this.sessionManager.getSession(socket);
    if (!session) return;

    const { fileId, layerId, pasteData, position } = msg;


    if (pasteData && pasteData.actions) {
      for (const action of pasteData.actions) {
        this.fileManager.addDrawAction(fileId, layerId, {
          ...action,
          userId: session.userId,
          timestamp: Date.now()
        });
      }
    }


    this._broadcastToFile(fileId, MessageType.PASTE_BROADCAST, {
      fileId,
      layerId,
      pasteData,
      position,
      by: session.username
    }, socket);
  }




  _onLayerAdd(socket, msg) {
    const session = this.sessionManager.getSession(socket);
    if (!session) return;

    const { fileId, name } = msg;
    const layer = this.fileManager.addLayer(fileId, name);

    if (layer) {
      this._send(socket, MessageType.LAYER_ADD_ACK, { fileId, layer });
      this._broadcastToFile(fileId, MessageType.LAYER_UPDATE, {
        fileId,
        action: 'add',
        layer,
        by: session.username
      }, socket);
    }
  }

  _onLayerRemove(socket, msg) {
    const session = this.sessionManager.getSession(socket);
    if (!session) return;

    const { fileId, layerId } = msg;
    const success = this.fileManager.removeLayer(fileId, layerId);

    this._send(socket, MessageType.LAYER_REMOVE_ACK, { fileId, layerId, success });
    if (success) {
      this._broadcastToFile(fileId, MessageType.LAYER_UPDATE, {
        fileId,
        action: 'remove',
        layerId,
        by: session.username
      }, socket);
    }
  }

  _onLayerRename(socket, msg) {
    const { fileId, layerId, name } = msg;
    this.fileManager.renameLayer(fileId, layerId, name);
    this._broadcastToFile(fileId, MessageType.LAYER_UPDATE, {
      fileId, action: 'rename', layerId, name
    }, socket);
  }

  _onLayerVisibility(socket, msg) {
    const { fileId, layerId, visible } = msg;
    this.fileManager.setLayerVisibility(fileId, layerId, visible);
    this._broadcastToFile(fileId, MessageType.LAYER_UPDATE, {
      fileId, action: 'visibility', layerId, visible
    }, socket);
  }

  _onLayerOpacity(socket, msg) {
    const { fileId, layerId, opacity } = msg;
    this.fileManager.setLayerOpacity(fileId, layerId, opacity);
    this._broadcastToFile(fileId, MessageType.LAYER_UPDATE, {
      fileId, action: 'opacity', layerId, opacity
    }, socket);
  }

  _onLayerReorder(socket, msg) {
    const { fileId, layerIds } = msg;
    this.fileManager.reorderLayers(fileId, layerIds);
    this._broadcastToFile(fileId, MessageType.LAYER_UPDATE, {
      fileId, action: 'reorder', layerIds
    }, socket);
  }







  _send(socket, type, data = {}) {
    if (!socket.destroyed) {
      try {
        socket.write(encode(type, data));
      } catch (err) {
        console.error('[Sunucu] Gönderme hatası:', err.message);
      }
    }
  }

  /**
   * Hata mesajı gönder
   */
  _sendError(socket, message) {
    this._send(socket, MessageType.ERROR, { message });
  }

  /**
   * Tüm istemcilere yayınla (broadcast)
   * @param {string} type
   * @param {object} data
   * @param {net.Socket} [excludeSocket] - Hariç tutulacak soket
   */
  _broadcast(type, data, excludeSocket = null) {
    const sockets = this.sessionManager.getAllSockets(excludeSocket);
    const frame = encode(type, data);
    for (const sock of sockets) {
      if (!sock.destroyed) {
        try {
          sock.write(frame);
        } catch (err) { /* ignore */ }
      }
    }
  }

  /**
   * Belirli bir dosyayı düzenleyen istemcilere yayınla
   * @param {string} fileId
   * @param {string} type
   * @param {object} data
   * @param {net.Socket} [excludeSocket]
   */
  _broadcastToFile(fileId, type, data, excludeSocket = null) {
    const sockets = this.sessionManager.getSocketsEditingFile(fileId, excludeSocket);
    const frame = encode(type, data);
    for (const sock of sockets) {
      if (!sock.destroyed) {
        try {
          sock.write(frame);
        } catch (err) { /* ignore */ }
      }
    }
  }


  _broadcastUserList() {
    const users = this.sessionManager.getUserList();
    this._broadcast(MessageType.USER_LIST, { users });
  }


  _sendHeartbeats() {
    const frame = encode(MessageType.HEARTBEAT, { timestamp: Date.now() });
    for (const socket of this.sessionManager.getAllSockets()) {
      if (!socket.destroyed) {
        try {
          socket.write(frame);
        } catch (err) { /* ignore */ }
      }
    }
  }


  _shutdown() {
    console.log('\n[Sunucu] Kapatılıyor...');
    clearInterval(this.heartbeatTimer);
    this.fileManager.shutdown();
    this.server.close(() => {
      console.log('[Sunucu] Kapatıldı.');
      process.exit(0);
    });
  }
}

const server = new PaintServer();
server.start();
