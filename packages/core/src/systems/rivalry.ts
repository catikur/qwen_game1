import { BUILDING_BY_ID, CAMPAIGN, CATEGORIES, CONSUMER_CATEGORIES, fillTemplate, formatPercent, rivalLines } from '@capital/content';
import type { CategoryId, RivalBeat } from '@capital/content';
import { pushNews } from '../news';
import { tc } from '../i18n';
import { rivalProfile } from '../profiles';
import { createRng, nextFloat } from '../rng';
import type { BuildingInstance, CampaignState, CompanyState, GameState } from '../types';

/**
 * Rakip hikâyeleri (Tur 37b) — içerik ve gerekçe `@capital/content`
 * stories.ts'te.
 *
 * İki parça:
 *   - SÖZ: rakibin CEO'su kişiliğine göre konuşuyor. Sıralama ve bölge
 *     liderliği haberleri (motor), kriz başlangıcı ve kampanyalar söz
 *     taşıyor.
 *   - KAMPANYA: bir rakip oyuncunun en güçlü kategorisine 45 günlük bir
 *     fiyat savaşı açıyor. Başı, gündemde geri sayan ortası ve kazananı
 *     ilan eden sonu var.
 *
 * Sözün zarı dışsal (tohum, gün, şirket, an): paylaşılan rng'ye
 * dokunmuyor, simülasyonun izi değişmiyor.
 */

export function storiesEnabled(state: GameState): boolean {
  return state.flags.rivalStories !== false && state.flags.npcCompetition !== false;
}

/**
 * Süren kampanya yalnız kendi bayrağına bağlı. `npcCompetition` kapalıyken
 * rakip yeni hamle yapmıyor (yeni kampanya, söz yok) ama mağazaları satmayı
 * sürdürüyor; açılmış fiyat savaşı da süresini dolduruyor. Bina tahmini
 * (`freeze`) rakipleri böyle donduruyor ve saldırı altındaki kategoride
 * bugünkü indirimi görmeli (Codex #62).
 */
export function campaignsLive(state: GameState): boolean {
  return state.flags.rivalStories !== false;
}

function storyDice(state: GameState, salt: number): ReturnType<typeof createRng> {
  return createRng(((state.meta.seed ^ 0x3c6ef372) ^ Math.imul(salt, 0x85ebca6b)) >>> 0);
}

function hashOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return hash;
}

/**
 * Sık anlarda (sıralama, bölge liderliği) aynı şirketin aynı anı en fazla
 * bu kadar günde bir söz taşıyor. Erken oyunda sıralama haftada birkaç
 * kez el değiştiriyor; her haberde söz olsaydı aynı cümle bir hafta içinde
 * üç kez okunurdu ve CEO bir karakter değil bir otomat gibi konuşurdu.
 */
export const QUOTE_COOLDOWN_DAYS = 60;

/**
 * Rakibin bu andaki sözü: `Deniz Arkın: “…”`. Profili olmayan şirkette
 * (oyuncu), hikâyeler kapalıyken ya da `cooldown` dolmadıysa null —
 * çağıran haberi sözsüz yazar. `cooldown` verilirse söz günü hatırlanıyor.
 */
export function rivalQuote(
  state: GameState,
  company: CompanyState | undefined,
  beat: RivalBeat,
  params: Record<string, string> = {},
  cooldown?: number,
): string | null {
  if (!company || !storiesEnabled(state)) return null;
  const profile = rivalProfile(state, company.profileId);
  if (!profile) return null;
  if (cooldown !== undefined) {
    const key = `${company.id}|${beat}`;
    const last = state.quoteDays?.[key];
    if (last !== undefined && state.time.day - last < cooldown) return null;
    (state.quoteDays ??= {})[key] = state.time.day;
  }
  const lines = rivalLines(profile.trait, beat);
  const pick = Math.floor(nextFloat(storyDice(state, state.time.day ^ hashOf(company.id + beat))) * lines.length);
  return tc('core.rivalry.quote', { ceo: profile.ceoName, line: fillTemplate(lines[pick] ?? lines[0] ?? '', params) });
}

/** Haber gövdesine söz ekler (söz yoksa gövde aynen). */
export function withQuote(body: string, quote: string | null): string {
  return quote ? `${body} ${quote}` : body;
}

/** Net değeri en büyük, profili olan rakip. */
function strongestRival(state: GameState): CompanyState | null {
  let best: CompanyState | null = null;
  for (const company of Object.values(state.companies)) {
    if (company.isPlayer || !rivalProfile(state, company.profileId)) continue;
    if (!best || company.netWorth > best.netWorth) best = company;
  }
  return best;
}

/** Kriz başladığında en büyük rakip konuşuyor (economy.ts çağırıyor). */
export function rivalCrisisReaction(state: GameState): void {
  const rival = strongestRival(state);
  const quote = rivalQuote(state, rival ?? undefined, 'crisis');
  if (!rival || !quote) return;
  pushNews(state, 'rival', tc('core.rivalry.crisisTitle', { name: rival.name }), quote, rival.id);
}

// ------------------------------------------------------------ kampanya

/** Süren kampanyada bu şirketin bu kategorideki fiyat çarpanı. */
export function campaignPriceFactor(state: GameState, companyId: string, category: CategoryId): number {
  const campaign = state.campaign;
  if (!campaign || campaign.companyId !== companyId || campaign.category !== category || !campaignsLive(state)) return 1;
  const trait = rivalProfile(state, state.companies[companyId]?.profileId)?.trait;
  return trait === 'price_cutter' ? CAMPAIGN.priceCut.price_cutter : CAMPAIGN.priceCut.default;
}

/**
 * Mağazanın satıştaki fiyat çarpanı: kendi çarpanı × süren kampanya
 * indirimi. Rekabet paneli ve bina penceresi bunu gösteriyor — saldırının
 * fiyatı gizli kalmasın (Codex #62).
 */
export function effectivePriceMultiplier(state: GameState, building: BuildingInstance): number {
  const category = BUILDING_BY_ID[building.defId]?.category;
  return building.priceMultiplier * (category ? campaignPriceFactor(state, building.companyId, category) : 1);
}

/** Rakibin kategoride açık mağazası var mı — fiyat kırabileceği bir raf. */
function sellsIn(state: GameState, companyId: string, category: CategoryId): boolean {
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== companyId) continue;
    const def = BUILDING_BY_ID[building.defId];
    if (def?.role === 'outlet' && def.category === category) return true;
  }
  return false;
}

function rangeFrom(dice: ReturnType<typeof createRng>, [min, max]: readonly [number, number]): number {
  return min + Math.floor(nextFloat(dice) * (max - min + 1));
}

function share(value: number): string {
  return formatPercent(Math.round(value * 100));
}

/**
 * Kampanyanın hedefi: oyuncunun payı en büyük kategori (en az
 * `minPlayerShare`), saldıran: o kategoride payı en büyük rakip — eşitlikte
 * net değeri büyük olan. Rakibin o kategoride hiç payı yoksa en büyük
 * rakip (genişlemeci "senin alanına giriyorum" der).
 */
function pickCampaign(state: GameState): { rival: CompanyState; category: CategoryId; playerShare: number } | null {
  const player = state.companies[state.playerCompanyId];
  if (!player) return null;
  let category: CategoryId | null = null;
  for (const id of CONSUMER_CATEGORIES) {
    const value = player.marketShare[id] ?? 0;
    if (value < CAMPAIGN.minPlayerShare) continue;
    if (category === null || value > (player.marketShare[category] ?? 0)) category = id;
  }
  if (!category) return null;
  // Kategoride mağazası ve payı olmayan rakip orada fiyat kıramaz; kimse yoksa kampanya bekler.
  let rival: CompanyState | null = null;
  for (const company of Object.values(state.companies)) {
    if (company.isPlayer || !rivalProfile(state, company.profileId)) continue;
    const a = company.marketShare[category] ?? 0;
    if (a <= 0 || !sellsIn(state, company.id, category)) continue;
    const b = rival ? (rival.marketShare[category] ?? 0) : 0;
    if (!rival || a > b || (a === b && company.netWorth > rival.netWorth)) rival = company;
  }
  return rival ? { rival, category, playerShare: player.marketShare[category] ?? 0 } : null;
}

function startCampaign(state: GameState): boolean {
  const picked = pickCampaign(state);
  if (!picked) return false;
  const day = state.time.day;
  const { rival, category, playerShare } = picked;
  state.campaign = { companyId: rival.id, category, startDay: day, endDay: day + CAMPAIGN.durationDays, playerShare };
  const name = CATEGORIES[category].name;
  pushNews(
    state,
    'rival',
    tc('core.rivalry.campaignTitle', { name: rival.name, category: name }),
    withQuote(
      tc('core.rivalry.campaignBody', { days: CAMPAIGN.durationDays, category: name, share: share(playerShare) }),
      rivalQuote(state, rival, 'campaignStart', { category: name }),
    ),
    rival.id,
  );
  return true;
}

function finishCampaign(state: GameState, campaign: CampaignState): void {
  delete state.campaign;
  const day = state.time.day;
  state.nextCampaignDay = day + rangeFrom(storyDice(state, day ^ 0x2545f491), CAMPAIGN.gapDays);
  const player = state.companies[state.playerCompanyId];
  const rival = state.companies[campaign.companyId];
  if (!player || !rival) return;
  const now = player.marketShare[campaign.category] ?? 0;
  const held = now >= campaign.playerShare - CAMPAIGN.holdMargin;
  const name = CATEGORIES[campaign.category].name;
  const params = { name: rival.name, category: name, from: share(campaign.playerShare), to: share(now) };
  if (held) {
    // Geri püskürtülen kampanya müşteriyi bağlıyor: kategoride marka biraz güçleniyor.
    player.brand[campaign.category] = Math.min(1, (player.brand[campaign.category] ?? 0) + CAMPAIGN.loyaltyBrand);
  }
  pushNews(
    state,
    held ? 'good' : 'bad',
    tc(held ? 'core.rivalry.campaignHeldTitle' : 'core.rivalry.campaignLostTitle', params),
    withQuote(
      tc(held ? 'core.rivalry.campaignHeldBody' : 'core.rivalry.campaignLostBody', params),
      rivalQuote(state, rival, held ? 'campaignLost' : 'campaignWon', { category: name }),
    ),
    rival.id,
  );
}

/** Günlük adım: kampanyanın takvimi. Pazardan ÖNCE — kampanya fiyatı aynı gün satışa girsin. */
export function runRivalryTick(state: GameState): void {
  if (!campaignsLive(state)) {
    delete state.campaign;
    return;
  }
  const day = state.time.day;
  const campaign = state.campaign;
  if (campaign) {
    const rival = state.companies[campaign.companyId];
    // Saldıran şirket oyundan çıktıysa (devralma, iflas) kampanya sessizce kapanır.
    if (!rival) {
      delete state.campaign;
      state.nextCampaignDay = day + CAMPAIGN.gapDays[0];
    } else if (!sellsIn(state, rival.id, campaign.category)) {
      // Son mağazasını kapattıysa fiyat kıracak rafı kalmadı: saldırı biter,
      // sadakat markası yok — oyuncu bir şeye karşı durmadı (Codex #62).
      delete state.campaign;
      state.nextCampaignDay = day + CAMPAIGN.gapDays[0];
      const name = CATEGORIES[campaign.category].name;
      pushNews(
        state,
        'neutral',
        tc('core.rivalry.campaignRetreatTitle', { name: rival.name, category: name }),
        tc('core.rivalry.campaignRetreatBody', { category: name }),
        rival.id,
      );
    } else if (day >= campaign.endDay) {
      finishCampaign(state, campaign);
    }
    return;
  }
  // Yeni kampanya rakibin hamlesi: rakipler donukken (laboratuvar, bina tahmini) yok.
  if (!storiesEnabled(state)) return;
  state.nextCampaignDay ??= CAMPAIGN.firstDay + Math.floor(nextFloat(storyDice(state, 2)) * 41);
  if (day < state.nextCampaignDay) return;
  // Uygun hedef yoksa (oyuncunun güçlü kategorisi yok) iki hafta sonra yeniden bak.
  if (!startCampaign(state)) state.nextCampaignDay = day + 14;
}
