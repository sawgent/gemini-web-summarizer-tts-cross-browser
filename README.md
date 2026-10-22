# Gemini Summarizer (Tüm Tarayıcılar İçin Evrensel Sürüm)

Microsoft Edge, Google Chrome, Opera, Brave, Vivaldi ve Mozilla Firefox ile uyumlu; seçtiğiniz metni veya aktif web sayfasını **doğrudan kendi Google Gemini hesabınız** üzerinden özetleyen tarayıcı eklentisidir.

---

## 🌟 Öne Çıkan Özellikler

1. **Evrensel Tarayıcı Desteği:**
   - **Microsoft Edge, Google Chrome, Brave, Vivaldi:** Manifest V3 ve `chrome.sidePanel` API'si ile tam entegre çalışır.
   - **Opera:** Chromium tabanlı olduğu için hem araç çubuğundan hem de sayfa içi pencere olarak sorunsuz çalışır.
   - **Mozilla Firefox:** `sidebarAction` desteği ve evrensel `browser` API sarmalayıcısı ile çalışır.
2. **Sıfır Dış Bağlantı ve Tam Gizlilik:**
   - Hiçbir üçüncü parti sunucu, ara vekil (proxy), veri toplayıcı veya harici API anahtarı barındırmaz.
   - Tüm istekler tarayıcınızın içinden doğrudan şifreli HTTPS ile `https://gemini.google.com` resmi Google servisine gider.
3. **Yeni Sekme Açmaz:**
   - İşlemler mevcut sekmedeki yan panel veya sayfa içi kayan pencere üzerinden gerçekleşir.
4. **Tarayıcı Çerezleri ile Otomatik Oturum:**
   - Tarayıcınızda Google / Gemini oturumunuz açıksa, eklenti mevcut oturum çerezlerini (`__Secure-1PSID`, `SAPISID` vb.) kullanarak otomatik bağlanır.

---

## 🚀 Tarayıcılara Göre Kurulum Kılavuzu

### 1. Microsoft Edge
1. Adres çubuğuna `edge://extensions` yazın.
2. Sol alttaki **"Geliştirici modu" (Developer mode)** anahtarını açın.
3. **"Paketlenmemiş öğeyi yükle" (Load unpacked)** düğmesine tıklayıp klasörü seçin.

### 2. Google Chrome & Brave & Vivaldi
1. Adres çubuğuna `chrome://extensions` (Brave için `brave://extensions`) yazın.
2. Sağ üst köşedeki **"Geliştirici modu" (Developer mode)** anahtarını açın.
3. Sol üstteki **"Paketlenmemiş öğe yükle" (Load unpacked)** butonuna tıklayıp klasörü seçin.

### 3. Opera
1. Adres çubuğuna `opera://extensions` yazın.
2. Sağ üstteki **"Developer mode" (Geliştirici modu)** anahtarını açın.
3. **"Load unpacked"** butonuna basarak klasörü seçin.

### 4. Mozilla Firefox
1. Klasör içerisindeki `manifest.firefox.json` dosyasının adını `manifest.json` yapın (veya mevcut `manifest.json`'un yedeğini alıp değiştirin).
2. Firefox'u açıp adres çubuğuna `about:debugging#/runtime/this-firefox` yazın.
3. **"Geçici Eklenti Yükle..." (Load Temporary Add-on...)** butonuna tıklayın ve klasördeki `manifest.json` dosyasını seçin.

---

## 💡 Kullanım

- **Sayfa Üzerinde:** Bir metin seçtiğinizde hemen yanında beliren **"Özetle"** butonuna tıklayın.
- **Yan Panel / Kenar Çubuğu:** Tarayıcı araç çubuğundaki eklenti simgesine tıklayın veya sağ tıklayıp **"Gemini: Yan Panelde Özetle"** seçeneğini seçin.
- **Tüm Sayfa:** Yan panelden **"Tüm Sayfa"** sekmesine geçerek tek tıkla tüm sayfayı tarayıp özetleyebilirsiniz.
