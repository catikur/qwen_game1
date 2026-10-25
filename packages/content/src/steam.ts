/**
 * Steam başarımlarının API adları (Tur 70): kariyer rozeti → Steamworks'teki
 * başarım. Steamworks'te başarım bu adla tanımlanıyor; masaüstü sürümü açılan
 * rozeti bu adla Steam'e bildiriyor (`apps/web/src/desktop/steam.ts`).
 *
 * Tablo açık yazılı, rozet kimliğinden türetilmiyor: bir rozetin kimliği
 * değişse de API adı aynı kalmalı. Steamworks'teki ad değişirse oyuncuların
 * açtığı başarım kaybolur. Yeni rozet tabloya yeni bir adla girer (test).
 */
export const STEAM_ACHIEVEMENTS: Readonly<Record<string, string>> = {
  public_company: 'CF_PUBLIC_COMPANY',
  quarter_billion: 'CF_QUARTER_BILLION',
  half_billion: 'CF_HALF_BILLION',
  second_city: 'CF_SECOND_CITY',
  empire: 'CF_EMPIRE',
  first_victory: 'CF_FIRST_VICTORY',
  blitz: 'CF_BLITZ',
  hard_victory: 'CF_HARD_VICTORY',
  big_city: 'CF_BIG_CITY',
  house_rules: 'CF_HOUSE_RULES',
  all_rules: 'CF_ALL_RULES',
  three_ceos: 'CF_THREE_CEOS',
  three_paths: 'CF_THREE_PATHS',
  first_takeover: 'CF_FIRST_TAKEOVER',
  serial_acquirer: 'CF_SERIAL_ACQUIRER',
  monopoly: 'CF_MONOPOLY',
  shield: 'CF_SHIELD',
  consortium_broken: 'CF_CONSORTIUM_BROKEN',
  weathered: 'CF_WEATHERED',
  storm_grower: 'CF_STORM_GROWER',
  city_sponsor: 'CF_CITY_SPONSOR',
  council_voice: 'CF_COUNCIL_VOICE',
  trusted_contractor: 'CF_TRUSTED_CONTRACTOR',
  auctioneer: 'CF_AUCTIONEER',
  bubble_hunter: 'CF_BUBBLE_HUNTER',
  quest_master: 'CF_QUEST_MASTER',
  scenario_tour: 'CF_SCENARIO_TOUR',
  scenario_perfect: 'CF_SCENARIO_PERFECT',
  league_player: 'CF_LEAGUE_PLAYER',
};

/** Açılmış rozetlerin Steam API adları; tabloda olmayan rozet atlanıyor. */
export function steamAchievementNames(badgeIds: Iterable<string>): string[] {
  const names: string[] = [];
  for (const id of badgeIds) {
    const name = STEAM_ACHIEVEMENTS[id];
    if (name) names.push(name);
  }
  return names;
}
