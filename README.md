# MultiUserPaint — Çok Kullanıcılı Resim Çizme Uygulaması

Bu proje, birden fazla kullanıcının eş zamanlı olarak bir resim tuvali üzerinde ortaklaşa çizim ve düzenleme yapabilmesini sağlayan bir **Masaüstü Resim Düzenleyici** uygulamasıdır. 

Proje, **Ağ İletişimi** dersi kapsamında geliştirilmiş olup, tamamen **yalın TCP soket mimarisi (raw socket programming)** ve asenkron, olay güdümlü (**NonBlocking**) sunucu yaklaşımı ile kodlanmıştır.

---

## 🚀 Proje Mimarisi

*   **Sunucu (Server):** Node.js `net` modülü (Event-Driven & NonBlocking)
*   **İstemci (Client):** Electron (HTML5 Canvas + CSS3 + Javascript Renderer)
*   **Protokol:** FTP benzeri Özel TCP Protokolü (`[4-Byte Uzunluk Başlığı] + [JSON Gövde]`)
*   **Bağımlılık Durumu:** Soket haberleşmesinde 3. parti hiçbir kütüphane (Socket.io, gRPC vb.) **kullanılmamıştır**.

---

## 🛠️ Kurulum ve Başlatma Rehberi

Sistemdeki olası PowerShell güvenlik kısıtlamalarını (Script çalıştırma engellerini) aşmak amacıyla, komutlar doğrudan `node` ve `npx` aracılığıyla çalıştırılacak şekilde yapılandırılmıştır.

### Adım 1: İstemci (Client) Bağımlılıklarını Yükleme
Masaüstü arayüzünü (Electron) bilgisayarınıza kurmak için terminalinizde şu komutları sırasıyla çalıştırın:
1. Bir komut satırı (CMD veya PowerShell) açın ve `client` klasörüne gidin:
   ```bash
   cd client
   ```
2. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```

---

### Adım 2: Sunucuyu (Server) Başlatma
Sunucuyu doğrudan Node.js ile çalıştırarak başlatın:
1. **Yeni bir komut satırı penceresi** açın ve `server` klasörüne gidin:
   ```bash
   cd server
   ```
2. Sunucuyu doğrudan Node.js motoruyla ayağa kaldırın:
   ```bash
   node index.js
   ```
   *Ekranda `dinleniyor: 0.0.0.0:5000` yazısını gördüğünüzde sunucu hazır demektir.*

---

### Adım 3: İstemcileri (Arayüzü) Çalıştırma
Masaüstü uygulamasını çalıştırmak için:
1. Adım 1'de kullandığınız terminal penceresine (yani `client` konumundaki pencereye) geri dönün.
2. Arayüzü şu komutla başlatın:
   ```bash
   npx electron .
   ```
   *Uygulama penceresi başarıyla açılacaktır.*

---

## 👥 Çok Kullanıcılı Test Senaryosu

Çok kullanıcılı eş zamanlı çizim sistemini test etmek için aynı bilgisayarda birden fazla istemci açabilirsiniz:

1. `client` klasörü konumunda **yeni bir terminal penceresi daha açın** ve tekrar şu komutu çalıştırın:
   ```bash
   npx electron .
   ```
   *Böylece ekranınızda iki adet bağımsız masaüstü penceresi açılmış olacaktır.*

2. **Birinci Pencerede:**
   * Sunucu Adresi: `localhost`
   * Port: `5000`
   * Kullanıcı Adı: `Zubeyir` yazıp **Bağlan** deyin.
   * **Yeni Dosya** butonuna basarak bir tuval oluşturun ve üzerine çift tıklayıp açın.

3. **İkinci Pencerede:**
   * Sunucu Adresi: `localhost`
   * Port: `5000`
   * Kullanıcı Adı: `Ali` yazıp **Bağlan** deyin.
   * Dosya listesinde `Zubeyir`'in oluşturduğu dosyayı göreceksiniz. Dosyaya tıklayarak düzenleme moduna girin.

4. **Sonuç:** Pencerelerden birinde yaptığınız çizimler, katman ekleme/çıkarma, kesme/silme işlemleri **anlık ve kayıpsız olarak** diğer kullanıcının ekranında da belirecektir. Sunucu üzerindeki dosyalar her 30 saniyede bir otomatik olarak `server/storage` klasörüne JSON formatında kaydedilir.

---

## 📄 Proje Klasör Yapısı

```text
├── shared/
│   └── protocol.js         # Ortak mesajlaşma kuralları ve TCP Parser
├── server/
│   ├── index.js            # Ana TCP Sunucusu (Dinleyici)
│   ├── fileManager.js      # Disk CRUD işlemleri ve otomatik kaydetme motoru
│   ├── sessionManager.js   # Aktif kullanıcı ve grup oturumu yönetimi
│   └── storage/            # Otomatik kaydedilen tuval JSON dosyaları
└── client/
    ├── main.js             # Electron Ana Süreci & TCP Soket bağlantısı
    ├── preload.js          # IPC Güvenli Köprü Katmanı
    └── renderer/           # Arayüz dosyaları (HTML, CSS, Çizim motoru)
```
