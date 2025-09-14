# 🚗⚡ EV Problem Tracker

Modern elektrikli araç sorun takip sistemi. Kullanıcılar EV araçlarında karşılaştıkları problemleri detaylı konum işaretleme ile raporlayabilir ve toplulukla paylaşabilir.

## ✨ Özellikler

### 🎯 Konum İşaretleme Sistemi
- **6 Farklı Araç Görünümü**: Dış (Ön/Sağ/Sol/Arka) + İç (Ön/Arka)
- **Kategoriye Özel Noktalar**: Far, Tampon, Direksiyon, vb.
- **Modern Modal Görünüm**: Her görünüm ayrı resim ve noktalarıyla
- **Persistent State**: Görünüm değiştirince noktalar kaybolmaz

### 📱 Kullanıcı Deneyimi
- **Responsive Design**: Mobil ve desktop uyumlu
- **Real-time Updates**: Canlı bildirimler
- **Filtreleme**: Marka, model, durum bazında
- **Takip Sistemi**: Problemleri takip etme

### 🔧 Teknik Özellikler
- **Node.js + Express** backend
- **SQLite** veritabanı
- **Vanilla JavaScript** frontend
- **Modern UI/UX** tasarım
- **Multi-view State Management**

## 🚀 Kurulum

### Gereksinimler
- Node.js 14+
- npm veya yarn

### Lokal Çalıştırma
```bash
# Repository'yi klonla
git clone https://github.com/[username]/ev-problem-tracker.git
cd ev-problem-tracker

# Bağımlılıkları yükle
npm install

# Veritabanını başlat
npm run init:db

# Geliştirme sunucusunu başlat
npm run dev
```

Uygulama `http://localhost:3000` adresinde çalışacak.

## 🏗️ Production Deployment

### Railway (Önerilen)
1. GitHub'a push edin
2. [Railway.app](https://railway.app) hesabı oluşturun
3. GitHub repo'yu bağlayın
4. Otomatik deploy! 🎉

### Diğer Platformlar
- **Heroku**: `npm start` script'i mevcut
- **DigitalOcean**: PM2 ile production ready
- **Render**: Zero-config deployment

## 📁 Proje Yapısı

```
ev-problem-tracker/
├── server/
│   ├── index.js          # Ana server dosyası
│   └── db/
│       ├── init.js       # Veritabanı şeması
│       └── ev_problems.sqlite
├── public/
│   ├── index.html        # Ana sayfa
│   ├── css/styles.css    # Stil dosyaları
│   ├── js/app.js         # Frontend JavaScript
│   └── img/              # Araç görünüm resimleri
└── package.json
```

## 🎨 Araç Görünümleri

Sistem şu araç görünümlerini destekler:
- **Dış Kısım**: Ön, Sağ, Sol, Arka
- **İç Kısım**: Ön Panel, Arka Kısım

Her görünüm için özel kategoriler:
- **Dış**: Far, Tampon, Kapı, Ayna, Tekerlek, vb.
- **İç**: Direksiyon, Ekran, Koltuk, Pedallar, vb.

## 🤝 Katkıda Bulunma

1. Fork edin
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit edin (`git commit -m 'Add amazing feature'`)
4. Push edin (`git push origin feature/amazing-feature`)
5. Pull Request açın

## 📝 Lisans

MIT License

## 🚗 Demo

[Live Demo] - Canlı demo yakında!

---

**EV Problem Tracker** - Elektrikli araç topluluğu için modern sorun takip sistemi 🔋
