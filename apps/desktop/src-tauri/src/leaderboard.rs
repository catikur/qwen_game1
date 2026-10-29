//! Steam skor tabloları (Tur 73): Tohum Ligi'nin haftalık ve günlük tablosu
//! Steam'de de.
//!
//! Lig sunucusunun tablosu herkese açık ve koşuları doğruluyor; Steam'inki
//! oyuncunun Steam arkadaşlarını gösteriyor. Her hafta ve her günün kendi
//! tablosu var (`CF_SEED_2026-W44`, `CF_DAILY_2026-10-29`); ilk gönderende
//! Steam açıyor (`FindOrCreateLeaderboard`). Tablo en iyi puanı tutuyor.
//! Puan şirketin net değeri; Steam'in tablosu 32 bitlik tamsayı, aşan kırpılıyor.

use serde::Serialize;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct Uploaded {
    /// Tablodaki puan (en iyisi; bu gönderimden düşükse eskisi).
    pub score: i32,
    /// Bu gönderim tablodaki puanı değiştirdi mi.
    pub changed: bool,
    /// Bütün oyuncular arasındaki sıra.
    pub rank: i32,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct Entry {
    /// Steam'deki adı.
    pub name: String,
    pub score: i32,
    pub rank: i32,
    /// Oyuncunun kendisi.
    pub me: bool,
}

fn digits(text: &str) -> bool {
    !text.is_empty() && text.bytes().all(|byte| byte.is_ascii_digit())
}

/// Ligin tablo kimliğinden ("2026-W44" hafta, "2026-10-29" gün) Steam'deki
/// tablonun adı. Başka biçim yok: sayfa keyfi adla tablo açtıramıyor.
pub fn board_name(week_id: &str) -> Option<String> {
    let parts: Vec<&str> = week_id.split('-').collect();
    match parts.as_slice() {
        [year, week] if year.len() == 4 && digits(year) && week.len() == 3 && week.starts_with('W') && digits(&week[1..]) => {
            Some(format!("CF_SEED_{week_id}"))
        }
        [year, month, day] if year.len() == 4 && month.len() == 2 && day.len() == 2 && [year, month, day].iter().all(|part| digits(part)) => {
            Some(format!("CF_DAILY_{week_id}"))
        }
        _ => None,
    }
}

/// Net değer tablonun puanına: yuvarlanıyor, eksi ve sayı olmayan 0, büyüğü kırpılıyor.
#[cfg(any(feature = "steam", test))]
pub fn score_of(value: f64) -> i32 {
    if !value.is_finite() || value <= 0.0 {
        return 0;
    }
    value.round().min(f64::from(i32::MAX)) as i32
}

#[cfg(feature = "steam")]
mod live {
    use std::sync::mpsc;
    use std::time::Duration;

    use super::{board_name, score_of, Entry, Uploaded};

    const WAIT: Duration = Duration::from_secs(20);
    /// Arkadaş tablosunda en çok bu kadar satır.
    const FRIENDS: usize = 100;

    fn wait<T>(rx: &mpsc::Receiver<T>) -> Result<T, String> {
        rx.recv_timeout(WAIT).map_err(|_| "Steam yanıt vermedi".to_string())
    }

    fn client() -> Result<steamworks::Client, String> {
        crate::steam::client().ok_or_else(|| "Steam'e bağlı değil".to_string())
    }

    pub fn upload(week_id: &str, score: f64) -> Result<Uploaded, String> {
        let name = board_name(week_id).ok_or_else(|| format!("tablo kimliği tanınmıyor: {week_id}"))?;
        let client = client()?;
        let stats = client.user_stats();
        let (tx, rx) = mpsc::channel();
        stats.find_or_create_leaderboard(
            &name,
            steamworks::LeaderboardSortMethod::Descending,
            steamworks::LeaderboardDisplayType::Numeric,
            move |result| {
                let _ = tx.send(result);
            },
        );
        let board = wait(&rx)?.map_err(|error| error.to_string())?.ok_or_else(|| "tablo açılamadı".to_string())?;
        let (tx, rx) = mpsc::channel();
        stats.upload_leaderboard_score(&board, steamworks::UploadScoreMethod::KeepBest, score_of(score), &[], move |result| {
            let _ = tx.send(result);
        });
        let uploaded = wait(&rx)?.map_err(|error| error.to_string())?.ok_or_else(|| "puan yüklenemedi".to_string())?;
        Ok(Uploaded { score: uploaded.score, changed: uploaded.was_changed, rank: uploaded.global_rank_new })
    }

    pub fn friends(week_id: &str) -> Result<Vec<Entry>, String> {
        let name = board_name(week_id).ok_or_else(|| format!("tablo kimliği tanınmıyor: {week_id}"))?;
        let client = client()?;
        let stats = client.user_stats();
        let (tx, rx) = mpsc::channel();
        stats.find_leaderboard(&name, move |result| {
            let _ = tx.send(result);
        });
        // Bu hafta kimse göndermediyse tablo yok: arkadaş tablosu boş.
        let Some(board) = wait(&rx)?.map_err(|error| error.to_string())? else { return Ok(Vec::new()) };
        let (tx, rx) = mpsc::channel();
        stats.download_leaderboard_entries(&board, steamworks::LeaderboardDataRequest::Friends, 1, FRIENDS, 0, move |result| {
            let _ = tx.send(result);
        });
        let entries = wait(&rx)?.map_err(|error| error.to_string())?;
        let me = client.user().steam_id();
        let friends = client.friends();
        Ok(entries
            .into_iter()
            .map(|entry| Entry {
                // Oyuncunun kendi adı arkadaş listesinde değil: `GetPersonaName`.
                name: if entry.user == me { friends.name() } else { friends.get_friend(entry.user).name() },
                score: entry.score,
                rank: entry.global_rank,
                me: entry.user == me,
            })
            .collect())
    }
}

#[cfg(feature = "steam")]
pub use live::{friends, upload};

/// Steam'siz derlemede tablo yok; lig sunucusunun tablosu yerinde.
#[cfg(not(feature = "steam"))]
pub fn upload(week_id: &str, _score: f64) -> Result<Uploaded, String> {
    board_name(week_id).ok_or_else(|| format!("tablo kimliği tanınmıyor: {week_id}"))?;
    Err("bu derleme Steam'siz (`steam` özelliği kapalı)".into())
}

#[cfg(not(feature = "steam"))]
pub fn friends(week_id: &str) -> Result<Vec<Entry>, String> {
    upload(week_id, 0.0).map(|_| Vec::new())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tablo_adi_yalniz_ligin_hafta_ve_gun_kimliginden() {
        assert_eq!(board_name("2026-W44").as_deref(), Some("CF_SEED_2026-W44"));
        assert_eq!(board_name("2026-10-29").as_deref(), Some("CF_DAILY_2026-10-29"));
        for bad in ["", "2026", "2026-W4", "2026-W444", "2026-X44", "26-10-29", "2026-1-29", "2026-10-29-1", "2026-W44/../x", "2026-1a-29"] {
            assert_eq!(board_name(bad), None, "{bad}");
        }
    }

    #[test]
    fn net_deger_tablonun_puanina_kirpiliyor() {
        assert_eq!(score_of(250_000.4), 250_000);
        assert_eq!(score_of(1.6), 2);
        assert_eq!(score_of(-5.0), 0, "batan şirket");
        assert_eq!(score_of(f64::NAN), 0);
        assert_eq!(score_of(3e10), i32::MAX, "32 biti aşan");
    }

    #[cfg(not(feature = "steam"))]
    #[test]
    fn steamsiz_derlemede_tablo_yok() {
        assert!(upload("2026-W44", 10.0).unwrap_err().contains("Steam'siz"));
        assert!(friends("2026-W44").is_err());
        assert!(upload("bozuk", 10.0).unwrap_err().contains("tanınmıyor"));
    }
}
