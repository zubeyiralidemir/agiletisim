'use strict';

// =====================================================
// Oturum Yöneticisi (Session Manager)
// Bağlı istemcilerin oturum bilgilerini yönetir
// =====================================================

const { generateId } = require('../shared/protocol');

class SessionManager {
  constructor() {
    // socket -> session bilgisi eşlemesi
    this.sessions = new Map();
    // username -> socket eşlemesi (benzersizlik kontrolü için)
    this.usernameMap = new Map();
  }

  /**
   * Yeni kullanıcı kaydı
   * @param {net.Socket} socket - TCP soket bağlantısı
   * @param {string} username - Kullanıcı adı
   * @returns {{ success: boolean, userId?: string, reason?: string }}
   */
  registerUser(socket, username) {
    // Kullanıcı adı zaten kullanılıyor mu?
    if (this.usernameMap.has(username)) {
      return { success: false, reason: 'Kullanıcı adı zaten kullanılıyor' };
    }

    // Kullanıcı adı boş mu?
    if (!username || username.trim().length === 0) {
      return { success: false, reason: 'Kullanıcı adı boş olamaz' };
    }

    // Kullanıcı adı çok uzun mu?
    if (username.length > 30) {
      return { success: false, reason: 'Kullanıcı adı en fazla 30 karakter olabilir' };
    }

    // Kullanıcı adı çok kısa mı?
    if (username.length < 4) {
      return { success: false, reason: 'Kullanıcı adı en az 4 karakter olmalıdır.' };
    }

    const userId = generateId();
    const session = {
      userId,
      username: username.trim(),
      connectedAt: Date.now(),
      openFiles: new Set(), // Açık dosya ID'leri
    };

    this.sessions.set(socket, session);
    this.usernameMap.set(username, socket);

    console.log(`[Session] Kullanıcı bağlandı: ${username} (${userId})`);
    return { success: true, userId };
  }

  /**
   * Kullanıcı çıkışı
   * @param {net.Socket} socket
   * @returns {object|null} Çıkan kullanıcının oturum bilgisi
   */
  removeUser(socket) {
    const session = this.sessions.get(socket);
    if (!session) return null;

    this.usernameMap.delete(session.username);
    this.sessions.delete(socket);

    console.log(`[Session] Kullanıcı ayrıldı: ${session.username}`);
    return session;
  }

  /**
   * Soket'e ait oturum bilgisini döndürür
   * @param {net.Socket} socket
   * @returns {object|null}
   */
  getSession(socket) {
    return this.sessions.get(socket) || null;
  }

  /**
   * Kullanıcı adıyla soket bul
   * @param {string} username
   * @returns {net.Socket|null}
   */
  getSocketByUsername(username) {
    return this.usernameMap.get(username) || null;
  }

  /**
   * Kullanıcının dosya açmasını kaydet
   * @param {net.Socket} socket
   * @param {string} fileId
   */
  openFile(socket, fileId) {
    const session = this.sessions.get(socket);
    if (session) {
      session.openFiles.add(fileId);
    }
  }

  /**
   * Kullanıcının dosya kapatmasını kaydet
   * @param {net.Socket} socket
   * @param {string} fileId
   */
  closeFile(socket, fileId) {
    const session = this.sessions.get(socket);
    if (session) {
      session.openFiles.delete(fileId);
    }
  }

  /**
   * Belirli bir dosyayı açmış olan tüm soketleri döndür
   * @param {string} fileId
   * @param {net.Socket} [excludeSocket] - Hariç tutulacak soket
   * @returns {net.Socket[]}
   */
  getSocketsEditingFile(fileId, excludeSocket = null) {
    const sockets = [];
    for (const [socket, session] of this.sessions) {
      if (session.openFiles.has(fileId) && socket !== excludeSocket) {
        sockets.push(socket);
      }
    }
    return sockets;
  }

  /**
   * Tüm bağlı soketleri döndür
   * @param {net.Socket} [excludeSocket]
   * @returns {net.Socket[]}
   */
  getAllSockets(excludeSocket = null) {
    const sockets = [];
    for (const [socket] of this.sessions) {
      if (socket !== excludeSocket) {
        sockets.push(socket);
      }
    }
    return sockets;
  }

  /**
   * Tüm kullanıcı bilgilerini liste olarak döndür
   * @returns {Array<{userId: string, username: string}>}
   */
  getUserList() {
    const users = [];
    for (const session of this.sessions.values()) {
      users.push({
        userId: session.userId,
        username: session.username,
      });
    }
    return users;
  }

  /**
   * Bağlı kullanıcı sayısı
   */
  get count() {
    return this.sessions.size;
  }
}

module.exports = SessionManager;
