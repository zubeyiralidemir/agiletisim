// =====================================================
// MultiUserPaint — Ana Uygulama Başlatıcısı (Bootstrap)
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
  // 1. UI Olaylarını Başlat
  initUI();

  // 2. Canvas Motorunu Başlat
  initCanvas();

  // 3. Sunucu İletişimini Hazırla
  initConnection();

  // 4. Giriş Ekranı Olayları
  const connectBtn = document.getElementById('btn-connect');
  const hostInput = document.getElementById('input-host');
  const portInput = document.getElementById('input-port');
  const usernameInput = document.getElementById('input-username');

  // Butona tıklama
  connectBtn.addEventListener('click', connectToServer);

  // Enter tuşu ile bağlanma
  const onEnterKey = (e) => {
    if (e.key === 'Enter') {
      connectToServer();
    }
  };

  hostInput.addEventListener('keypress', onEnterKey);
  portInput.addEventListener('keypress', onEnterKey);
  usernameInput.addEventListener('keypress', onEnterKey);

  // Uygulama yüklendiğinde kullanıcı adı girişine odaklan
  usernameInput.focus();
});
