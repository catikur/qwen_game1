import { NPC_PROFILES } from '@capital/content';
import { pushNews } from '../news';
import { formatMoney } from '../selectors';
import { makeCompany, rivalSlotsFor } from '../worldgen';
import type { GameState } from '../types';

/**
 * Yeni rakip girişi.
 *
 * Ölçüm (Tur 17 değerlendirmesi): rakipler birbirini devraldıkça kadro
 * eriyordu — üç tohumun hepsinde 600. günde dört rakipten ikisi
 * kalıyordu ve katalogdaki sekiz kişiliğin dördü hiç sahneye çıkmıyordu.
 * Geç oyun tenhalaşıyor, "kim hamle yapacak" sorusunun cevabı iki isme
 * iniyordu.
 *
 * Kural: boşalan koltuğa, hiç sahneye çıkmamış bir kişilik girer.
 *   - 200. günden önce yok (erken oyun kurulan rekabetin), girişler
 *     arasında en az 120 gün,
 *   - koltuk sayısı haritanın taşıdığı rakip sayısı (kuruluştaki kural),
 *   - sermaye ekonomiye ölçekli: mevcut rakiplerin medyan değerinin
 *     %35'i, profilin kendi başlangıç sermayesinden az değil. Yeni gelen
 *     yarışa girebilmeli ama kurulu düzeni bir gecede yıkmamalı,
 *   - devralınıp silinen bir isim geri dönmez (`rivalHistory`).
 *
 * KURUCU KİLİDİ (bir yıl): yeni gelenin hisseleri piyasada yok. Küçük
 * başlayan şirket gelir gelmez şehrin en küçüğü oluyor ve "en küçüğe
 * vur" kuralıyla ilk ay yutulurdu — giriş bir olay değil bir yem olurdu.
 * Bir yıl inşa etmeye zaman tanıyor.
 *
 * (Girişlerin ölçümünde ortaya çıkan asıl kilit baskın tarafındaydı:
 * hissesi tükenmiş hedefe çakılı kalan baskıncılar — npc.ts'te düzeltildi.)
 *
 * Zar yok. Koltuk boşaldığı gün bir haber düşer ("şehre yeni bir şirket
 * geliyor") ve yeni rakip 45 gün sonra girer: devralmanın sonucu bir
 * an bile görünmeden silinmesin, oyuncu boşalan pazara önce kendisi
 * yerleşebilsin. Giriş haberi kişiliği ve doktrini söylüyor — oyuncu
 * yeni rakibin nasıl oynayacağını bilmeli.
 */
export const ENTRY_FIRST_DAY = 200;
export const ENTRY_COOLDOWN_DAYS = 120;
export const ENTRY_DELAY_DAYS = 45;
export const FOUNDER_LOCK_DAYS = 365;
const ENTRY_CAPITAL_SHARE = 0.35;

export function runEntrantTick(state: GameState): void {
  if (!state.flags.npcCompetition || state.flags.rivalEntry === false) return;
  if (state.gameOver) return;
  const day = state.time.day;
  if (day < ENTRY_FIRST_DAY) return;
  if (state.lastEntryDay !== undefined && day - state.lastEntryDay < ENTRY_COOLDOWN_DAYS) return;

  const rivals = Object.values(state.companies).filter((company) => !company.isPlayer);
  const plots = state.map.tiles.filter((tile) => tile.kind === 'plot').length;
  if (rivals.length >= rivalSlotsFor(plots)) {
    delete state.rivalVacancyDay;
    return;
  }

  // Eski kayıtlarda geçmiş yok: elde olan en iyi bilgi bugünkü kadro.
  const history = new Set(state.rivalHistory ?? rivals.map((company) => company.id));
  const profile = NPC_PROFILES.find((candidate) => !history.has(candidate.id) && !state.companies[candidate.id]);
  if (!profile) return;

  if (state.rivalVacancyDay === undefined) {
    state.rivalVacancyDay = day;
    pushNews(
      state,
      'neutral',
      'Şehre yeni bir şirket geliyor',
      `Boşalan pazarı gözüne kestiren bir grup ${ENTRY_DELAY_DAYS} gün içinde şehre girecek. Boşluğu önce sen doldurabilirsin.`,
    );
    return;
  }
  if (day - state.rivalVacancyDay < ENTRY_DELAY_DAYS) return;

  const worths = rivals.map((company) => company.netWorth).sort((a, b) => a - b);
  const median = worths.length > 0 ? worths[Math.floor(worths.length / 2)]! : profile.startingCash;
  const capital = Math.max(profile.startingCash, Math.round(median * ENTRY_CAPITAL_SHARE));

  state.companies[profile.id] = makeCompany(
    profile.id,
    profile.name,
    false,
    profile.color,
    capital,
    profile.id,
    null,
    0.12,
  );
  state.companies[profile.id]!.lockedUntilDay = day + FOUNDER_LOCK_DAYS;
  state.rivalHistory = [...history, profile.id];
  state.lastEntryDay = day;
  delete state.rivalVacancyDay;

  pushNews(
    state,
    'rival',
    `Şehre yeni rakip: ${profile.name}`,
    `${profile.ceoName} yönetiminde, ${formatMoney(capital)} sermayeyle geldi. ${profile.description} ` +
      `Hisseleri ${FOUNDER_LOCK_DAYS} gün kurucu kilidinde.`,
    profile.id,
  );
}
