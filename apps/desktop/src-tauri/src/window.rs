//! Pencerenin hafızası (Tur 71): oyun kapandığı boyda, yerde, büyütülmüş ya
//! da tam ekran açılıyor; ilk açılışta büyütülmüş.
//!
//! İlk sürüm `tauri-plugin-window-state` kullanıyordu. Eklenti boyu ve yeri
//! büyütülmüş ve küçültülmüş pencerede kaydetmiyor, tam ekranda ise
//! kaydediyor: tam ekranda kapanan oyunun boyu olarak ekranın boyu
//! yazılıyordu. Sonraki açılışta tam ekrandan çıkan pencere ekran boyunda
//! kalıyordu (Codex; eklentinin açık hatası, tauri-apps/plugins-workspace#3215).
//! Burada boy ve yer yalnız pencere kipindeyken hatırlanıyor; büyütme ve tam
//! ekran ayrı işaretler. Kararlar (`Memory`, `plan`) saf işlevler, testli;
//! pencereyle konuşan kısım ince.

use std::path::Path;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Runtime, Window};

/// En küçük pencere (`tauri.conf.json` ile aynı). Bundan küçük hatırlanan boy bozuk sayılıyor.
const MIN_WIDTH: u32 = 960;
const MIN_HEIGHT: u32 = 600;
/// Uygulamanın ayar dizininde. Kayıtların dizininde değil: Steam Cloud
/// kayıtları PC ile Deck arasında taşıyor, ekranın boyu taşınmamalı.
const FILE: &str = "window.json";
/// Taşıma ve boy haberleri durulunca pencerenin hâline bakılıyor. Büyütme ve
/// tam ekran geçişinde (açılıştaki `restore`'da da) boy haberi kip haberinden
/// önce gelebiliyor; o an ekran boyuna yakın boy pencere boyu sanılıyordu
/// (Cursor Bugbot).
const SETTLE: Duration = Duration::from_millis(400);
/// Ardından bu kadar sessizlik gelen haberin hâli durgun sayılıyor. Geçişin
/// haberleri art arda geliyor (animasyonun kareleri, kip haberinden hemen
/// önceki boy haberi); oyuncunun boyu bırakıp büyütmesi daha uzun sürüyor.
const STEADY: Duration = Duration::from_millis(100);
/// Büyütülmüş ya da tam ekran boydan bu kadar küçük olmayan hâl geçişin
/// kendisi sayılıyor: kip haberi gecikince son boy haberi o boyda geliyor.
const MARGIN: u32 = 32;
/// Haberlerin son bu kadarı tutuluyor; uzun bir sürüklemenin başı gereksiz.
const KEEP: usize = 64;

/// Kapanışta yazılan, açılışta okunan hâl. Yer ve boy fiziksel piksel.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Memory {
    /// Pencere kipindeki son yer ve boy; pencere hiç pencere kipinde olmadıysa 0.
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
    pub fullscreen: bool,
}

/// Pencerenin bir andaki hâli.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Now {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
    pub minimized: bool,
    pub fullscreen: bool,
    /// Pencerenin bulunduğu ekranın boyu.
    pub screen: Option<(u32, u32)>,
}

impl Now {
    /// Pencere kipinde mi. Ekranı tümüyle kaplayan pencere sayılmıyor: tam
    /// ekrana geçerken boy haberi kip haberinden önce gelebiliyor. En küçük
    /// pencereden küçük boy da sayılmıyor (küçültülürken gelen haber);
    /// açılışta zaten kullanılmazdı.
    pub fn windowed(&self) -> bool {
        let covers = self.screen.is_some_and(|(width, height)| self.width >= width && self.height >= height);
        !(self.maximized || self.minimized || self.fullscreen || covers) && self.width >= MIN_WIDTH && self.height >= MIN_HEIGHT
    }
}

impl Memory {
    /// Yer ve boy yalnız pencere kipinde.
    pub fn track(&mut self, now: &Now) {
        if !now.windowed() {
            return;
        }
        self.x = now.x;
        self.y = now.y;
        self.width = now.width;
        self.height = now.height;
    }

    /// Kapanışta: yer ve boy son pencere kipinden, kipler o anki hâlden.
    /// Küçültülmüş kapanan pencere küçültülmüş açılmıyor; kipi öncekisi.
    pub fn close(&mut self, now: &Now) {
        self.track(now);
        if !now.minimized {
            self.maximized = now.maximized;
            self.fullscreen = now.fullscreen;
        }
    }

    /// Hatırlanan boy kullanılabilir mi.
    fn sized(&self) -> bool {
        self.width >= MIN_WIDTH && self.height >= MIN_HEIGHT
    }
}

/// Açılışta yapılacaklar.
#[derive(Debug, PartialEq, Eq)]
pub struct Plan {
    pub size: Option<(u32, u32)>,
    pub position: Option<(i32, i32)>,
    pub maximize: bool,
    pub fullscreen: bool,
}

/// Bir ekran: yer ve boy (x, y, genişlik, yükseklik).
pub type Screen = (i32, i32, u32, u32);

/// Pencerenin ekranla kesişen alanı (piksel²).
fn overlap(memory: &Memory, &(x, y, width, height): &Screen) -> i64 {
    let left = i64::from(memory.x).max(i64::from(x));
    let right = (i64::from(memory.x) + i64::from(memory.width)).min(i64::from(x) + i64::from(width));
    let top = i64::from(memory.y).max(i64::from(y));
    let bottom = (i64::from(memory.y) + i64::from(memory.height)).min(i64::from(y) + i64::from(height));
    (right - left).max(0) * (bottom - top).max(0)
}

/// `screens`: ilki birincil ekran. Pencere ekranlarda tümüyle görünüyorsa
/// (iki ekrana yayılmış olsa da) olduğu gibi açılıyor. Ekran düzeni
/// değiştiyse (ikinci ekran çıkarılmış) en çok kesiştiği ekrana sığdırılıyor:
/// bir piksellik kesişim yetmiyordu, ikinci ekranda kalan pencere başlık
/// çubuğuyla birlikte ekranın dışında açılıyordu (Codex). Hiç kesişmiyorsa
/// birincil ekranın ortasında; ekrandan büyük boy ekrana iniyor.
pub fn plan(memory: Option<Memory>, screens: &[Screen]) -> Plan {
    let Some(memory) = memory else {
        return Plan { size: None, position: None, maximize: true, fullscreen: false };
    };
    // Pencere kipinde hiç boy olmadıysa oyuncunun gördüğü tek pencere büyütülmüştü.
    let maximize = memory.maximized || !memory.sized();
    let fullscreen = memory.fullscreen;
    if !memory.sized() {
        return Plan { size: None, position: None, maximize, fullscreen };
    }
    let visible: i64 = screens.iter().map(|screen| overlap(&memory, screen)).sum();
    let whole = i64::from(memory.width) * i64::from(memory.height);
    if visible >= whole {
        return Plan { size: Some((memory.width, memory.height)), position: Some((memory.x, memory.y)), maximize, fullscreen };
    }
    // Ekranlar okunamadıysa boy hatırlandığı gibi, yeri işletim sistemi seçiyor.
    let Some(best) = screens.iter().max_by_key(|screen| overlap(&memory, screen)) else {
        return Plan { size: Some((memory.width, memory.height)), position: None, maximize, fullscreen };
    };
    let touching = overlap(&memory, best) > 0;
    let &(sx, sy, sw, sh) = if touching { best } else { &screens[0] };
    let (width, height) = (memory.width.min(sw), memory.height.min(sh));
    let (free_x, free_y) = (i64::from(sw - width), i64::from(sh - height));
    let (x, y) = if touching {
        (
            i64::from(memory.x).clamp(i64::from(sx), i64::from(sx) + free_x),
            i64::from(memory.y).clamp(i64::from(sy), i64::from(sy) + free_y),
        )
    } else {
        (i64::from(sx) + free_x / 2, i64::from(sy) + free_y / 2)
    };
    // Kırpılan değerler ekranın içinde: i32'ye sığıyor.
    Plan { size: Some((width, height)), position: Some((x as i32, y as i32)), maximize, fullscreen }
}

pub fn load(dir: &Path) -> Option<Memory> {
    let bytes = std::fs::read(dir.join(FILE)).ok()?;
    serde_json::from_slice(&bytes).ok()
}

pub fn save(dir: &Path, memory: &Memory) -> std::io::Result<()> {
    let bytes = serde_json::to_vec(memory).map_err(std::io::Error::other)?;
    crate::store::write_atomic(&dir.join(FILE), &bytes)
}

/// Bir taşıma ya da boy haberi: geldiği an ve pencerenin o anki hâli.
#[derive(Clone, Copy, Debug)]
pub struct Seen {
    pub at: Instant,
    pub now: Now,
}

/// Haberler durulunca hatırlanacak hâl. Durulan pencere pencere kipindeyse o.
/// Büyütülmüş, tam ekran ya da küçültülmüşse geçişten önceki son durgun
/// pencere hâli: oyuncu boyu değiştirip 400 ms dolmadan büyütünce yeni boy
/// kayboluyordu (Cursor Bugbot). Geçişin kendi haberleri sayılmıyor: ardından
/// hemen haber gelen hâl ve büyütülmüş boydan belirgin küçük olmayan hâl.
pub fn settle(seen: &[Seen], settled: &Now) -> Option<Now> {
    if settled.windowed() {
        return Some(*settled);
    }
    let steady = |index: usize| seen.get(index + 1).map_or(true, |next| next.at.duration_since(seen[index].at) >= STEADY);
    // Küçültülmüş pencerenin boyu karşılaştırılacak bir boy değil.
    let before = |now: &Now| {
        settled.minimized || now.width.saturating_add(MARGIN) <= settled.width || now.height.saturating_add(MARGIN) <= settled.height
    };
    (0..seen.len()).rev().find(|&index| seen[index].now.windowed() && steady(index) && before(&seen[index].now)).map(|index| seen[index].now)
}

/// İlk haberden sonra haberleri `wait` boyunca kesilene kadar toplar, son
/// `KEEP` tanesini; kanal kapandıysa None.
fn gather(first: Seen, news: &Receiver<Seen>, wait: Duration) -> Option<Vec<Seen>> {
    let mut seen = vec![first];
    loop {
        match news.recv_timeout(wait) {
            Ok(next) => {
                if seen.len() == KEEP {
                    seen.remove(0);
                }
                seen.push(next);
            }
            Err(RecvTimeoutError::Timeout) => return Some(seen),
            Err(RecvTimeoutError::Disconnected) => return None,
        }
    }
}

/// Uygulamanın tuttuğu hâl ve durulmayı bekleyen iş parçacığının kanalı.
pub struct Remembered {
    memory: Mutex<Memory>,
    news: Mutex<Sender<Seen>>,
}

impl Remembered {
    fn memory(&self) -> MutexGuard<'_, Memory> {
        self.memory.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

fn now<R: Runtime>(window: &Window<R>) -> Option<Now> {
    let position = window.outer_position().ok()?;
    let size = window.inner_size().ok()?;
    let screen = window.current_monitor().ok().flatten().map(|monitor| (monitor.size().width, monitor.size().height));
    Some(Now {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        maximized: window.is_maximized().unwrap_or(false),
        minimized: window.is_minimized().unwrap_or(false),
        fullscreen: window.is_fullscreen().unwrap_or(false),
        screen,
    })
}

fn config_dir<R: Runtime>(app: &AppHandle<R>) -> Option<std::path::PathBuf> {
    app.path().app_config_dir().ok()
}

/// Açılışta: hafızayı oku, pencereye uygula.
pub fn restore<R: Runtime>(app: &AppHandle<R>, window: &Window<R>) {
    let memory = config_dir(app).and_then(|dir| load(&dir));
    // Önce yönetime: aşağıdaki boy ve kip değişimlerinin haberleri `track`'e düşüyor.
    let (news, heard) = mpsc::channel();
    app.manage(Remembered { memory: Mutex::new(memory.unwrap_or_default()), news: Mutex::new(news) });
    let watched = window.clone();
    std::thread::spawn(move || {
        // Bir haber gelince durulmasını bekle; hatırlanacak hâli haberlerden ve durulan hâlden seç.
        while let Ok(first) = heard.recv() {
            let Some(seen) = gather(first, &heard, SETTLE) else { return };
            let (Some(remembered), Some(settled)) = (watched.try_state::<Remembered>(), now(&watched)) else { continue };
            if let Some(now) = settle(&seen, &settled) {
                remembered.memory().track(&now);
            }
        }
    });
    let screen = |monitor: &tauri::Monitor| -> Screen {
        (monitor.position().x, monitor.position().y, monitor.size().width, monitor.size().height)
    };
    let mut screens: Vec<Screen> = window.available_monitors().unwrap_or_default().iter().map(screen).collect();
    // `plan` birincil ekranı başta bekliyor.
    if let Some(primary) = window.primary_monitor().ok().flatten().as_ref().map(screen) {
        screens.retain(|other| *other != primary);
        screens.insert(0, primary);
    }
    let plan = plan(memory, &screens);
    if let Some((width, height)) = plan.size {
        let _ = window.set_size(PhysicalSize::new(width, height));
    }
    if let Some((x, y)) = plan.position {
        let _ = window.set_position(PhysicalPosition::new(x, y));
    }
    if plan.maximize {
        let _ = window.maximize();
    }
    if plan.fullscreen {
        let _ = window.set_fullscreen(true);
    }
}

/// Pencere taşındı ya da boyu değişti: o anki hâli, durulunca seçilecek.
pub fn track<R: Runtime>(window: &Window<R>) {
    let (Some(remembered), Some(now)) = (window.try_state::<Remembered>(), now(window)) else { return };
    let _ = remembered.news.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).send(Seen { at: Instant::now(), now });
}

/// Kapanış istendi: kipler şimdiki hâlden. Çıkışta pencere artık
/// sorgulanamayabiliyor; bu yüzden burada da.
pub fn closing<R: Runtime>(window: &Window<R>) {
    let (Some(remembered), Some(now)) = (window.try_state::<Remembered>(), now(window)) else { return };
    remembered.memory().close(&now);
}

/// Çıkış: pencere hâlâ sorgulanabiliyorsa son hâl, sonra dosyaya.
pub fn persist<R: Runtime>(app: &AppHandle<R>) {
    let Some(remembered) = app.try_state::<Remembered>() else { return };
    let mut memory = remembered.memory();
    if let Some(now) = app.get_webview_window("main").and_then(|window| now(&window.as_ref().window())) {
        memory.close(&now);
    }
    if let Some(dir) = config_dir(app) {
        let _ = save(&dir, &memory);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCREEN: (u32, u32) = (1920, 1080);

    fn windowed(x: i32, y: i32, width: u32, height: u32) -> Now {
        Now { x, y, width, height, screen: Some(SCREEN), ..Now::default() }
    }

    #[test]
    fn boy_ve_yer_yalniz_pencere_kipinde_hatirlaniyor() {
        let mut memory = Memory::default();
        memory.track(&windowed(100, 80, 1280, 760));
        assert_eq!((memory.x, memory.y, memory.width, memory.height), (100, 80, 1280, 760));
        // Tam ekran, büyütülmüş, küçültülmüş: boy ve yer değişmiyor.
        memory.track(&Now { fullscreen: true, ..windowed(0, 0, 1920, 1080) });
        memory.track(&Now { maximized: true, ..windowed(0, 0, 1920, 1040) });
        memory.track(&Now { minimized: true, ..windowed(-32000, -32000, 160, 28) });
        assert_eq!((memory.x, memory.y, memory.width, memory.height), (100, 80, 1280, 760));
        // Kip haberi gecikse de ekranı kaplayan boy pencere boyu sayılmıyor;
        // en küçük pencereden küçük boy da.
        memory.track(&windowed(0, 0, 1920, 1080));
        memory.track(&windowed(0, 0, 400, 300));
        assert_eq!((memory.width, memory.height), (1280, 760));
    }

    #[test]
    fn tam_ekranda_kapanan_pencere_tam_ekran_ama_eski_boyuyla_aciliyor() {
        // Codex'in senaryosu: pencere kipinde 1280 × 760, sonra F11, sonra kapat.
        let mut memory = Memory::default();
        memory.track(&windowed(100, 80, 1280, 760));
        memory.close(&Now { fullscreen: true, ..windowed(0, 0, 1920, 1080) });
        assert_eq!(memory, Memory { x: 100, y: 80, width: 1280, height: 760, maximized: false, fullscreen: true });
        let plan = plan(Some(memory), &[(0, 0, 1920, 1080)]);
        assert_eq!(plan, Plan { size: Some((1280, 760)), position: Some((100, 80)), maximize: false, fullscreen: true });
    }

    #[test]
    fn ilk_acilis_buyutulmus_kucultulmus_kapanis_onceki_kipte() {
        assert_eq!(plan(None, &[(0, 0, 1920, 1080)]), Plan { size: None, position: None, maximize: true, fullscreen: false });
        let mut memory = Memory { x: 10, y: 10, width: 1280, height: 760, maximized: true, fullscreen: false };
        memory.close(&Now { minimized: true, ..windowed(-32000, -32000, 160, 28) });
        assert!(memory.maximized, "küçültülmüş kapanış kipi değiştirmiyor");
        // Hiç pencere kipine geçmeden kapanan oyun yine büyütülmüş açılıyor.
        let never = Memory { fullscreen: true, ..Memory::default() };
        assert_eq!(plan(Some(never), &[(0, 0, 1920, 1080)]), Plan { size: None, position: None, maximize: true, fullscreen: true });
    }

    const PRIMARY: Screen = (0, 0, 1920, 1080);
    const SECOND: Screen = (1920, 0, 2560, 1440);

    #[test]
    fn ekranlarda_tumuyle_gorunen_pencere_oldugu_gibi() {
        let memory = Memory { x: 2200, y: 100, width: 1280, height: 760, maximized: false, fullscreen: false };
        assert_eq!(plan(Some(memory), &[PRIMARY, SECOND]).position, Some((2200, 100)));
        // İki ekrana yayılmış pencere de: yayılmayı oyuncu seçti.
        let spread = Memory { x: 1500, ..memory };
        assert_eq!(plan(Some(spread), &[PRIMARY, SECOND]).position, Some((1500, 100)));
        let small = Memory { width: 400, height: 300, ..memory };
        assert_eq!(plan(Some(small), &[PRIMARY]), Plan { size: None, position: None, maximize: true, fullscreen: false });
    }

    #[test]
    fn ekran_cikarilinca_pencere_kalan_ekrana_sigdiriliyor() {
        // Codex'in örneği: çoğu ikinci ekranda (x = 1900), birincilde yalnız 20 piksel.
        let mostly_second = Memory { x: 1900, y: 100, width: 1280, height: 760, maximized: false, fullscreen: false };
        let plan_one = plan(Some(mostly_second), &[PRIMARY]);
        assert_eq!(plan_one.size, Some((1280, 760)));
        assert_eq!(plan_one.position, Some((640, 100)), "birincil ekrana tümüyle giriyor");
        // Hiç kesişmeyen, ekrandan büyük pencere: boy ekrana iniyor, birincilin ortasında.
        let big = Memory { x: 2000, y: 50, width: 2400, height: 1300, maximized: false, fullscreen: false };
        let plan_big = plan(Some(big), &[PRIMARY]);
        assert_eq!((plan_big.size, plan_big.position), (Some((1920, 1080)), Some((0, 0))));
        let away = Memory { x: 5000, y: 3000, ..mostly_second };
        assert_eq!(plan(Some(away), &[PRIMARY]).position, Some((320, 160)));
        // Ekranlar okunamadı: boy hatırlandığı gibi, yer işletim sisteminin.
        assert_eq!(plan(Some(away), &[]), Plan { size: Some((1280, 760)), position: None, maximize: false, fullscreen: false });
    }

    /// Haberler: geliş anı (ms) ve hâl.
    fn news(list: &[(u64, Now)]) -> Vec<Seen> {
        let start = Instant::now();
        list.iter().map(|&(ms, now)| Seen { at: start + Duration::from_millis(ms), now }).collect()
    }

    #[test]
    fn boy_degistirip_hemen_buyuten_oyuncunun_boyu_unutulmuyor() {
        // Cursor Bugbot'un senaryosu: sürükleyerek 1280 × 760, 250 ms sonra
        // büyüt; 400 ms dolmadı. Windows'ta taşıma haberi büyütülmüş işaretinden önce.
        let user = windowed(100, 80, 1280, 760);
        let maximized = Now { maximized: true, ..windowed(-8, -8, 1920, 1017) };
        let mut list: Vec<(u64, Now)> = (0..9).map(|step| (step * 16, windowed(100, 80, 1200 + step as u32 * 8, 700))).collect();
        list.extend([(144, user), (400, windowed(-8, -8, 1920, 1017)), (400, maximized)]);
        assert_eq!(settle(&news(&list), &maximized), Some(user));
        // Tam ekran ve küçültme de.
        let fullscreen = Now { fullscreen: true, ..windowed(0, 0, 1920, 1080) };
        assert_eq!(settle(&news(&[(0, user), (250, fullscreen)]), &fullscreen), Some(user));
        let minimized = Now { minimized: true, ..windowed(-32000, -32000, 160, 28) };
        assert_eq!(settle(&news(&[(0, user), (250, minimized)]), &minimized), Some(user));
        // Boy bırakılır bırakılmaz (100 ms'den kısa) büyütülürse öncekinde kalıyor.
        let quick = windowed(100, 80, 1300, 780);
        assert_eq!(settle(&news(&[(0, user), (300, quick), (350, maximized)]), &maximized), Some(user));
    }

    #[test]
    fn gecisin_kendi_haberleri_pencere_boyu_sayilmiyor() {
        let user = windowed(100, 80, 1280, 760);
        let maximized = Now { maximized: true, ..windowed(0, 0, 1920, 1040) };
        // Durulan pencere pencere kipindeyse o.
        assert_eq!(settle(&news(&[(0, user)]), &windowed(60, 40, 1400, 820)), Some(windowed(60, 40, 1400, 820)));
        // Linux'ta boy haberi kip haberinden önce, ardından haber yok: büyütülmüş boyda.
        assert_eq!(settle(&news(&[(0, user), (300, windowed(0, 0, 1920, 1040))]), &maximized), Some(user));
        // Büyütme animasyonunun kareleri art arda.
        let frames = [(300, windowed(60, 40, 1400, 820)), (316, windowed(30, 20, 1660, 930)), (332, windowed(8, 4, 1880, 1020))];
        let mut list = vec![(0, user)];
        list.extend(frames);
        list.push((348, maximized));
        assert_eq!(settle(&news(&list), &maximized), Some(user));
        // Pencere kipine hiç geçilmediyse hatırlanacak bir şey yok.
        let fullscreen = Now { fullscreen: true, ..windowed(0, 0, 1920, 1080) };
        assert_eq!(settle(&news(&[(0, fullscreen)]), &fullscreen), None);
    }

    #[test]
    fn haberler_kesilince_son_haberler_veriliyor() {
        let (sender, heard) = mpsc::channel();
        let start = Instant::now();
        for step in 0..KEEP as u32 + 6 {
            sender.send(Seen { at: start, now: windowed(0, 0, 1000 + step, 700) }).unwrap();
        }
        let first = heard.recv().unwrap();
        let seen = gather(first, &heard, Duration::from_millis(40)).expect("kanal açık");
        assert!(start.elapsed() >= Duration::from_millis(40), "biriken haberler tükenip süre doluyor");
        assert_eq!(seen.len(), KEEP);
        assert_eq!(seen.last().map(|seen| seen.now.width), Some(1000 + KEEP as u32 + 5), "en yenisi sonda");
        assert!(heard.try_recv().is_err(), "bütün haberler okundu");
        drop(sender);
        assert!(gather(first, &heard, Duration::from_millis(40)).is_none(), "kanal kapandı: iş parçacığı bitiyor");
    }

    #[test]
    fn dosyaya_yaziliyor_bozuk_dosya_ilk_acilis_sayiliyor() {
        let dir = std::env::temp_dir().join(format!("capitalforge-window-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(load(&dir), None);
        let memory = Memory { x: -8, y: 40, width: 1440, height: 900, maximized: true, fullscreen: true };
        save(&dir, &memory).unwrap();
        assert_eq!(load(&dir), Some(memory));
        std::fs::write(dir.join(FILE), b"{yarim").unwrap();
        assert_eq!(load(&dir), None);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
