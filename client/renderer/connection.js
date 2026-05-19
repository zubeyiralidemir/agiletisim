// =====================================================
// MultiUserPaint — Bağlantı ve Mesaj Yönetimi
// =====================================================

const AppState = {
  connected: false,
  username: '',
  userId: '',
  currentFileId: null,
  currentFile: null,
  activeLayerId: null,
  users: [],
  files: [],
  clipboard: null,
  zoom: 1,
};

const UserColors = [
  '#6366f1','#ec4899','#22c55e','#f97316','#eab308',
  '#3b82f6','#8b5cf6','#ef4444','#14b8a6','#f43f5e'
];

function getUserColor(username) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
  return UserColors[Math.abs(hash) % UserColors.length];
}

// Sunucu mesaj dinleyicisi
function initConnection() {
  window.api.onServerMessage((msg) => {
    handleServerMessage(msg);
  });

  window.api.onConnectionLost(() => {
    AppState.connected = false;
    showScreen('login');
    showLoginError('Sunucu bağlantısı koptu!');
  });
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'FILE_CREATE_ACK':
      refreshFileList();
      if (msg.file) openFileById(msg.file.fileId);
      break;
    case 'FILE_LIST_RES':
      AppState.files = msg.files || [];
      renderFileList();
      break;
    case 'FILE_OPEN_ACK':
      onFileOpened(msg.file);
      break;
    case 'FILE_CLOSE_ACK':
      onFileClosed(msg.fileId);
      break;
    case 'FILE_NOTIFY':
      refreshFileList();
      break;
    case 'DRAW_BROADCAST':
      onRemoteDraw(msg);
      break;
    case 'CANVAS_CLEAR_BROADCAST':
      onRemoteClear(msg);
      break;
    case 'CUT_BROADCAST':
      onRemoteCut(msg);
      break;
    case 'PASTE_BROADCAST':
      onRemotePaste(msg);
      break;
    case 'LAYER_ADD_ACK':
    case 'LAYER_REMOVE_ACK':
    case 'LAYER_UPDATE':
      onLayerUpdate(msg);
      break;
    case 'USER_LIST':
      AppState.users = msg.users || [];
      renderUserList();
      break;
    case 'USER_JOIN':
    case 'USER_LEAVE':
      refreshFileList();
      break;
    case 'FILE_SAVE_ACK':
      flashSaveStatus();
      break;
    case 'ERROR':
      console.error('[Sunucu Hatası]', msg.message);
      break;
    case 'HEARTBEAT':
      break;
    default:
      console.log('[Mesaj]', msg.type, msg);
  }
}

async function connectToServer() {
  const host = document.getElementById('input-host').value.trim();
  const port = document.getElementById('input-port').value.trim();
  const username = document.getElementById('input-username').value.trim();

  if (!username) { showLoginError('Kullanıcı adı girin'); return; }
  if (!host) { showLoginError('Sunucu adresi girin'); return; }

  const btn = document.getElementById('btn-connect');
  btn.querySelector('.btn-text').style.display = 'none';
  btn.querySelector('.btn-loader').style.display = 'inline';
  btn.disabled = true;
  hideLoginError();

  try {
    const result = await window.api.connect(host, port, username);
    if (result.success) {
      AppState.connected = true;
      AppState.username = username;
      AppState.userId = result.userId;
      document.getElementById('username-display').textContent = username;
      showScreen('app');
      refreshFileList();
    } else {
      showLoginError(result.reason || 'Bağlantı başarısız');
    }
  } catch (err) {
    showLoginError(String(err));
  } finally {
    btn.querySelector('.btn-text').style.display = 'inline';
    btn.querySelector('.btn-loader').style.display = 'none';
    btn.disabled = false;
  }
}

async function disconnectFromServer() {
  await window.api.disconnect();
  AppState.connected = false;
  AppState.currentFileId = null;
  AppState.currentFile = null;
  showScreen('login');
}

function refreshFileList() {
  window.api.fileList();
}

function openFileById(fileId) {
  window.api.fileOpen(fileId);
}

// UI Helpers
function showScreen(name) {
  document.getElementById('login-screen').classList.toggle('active', name === 'login');
  document.getElementById('app-screen').classList.toggle('active', name === 'app');
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function hideLoginError() {
  document.getElementById('login-error').style.display = 'none';
}

function flashSaveStatus() {
  const el = document.getElementById('auto-save-status');
  el.textContent = '💾 Kaydedildi!';
  setTimeout(() => { el.textContent = '💾 Otomatik kaydetme aktif'; }, 2000);
}
