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
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Runtime, Window};

/// En küçük pencere (`tauri.conf.json` ile aynı). Bundan küçük hatırlanan boy bozuk sayılıyor.
const MIN_WIDTH: u32 = 960;
const MIN_HEIGHT: u32 = 600;
/// Uygulamanın ayar dizininde. Kayıtların dizininde değil: Steam Cloud
/// kayıtları PC ile Deck arasında taşıyor, ekranın boyu taşınmamalı.
const FILE: &str = "window.json";

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
#[derive(Clone, Copy, Debug, Default)]
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

impl Memory {
    /// Yer ve boy yalnız pencere kipinde. Ekranı tümüyle kaplayan pencere de
    /// sayılmıyor: tam ekrana geçerken boy haberi kip haberinden önce
    /// gelebiliyor.
    pub fn track(&mut self, now: &Now) {
        let covers = now.screen.is_some_and(|(width, height)| now.width >= width && now.height >= height);
        if now.maximized || now.minimized || now.fullscreen || covers || now.width == 0 || now.height == 0 {
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

/// `screens`: ekranların yeri ve boyu (x, y, genişlik, yükseklik).
pub fn plan(memory: Option<Memory>, screens: &[(i32, i32, u32, u32)]) -> Plan {
    let Some(memory) = memory else {
        return Plan { size: None, position: None, maximize: true, fullscreen: false };
    };
    let size = memory.sized().then_some((memory.width, memory.height));
    // Ekranı artık yoksa (ikinci ekran çıkarılmış) yeri işletim sistemi seçiyor.
    let on_screen = size.is_some()
        && screens.iter().any(|&(x, y, width, height)| {
            i64::from(memory.x) < i64::from(x) + i64::from(width)
                && i64::from(memory.x) + i64::from(memory.width) > i64::from(x)
                && i64::from(memory.y) < i64::from(y) + i64::from(height)
                && i64::from(memory.y) + i64::from(memory.height) > i64::from(y)
        });
    Plan {
        size,
        position: on_screen.then_some((memory.x, memory.y)),
        // Pencere kipinde hiç boy olmadıysa oyuncunun gördüğü tek pencere büyütülmüştü.
        maximize: memory.maximized || size.is_none(),
        fullscreen: memory.fullscreen,
    }
}

pub fn load(dir: &Path) -> Option<Memory> {
    let bytes = std::fs::read(dir.join(FILE)).ok()?;
    serde_json::from_slice(&bytes).ok()
}

pub fn save(dir: &Path, memory: &Memory) -> std::io::Result<()> {
    let bytes = serde_json::to_vec(memory).map_err(std::io::Error::other)?;
    crate::store::write_atomic(&dir.join(FILE), &bytes)
}

/// Uygulamanın tuttuğu hâl.
pub struct Remembered(Mutex<Memory>);

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
    // Önce yönetime: uygulamanın yol açtığı boyut haberleri `track`'e düşüyor.
    app.manage(Remembered(Mutex::new(memory.unwrap_or_default())));
    let screens: Vec<_> = window
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|monitor| (monitor.position().x, monitor.position().y, monitor.size().width, monitor.size().height))
        .collect();
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

/// Pencere taşındı ya da boyu değişti.
pub fn track<R: Runtime>(window: &Window<R>) {
    let (Some(remembered), Some(now)) = (window.try_state::<Remembered>(), now(window)) else { return };
    remembered.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).track(&now);
}

/// Kapanış istendi: kipler şimdiki hâlden. Çıkışta pencere artık
/// sorgulanamayabiliyor; bu yüzden burada da.
pub fn closing<R: Runtime>(window: &Window<R>) {
    let (Some(remembered), Some(now)) = (window.try_state::<Remembered>(), now(window)) else { return };
    remembered.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).close(&now);
}

/// Çıkış: pencere hâlâ sorgulanabiliyorsa son hâl, sonra dosyaya.
pub fn persist<R: Runtime>(app: &AppHandle<R>) {
    let Some(remembered) = app.try_state::<Remembered>() else { return };
    let mut memory = remembered.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
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
        // Kip haberi gecikse de ekranı kaplayan boy pencere boyu sayılmıyor.
        memory.track(&windowed(0, 0, 1920, 1080));
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

    #[test]
    fn ekrani_olmayan_yer_ve_bozuk_boy_kullanilmiyor() {
        let memory = Memory { x: 2200, y: 100, width: 1280, height: 760, maximized: false, fullscreen: false };
        // İkinci ekran çıkarılmış: boy kalıyor, yeri işletim sistemi seçiyor.
        assert_eq!(plan(Some(memory), &[(0, 0, 1920, 1080)]).position, None);
        assert_eq!(plan(Some(memory), &[(0, 0, 1920, 1080), (1920, 0, 2560, 1440)]).position, Some((2200, 100)));
        let small = Memory { width: 400, height: 300, ..memory };
        assert_eq!(plan(Some(small), &[(0, 0, 1920, 1080)]), Plan { size: None, position: None, maximize: true, fullscreen: false });
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
