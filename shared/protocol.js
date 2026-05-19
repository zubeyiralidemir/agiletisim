'use strict';

// =====================================================
// MultiUserPaint — Paylaşılan Protokol Modülü
// TCP üzerinden mesaj çerçeveleme ve ayrıştırma
// =====================================================

/**
 * Mesaj Tipleri — Protokoldeki tüm komutlar
 */
const MessageType = {
  // --- Bağlantı Yönetimi ---
  CONNECT:        'CONNECT',
  CONNECT_ACK:    'CONNECT_ACK',
  CONNECT_REJECT: 'CONNECT_REJECT',
  DISCONNECT:     'DISCONNECT',
  DISCONNECT_ACK: 'DISCONNECT_ACK',

  // --- Dosya Yönetimi ---
  FILE_CREATE:     'FILE_CREATE',
  FILE_CREATE_ACK: 'FILE_CREATE_ACK',
  FILE_LIST_REQ:   'FILE_LIST_REQ',
  FILE_LIST_RES:   'FILE_LIST_RES',
  FILE_OPEN:       'FILE_OPEN',
  FILE_OPEN_ACK:   'FILE_OPEN_ACK',
  FILE_CLOSE:      'FILE_CLOSE',
  FILE_CLOSE_ACK:  'FILE_CLOSE_ACK',
  FILE_SHARE:      'FILE_SHARE',
  FILE_SHARE_ACK:  'FILE_SHARE_ACK',
  FILE_NOTIFY:     'FILE_NOTIFY',
  FILE_SAVE_ACK:   'FILE_SAVE_ACK',
  FILE_DELETE:     'FILE_DELETE',
  FILE_DELETE_ACK: 'FILE_DELETE_ACK',

  // --- Çizim İşlemleri ---
  DRAW_ACTION:    'DRAW_ACTION',
  DRAW_BROADCAST: 'DRAW_BROADCAST',
  CANVAS_SYNC:    'CANVAS_SYNC',
  CANVAS_CLEAR:   'CANVAS_CLEAR',
  CANVAS_CLEAR_BROADCAST: 'CANVAS_CLEAR_BROADCAST',

  // --- Pano (Clipboard) İşlemleri ---
  CUT:             'CUT',
  COPY:            'COPY',
  PASTE:           'PASTE',
  CUT_BROADCAST:   'CUT_BROADCAST',
  PASTE_BROADCAST: 'PASTE_BROADCAST',

  // --- Katman Yönetimi ---
  LAYER_ADD:        'LAYER_ADD',
  LAYER_ADD_ACK:    'LAYER_ADD_ACK',
  LAYER_REMOVE:     'LAYER_REMOVE',
  LAYER_REMOVE_ACK: 'LAYER_REMOVE_ACK',
  LAYER_RENAME:     'LAYER_RENAME',
  LAYER_REORDER:    'LAYER_REORDER',
  LAYER_VISIBILITY: 'LAYER_VISIBILITY',
  LAYER_OPACITY:    'LAYER_OPACITY',
  LAYER_UPDATE:     'LAYER_UPDATE',

  // --- Durum ve Hata ---
  ERROR:      'ERROR',
  HEARTBEAT:  'HEARTBEAT',
  USER_LIST:  'USER_LIST',
  USER_JOIN:  'USER_JOIN',
  USER_LEAVE: 'USER_LEAVE',
};

/**
 * TCP Mesaj Çerçeveleme
 * 
 * Her mesaj şu formatta gönderilir:
 *   [4 byte: mesaj uzunluğu (UInt32 Big-Endian)] [N byte: JSON verisi (UTF-8)]
 * 
 * Bu yapı TCP akışında mesaj sınırlarını belirlemeye yarar.
 */

/**
 * Mesaj kodlama — JSON nesnesini TCP çerçeveli Buffer'a dönüştürür
 * @param {string} type - Mesaj tipi (MessageType sabitlerinden)
 * @param {object} data - Mesaj verisi
 * @returns {Buffer} Çerçevelenmiş mesaj
 */
function encode(type, data = {}) {
  const payload = JSON.stringify({ type, ...data });
  const payloadBytes = Buffer.byteLength(payload, 'utf8');
  const frame = Buffer.alloc(4 + payloadBytes);
  frame.writeUInt32BE(payloadBytes, 0);
  frame.write(payload, 4, 'utf8');
  return frame;
}

/**
 * ProtocolParser — TCP akışından mesajları ayıklar
 * 
 * TCP akış tabanlı bir protokol olduğundan, gelen veriler parçalı
 * gelebilir. Bu sınıf verileri tamponlar ve tam mesajlar oluştuğunda
 * callback fonksiyonunu çağırır.
 */
class ProtocolParser {
  constructor() {
    this.buffer = Buffer.alloc(0);
    this.onMessage = null;
  }

  /**
   * TCP'den gelen veriyi tampona ekle ve tam mesajları çıkar
   * @param {Buffer} data - Gelen TCP verisi
   */
  feed(data) {
    this.buffer = Buffer.concat([this.buffer, data]);

    // Tamponda yeterli veri varsa mesajları çıkar
    while (this.buffer.length >= 4) {
      const payloadLength = this.buffer.readUInt32BE(0);

      // Tam mesaj henüz gelmediyse bekle
      if (this.buffer.length < 4 + payloadLength) {
        break;
      }

      // Mesajı çıkar
      const jsonStr = this.buffer.slice(4, 4 + payloadLength).toString('utf8');
      this.buffer = this.buffer.slice(4 + payloadLength);

      try {
        const message = JSON.parse(jsonStr);
        if (this.onMessage) {
          this.onMessage(message);
        }
      } catch (err) {
        // Bozuk mesajı atla
        console.error('[Protocol] Hatalı mesaj:', err.message);
      }
    }
  }

  /**
   * Tamponu sıfırla
   */
  reset() {
    this.buffer = Buffer.alloc(0);
  }
}

/**
 * Basit UUID üretici
 */
function generateId() {
  return 'xxxx-xxxx-xxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  );
}

module.exports = { MessageType, ProtocolParser, encode, generateId };
