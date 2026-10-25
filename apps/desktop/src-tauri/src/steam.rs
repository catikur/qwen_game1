//! Steam başarımları (Tur 70).
//!
//! `steam` özelliğiyle derlenince kabuk Steamworks'e bağlanıyor (`steamworks`
//! paketi; SDK'nın kütüphanesi paketle geliyor, oyunun yanına
//! `steam_api64.dll` / `libsteam_api.so` / `libsteam_api.dylib` olarak
//! konuyor). Özellik kapalıysa, Steam istemcisi açık değilse ya da oyun
//! Steam'den açılmadıysa `status` "kapalı" diyor; oyun aynı.
//!
//! Açma istekleri kuyrukta bekliyor: Steamworks oyuncunun istatistiklerini
//! açılıştan kısa süre sonra indiriyor (SDK 1.61'den beri kendiliğinden) ve o
//! zamana kadar `SetAchievement` başarısız. Arka plandaki iş parçacığı geri
//! çağrıları çalıştırıp kuyruktakileri yeniden deniyor; bir başarım açılınca
//! `StoreStats` (Steam'in bildirimi ve sunucuya yazma). Steamworks'te
//! tanımlanmamış ad bir süre sonra kuyruktan düşüyor.

#[cfg(any(feature = "steam", test))]
use std::collections::{BTreeMap, BTreeSet};
use std::sync::OnceLock;
#[cfg(feature = "steam")]
use std::sync::{Arc, Mutex};
#[cfg(feature = "steam")]
use std::time::Duration;

use serde::Serialize;

/// Kuyruktaki bir ad en çok bu kadar denenir (≈ 60 sn, `TICK` arayla).
#[cfg(any(feature = "steam", test))]
const MAX_ATTEMPTS: u32 = 600;
#[cfg(feature = "steam")]
const TICK: Duration = Duration::from_millis(100);

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct Status {
    pub available: bool,
    pub detail: String,
}

/// Steam'in başarım arayüzü; testte sahtesi. Steam'siz derlemede yalnız testte.
#[cfg(any(feature = "steam", test))]
pub trait Backend {
    /// Başarımı bellekte açar; istatistikler inmediyse ya da ad bilinmiyorsa `false`.
    fn set(&self, name: &str) -> bool;
    /// Açılanları Steam'e yazar.
    fn store(&self);
}

/// Açılmayı bekleyen başarımlar ve deneme sayıları.
#[cfg(any(feature = "steam", test))]
#[derive(Default)]
pub struct Queue {
    pending: BTreeMap<String, u32>,
    done: BTreeSet<String>,
}

#[cfg(any(feature = "steam", test))]
impl Queue {
    /// Yeni adlar kuyruğa; açılmış ya da bekleyen ad yeniden girmiyor.
    pub fn push(&mut self, names: impl IntoIterator<Item = String>) {
        for name in names {
            if !self.done.contains(&name) {
                self.pending.entry(name).or_insert(0);
            }
        }
    }

    /// Kuyruktakileri dener; açılanlar döner. Bir tanesi açılırsa `store`.
    pub fn process(&mut self, backend: &impl Backend) -> Vec<String> {
        let mut opened = Vec::new();
        let mut dropped = Vec::new();
        for (name, attempts) in self.pending.iter_mut() {
            if backend.set(name) {
                opened.push(name.clone());
            } else {
                *attempts += 1;
                if *attempts >= MAX_ATTEMPTS {
                    dropped.push(name.clone());
                }
            }
        }
        for name in &opened {
            self.pending.remove(name);
            self.done.insert(name.clone());
        }
        for name in &dropped {
            self.pending.remove(name);
            eprintln!("Steam başarımı açılamadı (Steamworks'te tanımlı mı?): {name}");
        }
        if !opened.is_empty() {
            backend.store();
        }
        opened
    }

    #[cfg(test)]
    pub fn pending(&self) -> usize {
        self.pending.len()
    }
}

struct State {
    status: Status,
    #[cfg(feature = "steam")]
    queue: Option<Arc<Mutex<Queue>>>,
}

static STATE: OnceLock<State> = OnceLock::new();

/// Açılışta bir kez: Steam'e bağlan, iş parçacığını başlat.
pub fn start() {
    STATE.get_or_init(connect);
}

pub fn status() -> Status {
    STATE.get_or_init(connect).status.clone()
}

/// Açılacak başarımlar kuyruğa.
#[cfg(feature = "steam")]
pub fn unlock(names: Vec<String>) {
    if let Some(queue) = &STATE.get_or_init(connect).queue {
        queue.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).push(names);
    }
}

/// Steam'siz derlemede yok sayılıyor.
#[cfg(not(feature = "steam"))]
pub fn unlock(_names: Vec<String>) {}

#[cfg(not(feature = "steam"))]
fn connect() -> State {
    State {
        status: Status { available: false, detail: "bu derleme Steam'siz (`steam` özelliği kapalı)".into() },
    }
}

#[cfg(feature = "steam")]
struct Steam(steamworks::Client);

#[cfg(feature = "steam")]
impl Backend for Steam {
    fn set(&self, name: &str) -> bool {
        self.0.user_stats().achievement(name).set().is_ok()
    }

    fn store(&self) {
        let _ = self.0.user_stats().store_stats();
    }
}

#[cfg(feature = "steam")]
fn connect() -> State {
    // Steam'den açılan oyunda uygulama kimliğini istemci veriyor; geliştirmede
    // `CAPITALFORGE_STEAM_APPID` (ya da çalışma dizininde `steam_appid.txt`).
    let app_id = std::env::var("CAPITALFORGE_STEAM_APPID").ok().and_then(|id| id.trim().parse::<u32>().ok());
    let client = match app_id {
        Some(id) => steamworks::Client::init_app(id),
        None => steamworks::Client::init(),
    };
    match client {
        Ok(client) => {
            let queue = Arc::new(Mutex::new(Queue::default()));
            let worker = Arc::clone(&queue);
            let steam = Steam(client);
            std::thread::spawn(move || loop {
                steam.0.run_callbacks();
                worker.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).process(&steam);
                std::thread::sleep(TICK);
            });
            State { status: Status { available: true, detail: "Steam'e bağlı".into() }, queue: Some(queue) }
        }
        Err(error) => State {
            status: Status { available: false, detail: format!("Steam'e bağlanılamadı: {error} ({error:?})") },
            queue: None,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::{Cell, RefCell};

    /// İstatistikler `ready` denemeden sonra iniyor; `known` dışındaki ad hiç açılmıyor.
    struct Fake {
        known: Vec<&'static str>,
        ready: u32,
        calls: Cell<u32>,
        opened: RefCell<Vec<String>>,
        stores: Cell<u32>,
    }

    impl Fake {
        fn new(known: Vec<&'static str>, ready: u32) -> Self {
            Fake { known, ready, calls: Cell::new(0), opened: RefCell::new(Vec::new()), stores: Cell::new(0) }
        }
    }

    impl Backend for Fake {
        fn set(&self, name: &str) -> bool {
            self.calls.set(self.calls.get() + 1);
            if self.calls.get() <= self.ready || !self.known.contains(&name) {
                return false;
            }
            self.opened.borrow_mut().push(name.to_string());
            true
        }

        fn store(&self) {
            self.stores.set(self.stores.get() + 1);
        }
    }

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|name| name.to_string()).collect()
    }

    #[test]
    fn istatistikler_inene_kadar_bekliyor_sonra_aciyor_ve_yaziyor() {
        let fake = Fake::new(vec!["CF_FIRST_VICTORY"], 3);
        let mut queue = Queue::default();
        queue.push(names(&["CF_FIRST_VICTORY"]));
        for _ in 0..3 {
            assert!(queue.process(&fake).is_empty());
        }
        assert_eq!(fake.stores.get(), 0, "açılmadan yazılmıyor");
        assert_eq!(queue.process(&fake), names(&["CF_FIRST_VICTORY"]));
        assert_eq!(fake.stores.get(), 1);
        assert_eq!(queue.pending(), 0);
    }

    #[test]
    fn acilan_ad_yeniden_kuyruga_girmiyor() {
        let fake = Fake::new(vec!["CF_BLITZ"], 0);
        let mut queue = Queue::default();
        queue.push(names(&["CF_BLITZ", "CF_BLITZ"]));
        assert_eq!(queue.process(&fake).len(), 1);
        queue.push(names(&["CF_BLITZ"]));
        assert_eq!(queue.pending(), 0);
        assert!(queue.process(&fake).is_empty());
        assert_eq!(fake.stores.get(), 1, "yeni açılan yoksa yazma da yok");
    }

    #[test]
    fn steamworksde_olmayan_ad_sinirda_kuyruktan_dusuyor() {
        let fake = Fake::new(vec!["CF_EMPIRE"], 0);
        let mut queue = Queue::default();
        queue.push(names(&["CF_EMPIRE", "CF_UNKNOWN"]));
        assert_eq!(queue.process(&fake), names(&["CF_EMPIRE"]));
        for _ in 1..MAX_ATTEMPTS {
            queue.process(&fake);
        }
        assert_eq!(queue.pending(), 0, "bilinmeyen ad düştü");
    }

    #[cfg(not(feature = "steam"))]
    #[test]
    fn steamsiz_derlemede_durum_kapali() {
        let status = status();
        assert!(!status.available);
        unlock(names(&["CF_EMPIRE"]));
    }
}
