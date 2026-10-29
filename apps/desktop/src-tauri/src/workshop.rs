//! Steam Workshop (Tur 73): içerik paketleri (Tur 67) Workshop'tan iniyor ve
//! oraya yükleniyor.
//!
//! Abone olunan öğeleri Steam kendisi indiriyor; kabuk kurulu olanların
//! klasöründeki paket dosyalarını (`*.json`) okuyup sayfaya veriyor, inmekte
//! olanları sayıyor. Sayfa her paketi doğrulayıp rafa koyuyor, salt okunur
//! (`packStore.ts`).
//! Yükleme oyuncunun paketini bir öğe yapıyor; aynı paketin sonraki
//! yüklemesi aynı öğeyi güncelliyor (sayfa öğenin kimliğini saklıyor);
//! oyuncu öğeyi Steam'de sildiyse yeni öğe açılıyor.
//! Steamworks'ün çağrıları geri çağrılı: geri çağrıları Steam'in iş
//! parçacığı çalıştırıyor (`steam.rs`), komut sonucu bekliyor.

#[cfg(any(feature = "steam", test))]
use std::path::Path;

use serde::{Deserialize, Serialize};

/// Bir öğeden okunan paket dosyası en çok bu kadar (doğrulayıcının sınırı 64 KB).
const MAX_FILE_BYTES: u64 = 64 * 1024;
/// Bir öğeden en çok bu kadar paket dosyası.
#[cfg(any(feature = "steam", test))]
const MAX_FILES: usize = 4;
/// Steamworks'ün sınırları UTF-8 bayt, sondaki sıfır dahil
/// (`k_cchPublishedDocumentTitleMax` 129, `…DescriptionMax` ve
/// `…ChangeDescriptionMax` 8000). Karakter saymak Türkçe ve başka
/// alfabelerde sınırı aşan bir başlığı geçirirdi (Codex #103).
const MAX_TITLE: usize = 128;
const MAX_DESCRIPTION: usize = 7999;

/// Kurulu bir Workshop öğesi ve klasöründeki paketler.
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct Item {
    /// Öğenin kimliği; 64 bit, JavaScript'in sayısında bozulmasın diye metin.
    pub id: String,
    /// Paket dosyalarının içi, ad sırasıyla.
    pub packs: Vec<String>,
}

/// Abone olunan öğeler: kurulu olanlar ve Steam'in henüz indirdikleri.
#[derive(Clone, Debug, Default, Serialize, PartialEq, Eq)]
pub struct Listing {
    pub items: Vec<Item>,
    /// İnince rafta; sayfa oyuncuya söylüyor.
    pub downloading: usize,
}

/// Yükleme isteği.
#[derive(Clone, Debug, Deserialize)]
pub struct Publish {
    /// Paket daha önce yüklendiyse öğesi: güncelleniyor.
    pub item: Option<String>,
    pub title: String,
    pub description: String,
    /// Paketin JSON'u; öğede `pack.json`.
    pub pack: String,
    /// Değişiklik notu (öğenin geçmişinde).
    pub note: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct Published {
    pub id: String,
    /// Oyuncu Workshop sözleşmesini kabul etmemiş: Steam öğeyi o zamana kadar gizli tutuyor.
    pub agreement: bool,
}

/// Klasördeki paket dosyaları: `.json`, ad sırasıyla, en çok `MAX_FILES`.
/// Büyük, okunamayan ya da dosya olmayan girdi atlanıyor.
#[cfg(any(feature = "steam", test))]
pub fn read_packs(folder: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(folder) else { return Vec::new() };
    let mut paths: Vec<_> = entries
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("json")))
        .filter(|path| path.metadata().is_ok_and(|meta| meta.is_file() && meta.len() <= MAX_FILE_BYTES))
        .collect();
    paths.sort();
    paths.into_iter().filter_map(|path| std::fs::read_to_string(path).ok()).take(MAX_FILES).collect()
}

/// İstek Steamworks'ün sınırlarında mı; değilse oyuncuya söylenecek neden.
pub fn check(request: &Publish) -> Result<(), String> {
    let title = request.title.trim();
    if title.is_empty() || title.len() > MAX_TITLE {
        return Err(format!("başlık 1–{MAX_TITLE} bayt olmalı"));
    }
    let long = |text: &str| text.len() > MAX_DESCRIPTION;
    if long(&request.description) || request.note.as_deref().is_some_and(long) {
        return Err(format!("açıklama ve değişiklik notu en çok {MAX_DESCRIPTION} bayt"));
    }
    if request.pack.is_empty() || request.pack.len() as u64 > MAX_FILE_BYTES {
        return Err("paket boş ya da 64 KB'tan büyük".into());
    }
    if let Some(item) = &request.item {
        item.parse::<u64>().map_err(|_| "öğenin kimliği bozuk".to_string())?;
    }
    Ok(())
}

/// Steam Topluluğu'nda açılacak sayfa: oyunun Workshop'u (`workshop`),
/// Workshop sözleşmesi (`agreement`) ya da kimliği verilen öğe. Başka adres yok.
#[cfg(any(feature = "steam", test))]
pub fn page(target: &str, app: u32) -> Option<String> {
    match target {
        "workshop" => Some(format!("https://steamcommunity.com/app/{app}/workshop/")),
        "agreement" => Some("https://steamcommunity.com/sharedfiles/workshoplegalagreement".into()),
        id => id.parse::<u64>().ok().map(|id| format!("https://steamcommunity.com/sharedfiles/filedetails/?id={id}")),
    }
}

#[cfg(feature = "steam")]
mod live {
    use std::path::Path;
    use std::sync::mpsc;
    use std::time::Duration;

    use super::{check, page, read_packs, Item, Listing, Publish, Published};

    /// Öğe açma kısa; içerik yükleme bağlantıya göre uzun sürebiliyor.
    const CREATE_WAIT: Duration = Duration::from_secs(30);
    const SUBMIT_WAIT: Duration = Duration::from_secs(180);
    /// Steamworks'te tanımlanacak etiket (`docs/STEAM.md`).
    const TAG: &str = "Scenario";

    fn wait<T>(rx: &mpsc::Receiver<T>, timeout: Duration) -> Result<T, String> {
        rx.recv_timeout(timeout).map_err(|_| "Steam yanıt vermedi".to_string())
    }

    pub fn listing() -> Listing {
        let Some(client) = crate::steam::client() else { return Listing::default() };
        let ugc = client.ugc();
        let mut listing = Listing::default();
        for id in ugc.subscribed_items(false) {
            let state = ugc.item_state(id);
            // İnmemiş ya da eskimiş öğe: Steam indiriyor; eskimişin eski sürümü rafta.
            if !state.contains(steamworks::ItemState::INSTALLED) || state.contains(steamworks::ItemState::NEEDS_UPDATE) {
                ugc.download_item(id, false);
            }
            match ugc.item_install_info(id) {
                Some(info) if state.contains(steamworks::ItemState::INSTALLED) => {
                    listing.items.push(Item { id: id.0.to_string(), packs: read_packs(Path::new(&info.folder)) });
                }
                _ => listing.downloading += 1,
            }
        }
        listing
    }

    /// Yüklemenin başarısızlığı; Steam'de silinmiş öğe ayrı: paket yeni öğe oluyor.
    enum Failure {
        Gone,
        Other(String),
    }

    pub fn publish(request: Publish) -> Result<Published, String> {
        check(&request)?;
        let client = crate::steam::client().ok_or_else(|| "Steam'e bağlı değil".to_string())?;
        let result = match submit(&client, &request, request.item.as_deref()) {
            // Oyuncu öğeyi Steam'de silmiş: sayfanın sakladığı kimlik boşta kalmasın.
            Err(Failure::Gone) => submit(&client, &request, None),
            other => other,
        };
        result.map_err(|failure| match failure {
            Failure::Gone => "öğe Steam'de yok".to_string(),
            Failure::Other(text) => text,
        })
    }

    fn submit(client: &steamworks::Client, request: &Publish, item: Option<&str>) -> Result<Published, Failure> {
        let ugc = client.ugc();
        let app = client.utils().app_id();
        let (id, mut agreement) = match item {
            Some(item) => (steamworks::PublishedFileId(item.parse().map_err(|_| Failure::Other("öğenin kimliği bozuk".into()))?), false),
            None => {
                let (tx, rx) = mpsc::channel();
                ugc.create_item(app, steamworks::FileType::Community, move |result| {
                    let _ = tx.send(result);
                });
                wait(&rx, CREATE_WAIT).map_err(Failure::Other)?.map_err(|error| Failure::Other(format!("öğe açılamadı: {error}")))?
            }
        };
        // İçerik bir klasör: paket `pack.json` olarak geçici dizinde.
        let dir = std::env::temp_dir().join("capitalforge-workshop").join(id.0.to_string());
        let write = std::fs::create_dir_all(&dir).and_then(|()| std::fs::write(dir.join("pack.json"), &request.pack));
        write.map_err(|error| Failure::Other(error.to_string()))?;
        let (tx, rx) = mpsc::channel();
        let _watch = ugc
            .start_item_update(app, id)
            .title(request.title.trim())
            .description(&request.description)
            .content_path(&dir)
            .tags(vec![TAG], false)
            .visibility(steamworks::PublishedFileVisibility::Public)
            .submit(request.note.as_deref(), move |result| {
                let _ = tx.send(result);
            });
        let submitted = wait(&rx, SUBMIT_WAIT);
        let _ = std::fs::remove_dir_all(&dir);
        let (_, needs) = submitted.map_err(Failure::Other)?.map_err(|error| match error {
            steamworks::SteamError::FileNotFound if item.is_some() => Failure::Gone,
            error => Failure::Other(format!("yüklenemedi: {error}")),
        })?;
        agreement |= needs;
        Ok(Published { id: id.0.to_string(), agreement })
    }

    /// Sayfa Steam katmanında; katman oyuna tutunmadıysa (pencere bir WebView,
    /// katman her sistemde tutunamıyor) Steam'in kendi tarayıcısında.
    pub fn open(target: &str) -> bool {
        let Some(client) = crate::steam::client() else { return false };
        let Some(url) = page(target, client.utils().app_id().0) else { return false };
        if client.utils().is_overlay_enabled() {
            client.friends().activate_game_overlay_to_web_page(&url);
            return true;
        }
        let program = if cfg!(target_os = "windows") {
            "explorer"
        } else if cfg!(target_os = "macos") {
            "open"
        } else {
            "xdg-open"
        };
        match std::process::Command::new(program).arg(format!("steam://openurl/{url}")).spawn() {
            Ok(mut child) => {
                std::thread::spawn(move || child.wait());
                true
            }
            Err(_) => false,
        }
    }
}

#[cfg(feature = "steam")]
pub use live::{listing, open, publish};

/// Steam'siz derlemede Workshop yok: raf yalnız oyuncunun paketleri.
#[cfg(not(feature = "steam"))]
pub fn listing() -> Listing {
    Listing::default()
}

#[cfg(not(feature = "steam"))]
pub fn publish(request: Publish) -> Result<Published, String> {
    check(&request)?;
    Err("bu derleme Steam'siz (`steam` özelliği kapalı)".into())
}

#[cfg(not(feature = "steam"))]
pub fn open(_target: &str) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(title: &str, pack: &str, item: Option<&str>) -> Publish {
        Publish { item: item.map(str::to_string), title: title.into(), description: "Üç senaryo".into(), pack: pack.into(), note: None }
    }

    #[test]
    fn klasordeki_paketler_sirayla_buyuk_ve_baska_dosya_atlaniyor() {
        let dir = std::env::temp_dir().join(format!("capitalforge-workshop-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("alt")).unwrap();
        std::fs::write(dir.join("b.json"), "{\"b\":1}").unwrap();
        std::fs::write(dir.join("a.JSON"), "{\"a\":1}").unwrap();
        std::fs::write(dir.join("not.txt"), "metin").unwrap();
        std::fs::write(dir.join("buyuk.json"), "x".repeat(64 * 1024 + 1)).unwrap();
        std::fs::write(dir.join("alt").join("ic.json"), "{}").unwrap();
        assert_eq!(read_packs(&dir), vec!["{\"a\":1}".to_string(), "{\"b\":1}".to_string()]);
        for name in ["c", "d", "e", "f"] {
            std::fs::write(dir.join(format!("{name}.json")), format!("\"{name}\"")).unwrap();
        }
        assert_eq!(read_packs(&dir).len(), MAX_FILES, "öğe başına en çok dört paket");
        assert!(read_packs(&dir.join("yok")).is_empty(), "klasör yoksa boş");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn yukleme_istegi_steamworksun_sinirlarinda() {
        assert!(check(&request("Kriz paketi", "{}", None)).is_ok());
        assert!(check(&request("Kriz paketi", "{}", Some("1234567890123"))).is_ok());
        assert!(check(&request("   ", "{}", None)).is_err(), "boş başlık");
        assert!(check(&request(&"ş".repeat(64), "{}", None)).is_ok(), "64 × 2 bayt: tam sınır");
        assert!(check(&request(&"ş".repeat(65), "{}", None)).is_err(), "128 bayttan uzun başlık");
        assert!(check(&request(&"漢".repeat(44), "{}", None)).is_err(), "44 karakter ama 132 bayt");
        assert!(check(&request("Paket", "", None)).is_err(), "boş paket");
        assert!(check(&request("Paket", &"x".repeat(64 * 1024 + 1), None)).is_err(), "64 KB'tan büyük paket");
        assert!(check(&request("Paket", "{}", Some("12a"))).is_err(), "bozuk öğe kimliği");
        let mut fits = request("Paket", "{}", None);
        fits.description = "a".repeat(7999);
        assert!(check(&fits).is_ok(), "sondaki sıfırla 8000 bayt");
        let mut long = request("Paket", "{}", None);
        long.description = "ş".repeat(4000);
        assert!(check(&long).is_err(), "4000 karakter ama 8000 bayt");
        let mut noted = request("Paket", "{}", None);
        noted.note = Some("b".repeat(8000));
        assert!(check(&noted).is_err(), "uzun değişiklik notu");
    }

    #[test]
    fn acilan_sayfa_yalniz_workshop_sozlesme_ve_oge() {
        assert_eq!(page("42", 480).as_deref(), Some("https://steamcommunity.com/sharedfiles/filedetails/?id=42"));
        assert_eq!(page("workshop", 480).as_deref(), Some("https://steamcommunity.com/app/480/workshop/"));
        assert_eq!(page("agreement", 480).as_deref(), Some("https://steamcommunity.com/sharedfiles/workshoplegalagreement"));
        for bad in ["", "../x", "https://example.com", "42/../1", "-1"] {
            assert_eq!(page(bad, 480), None, "{bad}");
        }
    }

    #[cfg(not(feature = "steam"))]
    #[test]
    fn steamsiz_derlemede_workshop_yok() {
        assert_eq!(listing(), Listing::default());
        assert!(publish(request("Paket", "{}", None)).unwrap_err().contains("Steam'siz"));
        assert!(!open("42"));
    }
}
