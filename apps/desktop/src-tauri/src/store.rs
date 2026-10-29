//! Kayıtlar ve ayarlar dosyada (Tur 66).
//!
//! Tauri'den bağımsız: her işlev bir kök dizin alıyor, birim testleri geçici
//! bir dizinde koşuyor. Kök, uygulamanın veri dizini
//! (`com.conforcus.capitalforge`):
//!
//! - `saves/slot-N.json`: kayıt slotları, oyunun kendi biçimi
//!   (`{ meta, state }`, `packages/persistence`);
//! - `profile/<anahtar>`: arayüzün küçük kayıtları (ayarlar, kariyer,
//!   senaryo yıldızları, rehber, dil, görünüm, lig hesabı), anahtar
//!   `localStorage`'dakiyle aynı.
//!
//! Her yazma önce yanına bir geçici dosyaya, sonra yerine taşınarak: oyun
//! yazma sırasında kapanırsa eski kayıt sağlam kalıyor. Steam Cloud bu iki
//! dizini olduğu gibi eşitleyebiliyor.

use std::collections::BTreeMap;
use std::fmt;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use serde::Deserialize;
use serde_json::Value;

/// `packages/persistence` → `MAX_SLOTS` ile aynı (0 otomatik kayıt).
pub const MAX_SLOTS: u32 = 6;
/// Büyük bir şehir birkaç megabayt; sınır bozuk bir isteğe karşı.
const MAX_SAVE_BYTES: usize = 64 * 1024 * 1024;
const MAX_PROFILE_BYTES: usize = 8 * 1024 * 1024;
const MAX_EXPORT_BYTES: usize = 64 * 1024 * 1024;
const PROFILE_PREFIX: &str = "capitalforge.";

#[derive(Debug)]
pub enum StoreError {
    BadSlot(u32),
    BadKey,
    BadName,
    TooLarge,
    NotSave,
    Io(io::Error),
}

impl fmt::Display for StoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            StoreError::BadSlot(slot) => write!(f, "geçersiz slot: {slot}"),
            StoreError::BadKey => write!(f, "geçersiz ayar anahtarı"),
            StoreError::BadName => write!(f, "geçersiz dosya adı"),
            StoreError::TooLarge => write!(f, "dosya çok büyük"),
            StoreError::NotSave => write!(f, "kayıt değil: {{ meta, state }} bekleniyordu"),
            StoreError::Io(error) => write!(f, "{error}"),
        }
    }
}

impl From<io::Error> for StoreError {
    fn from(error: io::Error) -> Self {
        StoreError::Io(error)
    }
}

pub type Result<T> = std::result::Result<T, StoreError>;

/// Önce yanına, sonra yerine: yarım yazılmış dosya hiçbir zaman asıl adı
/// taşımıyor. Geçici dosya noktayla başlıyor: Steam Cloud'un desenlerine
/// (`*.json`, `capitalforge.*`) girmiyor.
pub(crate) fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let dir = path.parent().expect("dosyanın bir dizini var");
    fs::create_dir_all(dir)?;
    let name = path.file_name().expect("dosyanın bir adı var").to_string_lossy();
    let tmp = dir.join(format!(".{name}.tmp"));
    {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
    }
    fs::rename(&tmp, path)
}

fn read_optional(path: &Path) -> io::Result<Option<Vec<u8>>> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

fn remove_optional(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Err(error) if error.kind() != io::ErrorKind::NotFound => Err(error),
        _ => Ok(()),
    }
}

// ------------------------------------------------------------ Kayıtlar

fn slot_path(root: &Path, slot: u32) -> Result<PathBuf> {
    if slot >= MAX_SLOTS {
        return Err(StoreError::BadSlot(slot));
    }
    Ok(root.join("saves").join(format!("slot-{slot}.json")))
}

/// Listede yalnız künye gerekiyor; `state` okunurken ayrıştırılmadan atlanıyor.
#[derive(Deserialize)]
struct Head {
    meta: Value,
}

pub fn save_write(root: &Path, slot: u32, bytes: &[u8]) -> Result<()> {
    let path = slot_path(root, slot)?;
    if bytes.len() > MAX_SAVE_BYTES {
        return Err(StoreError::TooLarge);
    }
    // Bozuk ya da yarım bir istek eski, sağlam kaydın üstüne yazılmasın.
    let record: Value = serde_json::from_slice(bytes).map_err(|_| StoreError::NotSave)?;
    if !record.get("meta").is_some_and(Value::is_object) || !record.get("state").is_some_and(Value::is_object) {
        return Err(StoreError::NotSave);
    }
    Ok(write_atomic(&path, bytes)?)
}

pub fn save_read(root: &Path, slot: u32) -> Result<Option<Vec<u8>>> {
    Ok(read_optional(&slot_path(root, slot)?)?)
}

/// Slotların künyeleri, slot sırasıyla; okunamayan ya da bozuk dosya listede yok.
pub fn save_list(root: &Path) -> Vec<Value> {
    (0..MAX_SLOTS)
        .filter_map(|slot| {
            let bytes = fs::read(slot_path(root, slot).ok()?).ok()?;
            let head: Head = serde_json::from_slice(&bytes).ok()?;
            head.meta.is_object().then_some(head.meta)
        })
        .collect()
}

pub fn save_remove(root: &Path, slot: u32) -> Result<()> {
    Ok(remove_optional(&slot_path(root, slot)?)?)
}

// ------------------------------------------------------------- Ayarlar

/// `apps/web/src/desktop/profile.ts` → `isProfileKey` ile aynı kural.
pub fn valid_key(key: &str) -> bool {
    key.len() <= 96
        && key.starts_with(PROFILE_PREFIX)
        && !key.ends_with(".tmp")
        && key.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'.' | b'_' | b'-'))
}

fn profile_path(root: &Path, key: &str) -> Result<PathBuf> {
    if !valid_key(key) {
        return Err(StoreError::BadKey);
    }
    Ok(root.join("profile").join(key))
}

pub fn profile_read_all(root: &Path) -> Result<BTreeMap<String, String>> {
    let mut entries = BTreeMap::new();
    let dir = match fs::read_dir(root.join("profile")) {
        Ok(dir) => dir,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(entries),
        Err(error) => return Err(error.into()),
    };
    for entry in dir {
        let entry = entry?;
        let Ok(key) = entry.file_name().into_string() else { continue };
        if !valid_key(&key) || !entry.file_type()?.is_file() {
            continue;
        }
        // UTF-8 olmayan dosya elle bozulmuş demek; yok sayılıyor.
        if let Ok(value) = fs::read_to_string(entry.path()) {
            entries.insert(key, value);
        }
    }
    Ok(entries)
}

pub fn profile_set(root: &Path, key: &str, value: &str) -> Result<()> {
    let path = profile_path(root, key)?;
    if value.len() > MAX_PROFILE_BYTES {
        return Err(StoreError::TooLarge);
    }
    Ok(write_atomic(&path, value.as_bytes())?)
}

pub fn profile_remove(root: &Path, key: &str) -> Result<()> {
    Ok(remove_optional(&profile_path(root, key)?)?)
}

// ------------------------------------------------------- Dışa aktarma

/// Oyunun verdiği adlar ASCII (`fileSlug`, Tur 65); başka bir şey gelmiyor.
pub fn valid_export_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 120
        && !name.starts_with('.')
        && (name.ends_with(".json") || name.ends_with(".png"))
        && name.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-' | b' ' | b'(' | b')'))
}

/// Dışa aktarılan kayıt ve şehir kartı. Aynı ad varsa üstüne yazılmıyor: "ad (2).json".
pub fn export_file(dir: &Path, name: &str, bytes: &[u8]) -> Result<PathBuf> {
    if !valid_export_name(name) {
        return Err(StoreError::BadName);
    }
    if bytes.len() > MAX_EXPORT_BYTES {
        return Err(StoreError::TooLarge);
    }
    fs::create_dir_all(dir)?;
    let (stem, ext) = name.rsplit_once('.').expect("uzantı denetlendi");
    for n in 1..1000 {
        let path = if n == 1 { dir.join(name) } else { dir.join(format!("{stem} ({n}).{ext}")) };
        match fs::OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                file.write_all(bytes)?;
                file.sync_all()?;
                return Ok(path);
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.into()),
        }
    }
    Err(StoreError::Io(io::Error::new(io::ErrorKind::AlreadyExists, "aynı adda çok fazla dosya")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    /// Her test kendi boş dizininde.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new() -> Self {
            static NEXT: AtomicU32 = AtomicU32::new(0);
            let dir = std::env::temp_dir().join(format!(
                "capitalforge-store-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            TempDir(dir)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn record(slot: u32, day: u32) -> Vec<u8> {
        format!(r#"{{"meta":{{"slot":{slot},"name":"Kayıt","day":{day}}},"state":{{"time":{{"day":{day}}},"map":{{"tiles":[1,2,3]}}}}}}"#)
            .into_bytes()
    }

    #[test]
    fn kayit_yazilip_okunuyor_liste_yalniz_kunyeler() {
        let dir = TempDir::new();
        assert!(save_list(&dir.0).is_empty());
        assert_eq!(save_read(&dir.0, 2).unwrap(), None);

        save_write(&dir.0, 2, &record(2, 40)).unwrap();
        save_write(&dir.0, 0, &record(0, 41)).unwrap();
        assert_eq!(save_read(&dir.0, 2).unwrap().unwrap(), record(2, 40));
        assert!(dir.0.join("saves/slot-2.json").is_file());

        let list = save_list(&dir.0);
        assert_eq!(list.len(), 2);
        assert_eq!(list[0]["slot"], 0);
        assert_eq!(list[1]["day"], 40);
        assert!(list[0].get("state").is_none());

        // Üstüne yazma ve silme; olmayanı silmek hata değil.
        save_write(&dir.0, 2, &record(2, 90)).unwrap();
        assert_eq!(save_list(&dir.0)[1]["day"], 90);
        save_remove(&dir.0, 2).unwrap();
        save_remove(&dir.0, 2).unwrap();
        assert_eq!(save_read(&dir.0, 2).unwrap(), None);
        // Geçici dosya kalmıyor.
        let left: Vec<_> = fs::read_dir(dir.0.join("saves")).unwrap().map(|e| e.unwrap().file_name()).collect();
        assert_eq!(left, vec![std::ffi::OsString::from("slot-0.json")]);
    }

    #[test]
    fn bozuk_istek_saglam_kaydin_ustune_yazilmiyor() {
        let dir = TempDir::new();
        save_write(&dir.0, 1, &record(1, 7)).unwrap();
        for bad in [&b"{\"meta\":{"[..], b"[]", b"{\"meta\":{}}", b"{\"state\":{}}", b"{\"meta\":1,\"state\":{}}"] {
            assert!(matches!(save_write(&dir.0, 1, bad), Err(StoreError::NotSave)), "{}", String::from_utf8_lossy(bad));
        }
        assert_eq!(save_read(&dir.0, 1).unwrap().unwrap(), record(1, 7));
        assert!(matches!(save_write(&dir.0, MAX_SLOTS, &record(6, 1)), Err(StoreError::BadSlot(6))));
        assert!(matches!(save_read(&dir.0, 99), Err(StoreError::BadSlot(99))));
    }

    #[test]
    fn listede_bozuk_dosya_atlaniyor() {
        let dir = TempDir::new();
        save_write(&dir.0, 3, &record(3, 12)).unwrap();
        fs::write(dir.0.join("saves/slot-4.json"), b"{ yarim").unwrap();
        fs::write(dir.0.join("saves/slot-5.json"), b"{\"meta\":\"x\",\"state\":{}}").unwrap();
        let list = save_list(&dir.0);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0]["slot"], 3);
    }

    #[test]
    fn ayarlar_anahtar_basina_bir_dosya() {
        let dir = TempDir::new();
        assert!(profile_read_all(&dir.0).unwrap().is_empty());
        profile_set(&dir.0, "capitalforge.settings.v1", "{\"muted\":true}").unwrap();
        profile_set(&dir.0, "capitalforge.locale", "en").unwrap();
        profile_set(&dir.0, "capitalforge.locale", "tr").unwrap();
        // Elle bırakılmış yabancı ve yarım dosyalar okunmuyor.
        fs::write(dir.0.join("profile/notlar.txt"), "x").unwrap();
        fs::write(dir.0.join("profile/capitalforge.career.v1.tmp"), "x").unwrap();

        let all = profile_read_all(&dir.0).unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all["capitalforge.locale"], "tr");
        assert_eq!(all["capitalforge.settings.v1"], "{\"muted\":true}");

        profile_remove(&dir.0, "capitalforge.locale").unwrap();
        profile_remove(&dir.0, "capitalforge.locale").unwrap();
        assert_eq!(profile_read_all(&dir.0).unwrap().len(), 1);
    }

    #[test]
    fn ayar_anahtari_dizinden_cikamiyor() {
        let dir = TempDir::new();
        for key in ["../capitalforge.x", "capitalforge./../x", "capitalforge.a\\b", "settings", "capitalforge.A", "capitalforge.x.tmp", ""] {
            assert!(!valid_key(key), "{key}");
            assert!(matches!(profile_set(&dir.0, key, "x"), Err(StoreError::BadKey)), "{key}");
        }
        assert!(valid_key("capitalforge.league.pending"));
        assert!(!dir.0.join("x").exists());
    }

    #[test]
    fn disa_aktarma_ustune_yazmiyor() {
        let dir = TempDir::new();
        let out = dir.0.join("Downloads");
        let first = export_file(&out, "capitalforge-Karaca-Holding-gun2.json", b"{}").unwrap();
        let second = export_file(&out, "capitalforge-Karaca-Holding-gun2.json", b"{\"b\":1}").unwrap();
        let third = export_file(&out, "capitalforge-Karaca-Holding-gun2.json", b"{\"c\":1}").unwrap();
        assert_eq!(first.file_name().unwrap(), "capitalforge-Karaca-Holding-gun2.json");
        assert_eq!(second.file_name().unwrap(), "capitalforge-Karaca-Holding-gun2 (2).json");
        assert_eq!(third.file_name().unwrap(), "capitalforge-Karaca-Holding-gun2 (3).json");
        assert_eq!(fs::read(&first).unwrap(), b"{}");

        for name in ["../x.json", "a/b.json", ".gizli.json", "kart.exe", "Karaca Hölding.json", ""] {
            assert!(matches!(export_file(&out, name, b"{}"), Err(StoreError::BadName)), "{name}");
        }
        assert!(export_file(&out, "kart.png", b"\x89PNG").is_ok());
    }
}
