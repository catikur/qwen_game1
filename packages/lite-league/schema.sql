-- CapitalForge Lite lig sunucusu (Cloudflare D1, SQLite).
-- Kurulum: .github/workflows/lite-league.yml bunu uzak veritabanına uyguluyor.

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  -- 0 Bronz, 1 Gümüş, 2 Altın, 3 Elmas.
  division INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Oyuncunun o haftaki son kabul edilen gönderimi.
CREATE TABLE IF NOT EXISTS reports (
  player_id TEXT NOT NULL,
  week TEXT NOT NULL,
  score REAL NOT NULL,
  city INTEGER NOT NULL,
  stars INTEGER NOT NULL,
  city_earned REAL NOT NULL,
  levels TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (player_id, week)
);

-- Haftalık gruplar: bölüm başına 30 kişilik.
CREATE TABLE IF NOT EXISTS groups (
  week TEXT NOT NULL,
  player_id TEXT NOT NULL,
  division INTEGER NOT NULL,
  group_no INTEGER NOT NULL,
  PRIMARY KEY (week, player_id)
);
CREATE INDEX IF NOT EXISTS groups_by_group ON groups (week, division, group_no);

-- Davet kodlu özel ligler.
CREATE TABLE IF NOT EXISTS leagues (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS league_members (
  code TEXT NOT NULL,
  player_id TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (code, player_id)
);
CREATE INDEX IF NOT EXISTS members_by_player ON league_members (player_id);

-- Hafta sonu bölüm değişimi bir kez yapılıyor.
CREATE TABLE IF NOT EXISTS rollovers (
  week TEXT PRIMARY KEY,
  at INTEGER NOT NULL
);

-- Reddedilen gönderimler (inceleme için).
CREATE TABLE IF NOT EXISTS rejects (
  player_id TEXT NOT NULL,
  week TEXT NOT NULL,
  reason TEXT NOT NULL,
  at INTEGER NOT NULL
);

-- App Attest: oyuncunun kanıtlanmış cihaz anahtarı (onaylar bununla doğrulanıyor).
CREATE TABLE IF NOT EXISTS attest_keys (
  key_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  -- SubjectPublicKeyInfo (base64).
  public_key TEXT NOT NULL,
  -- production | development
  environment TEXT NOT NULL,
  -- Son onayın sayacı: sonraki daha büyük olmalı.
  counter INTEGER NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS attest_keys_by_player ON attest_keys (player_id);

-- Kanıt için tek seferlik challenge (30 dakika; Apple'a ulaşılamazsa uygulama aynısıyla yeniden deniyor).
CREATE TABLE IF NOT EXISTS attest_challenges (
  player_id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- L10: bir hesabın cihazları (web, Android, taşınan iOS). İlk cihazın token'ı
-- players.token_hash'te de duruyor (eski iOS hesaplarının burada satırı yok).
CREATE TABLE IF NOT EXISTS tokens (
  token_hash TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  -- ios | web | android
  platform TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tokens_by_player ON tokens (player_id);

-- L10: sunucu yetkili kayıt (src/saves.ts).
CREATE TABLE IF NOT EXISTS saves (
  player_id TEXT PRIMARY KEY,
  -- İyimser kilit: her eşitlemede bir artıyor.
  version INTEGER NOT NULL,
  -- LiteState (JSON).
  state TEXT NOT NULL,
  -- Günlüğün kullandığı gerçek zaman (ms): sunucunun saatini geçemiyor.
  cursor INTEGER NOT NULL,
  -- Son uygulanan gönderimin kimliği (yanıtı kaybolan tekrar edilirse).
  batch TEXT,
  at INTEGER NOT NULL
);

-- L10: genel yıldız tablosu (bütün platformlar) ve tablolardaki platform işareti.
CREATE TABLE IF NOT EXISTS profiles (
  player_id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  stars INTEGER NOT NULL,
  city INTEGER NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS profiles_by_stars ON profiles (stars);

-- L10: başka cihaza taşıma kodu (tek seferlik, 10 dakika).
CREATE TABLE IF NOT EXISTS links (
  code TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS links_by_player ON links (player_id);

-- Tur 51: ana oyunun Tohum Ligi koşuları (`src/seed.ts`). Oyuncu başına haftada
-- tek satır: en iyisi. Hesap `players` + `tokens` (platform `capital`).
CREATE TABLE IF NOT EXISTS seed_runs (
  player_id TEXT NOT NULL,
  week TEXT NOT NULL,
  -- Satırın herkese görünen kimliği (oyuncunun kimliği gösterilmiyor); koşu iyileşse de aynı.
  id TEXT NOT NULL UNIQUE,
  company TEXT NOT NULL,
  ceo TEXT,
  score REAL NOT NULL,
  -- Net değer eğrisi (JSON).
  curve TEXT NOT NULL,
  -- Koşu kodu (CF1.…) ve SHA-256 özeti: tablo özeti veriyor, kod ayrı uçtan iniyor.
  code TEXT NOT NULL,
  code_key TEXT NOT NULL,
  -- Satırdaki koşunun sunucu saati (eşit skorda önce gönderen).
  at INTEGER NOT NULL,
  -- Son gönderim denemesi, daha kötüsü de: aynı hesaptan iki gönderim arası
  -- aralık bununla (satırın saati `at` ileri alınmasın).
  tried_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, week)
);
CREATE INDEX IF NOT EXISTS seed_runs_by_week ON seed_runs (week, score DESC, at);
CREATE INDEX IF NOT EXISTS seed_runs_by_code ON seed_runs (code_key);

-- Tur 51: IP başına saatlik sayaç. Anahtar IP ile saatin özeti; bir saatten
-- eskisi her yazımda siliniyor.
CREATE TABLE IF NOT EXISTS seed_limits (
  key TEXT PRIMARY KEY,
  hour INTEGER NOT NULL,
  count INTEGER NOT NULL
);
