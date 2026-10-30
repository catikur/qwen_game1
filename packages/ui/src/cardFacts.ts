import { PATH_BY_ID, PATH_SOURCES, PLAYER_ACCENT, formatPercent, getDifficulty } from '@capital/content';
import { companyPath, companyRanking, formatDate, formatMoney, getPlayer, leagueBoardKind, scenarioDefOf } from '@capital/core';
import type { GameState } from '@capital/core';
import { t } from './i18n';
import type { MessageKey } from './i18n';
import { starRow } from './stars';
import { fileSlug } from './fileName';
import './i18n/playTr';

/**
 * Şehir kartı (Tur 64): koşunun özeti tek bir görselde.
 *
 * Bu modül yalnız kartın SÖYLEDİKLERİ: saf, tarayıcısız sınanıyor. Çizim
 * (`cardDraw.ts`) bunları ve şehrin kuşbakışı karesini 1200 × 630'luk
 * bir görsele döküyor.
 *
 * Sonuç ekranların sırasıyla seçiliyor: önce senaryonun ve ligin sonucu,
 * sonra devralınmak, sonra zafer (kapatılmış olsa da: serbest oyunda
 * sürse de koşu kazanılmıştır), yoksa koşu sürüyor.
 */
export type CardTone = 'win' | 'loss' | 'done' | 'live';

export interface CardStat {
  id: 'worth' | 'buildings' | 'takeovers' | 'rank' | 'score';
  label: string;
  value: string;
}

export interface CityCardFacts {
  company: string;
  /** Oyuncunun şehirdeki rengi (çatılar, kamyonlar): kartta şirketin işareti. */
  color: string;
  /** Koşunun türü: serbest oyun ve zorluğu, senaryo, lig, günün koşusu. */
  mode: string;
  outcome: string;
  tone: CardTone;
  /** Kartın günü ve takvimdeki tarihi. */
  when: string;
  stats: CardStat[];
  /** Şirketin yolu ve kârın kaynakları; kâr yoksa yok. */
  path: { title: string; name: string; sources: Array<{ id: string; label: string; share: number }>; legend: string } | null;
  /** Ekran okuyucu ve paylaşım metni: kartın bütün söyledikleri tek cümlede. */
  summary: string;
  filename: string;
}

/** Kartın dosya adı: şirketin adı ASCII (bkz. `fileSlug`) ve gün. */
export function cardFilename(company: string, day: number): string {
  return t('hud.card.filename', { company: fileSlug(company), day });
}

function modeOf(state: GameState): string {
  const scenario = scenarioDefOf(state);
  if (scenario) return t('hud.career.mode.scenario', { title: scenario.title });
  if (state.league) {
    return leagueBoardKind(state.league.weekId) === 'day'
      ? `${t('hud.career.mode.daily')} · ${state.league.weekId}`
      : `${t('hud.career.mode.league')} · ${state.league.weekId}`;
  }
  return t('hud.card.free', { difficulty: getDifficulty(state.difficulty).name });
}

function outcomeOf(state: GameState): { outcome: string; tone: CardTone } {
  const scenario = state.scenario;
  if (scenario?.finishedDay !== undefined) {
    return scenario.outcome === 'won'
      ? { outcome: t('hud.card.scenarioWon', { stars: starRow(scenario.stars ?? 0) }), tone: 'win' }
      : { outcome: t('hud.card.scenarioLost'), tone: 'loss' };
  }
  const league = state.league;
  if (league?.finishedDay !== undefined) {
    if (league.outcome === 'lost') return { outcome: t('app.league.result.titleLost'), tone: 'loss' };
    return {
      outcome: t(leagueBoardKind(league.weekId) === 'day' ? 'hud.career.result.dailyFinished' : 'hud.career.result.leagueFinished'),
      tone: 'done',
    };
  }
  if (state.gameOver) return { outcome: t('hud.gameOver.title'), tone: 'loss' };
  if (state.victory) {
    const title = t(state.victory.kind === 'monopoly' ? 'hud.victory.titleMonopoly' : 'hud.victory.titleNetWorth');
    return { outcome: t('hud.card.victory', { title, day: state.victory.day }), tone: 'win' };
  }
  return { outcome: t('hud.card.live'), tone: 'live' };
}

function statsOf(state: GameState): CardStat[] {
  const player = getPlayer(state);
  const ranking = companyRanking(state);
  const row = ranking.find((entry) => entry.company.id === player.id);
  const worth: CardStat = { id: 'worth', label: t('hud.topbar.netWorth'), value: formatMoney(player.netWorth) };
  const buildings: CardStat = { id: 'buildings', label: t('hud.card.stat.buildings'), value: String(row?.buildings ?? 0) };
  const takeovers: CardStat = { id: 'takeovers', label: t('hud.card.stat.takeovers'), value: String(companyPath(state).acquisitions) };
  // Lig koşusunda sıralamanın yerinde skor: tabloya giden sayı o.
  if (state.league?.finishedDay !== undefined) {
    const score = state.league.outcome === 'lost' ? 0 : (state.league.score ?? 0);
    return [{ id: 'score', label: t('hud.card.stat.score'), value: formatMoney(score) }, worth, buildings, takeovers];
  }
  const rank: CardStat = {
    id: 'rank',
    label: t('hud.topbar.rank'),
    value: t('hud.card.rank', { rank: row?.rank ?? ranking.length, of: ranking.length }),
  };
  return [worth, buildings, takeovers, rank];
}

function pathOf(state: GameState): CityCardFacts['path'] {
  // Zafer ekranı gibi: zafer günü donan yol (uzaktaki şehir sonra da yaşıyor; Codex #91).
  const live = companyPath(state);
  const frozen = state.victory?.path;
  const path = frozen ? PATH_BY_ID[frozen] : live.path;
  const shares = (frozen && state.victory?.shares) || live.shares;
  const sources = PATH_SOURCES.map((id) => ({
    id,
    label: t(`hud.path.source.${id}` as MessageKey),
    share: Math.round(shares[id] * 100),
  })).filter((source) => source.share > 0);
  if (!path || sources.length === 0) return null;
  sources.sort((a, b) => b.share - a.share);
  return {
    title: t(frozen ? 'hud.path.victoryTitle' : 'hud.path.title'),
    name: path.name,
    sources,
    legend: sources.map((source) => `${source.label} ${formatPercent(source.share)}`).join(' · ') };
}

export function cityCardFacts(state: GameState, safePalette = false): CityCardFacts {
  const player = getPlayer(state);
  const { outcome, tone } = outcomeOf(state);
  const day = state.time.day;
  const when = t('hud.card.when', { day, date: formatDate(day) });
  const stats = statsOf(state);
  const path = pathOf(state);
  // Tek kaynaklı yolda kaynağın adı yolun adıyla aynı: metin yinelenmesin.
  const pathText = !path ? '' : path.sources.length > 1 ? t('hud.card.path', { name: path.name, sources: path.legend }) : t('hud.card.pathOnly', { name: path.name });
  const summary = [
    `${player.name} — ${outcome}`,
    `${modeOf(state)}, ${when}`,
    stats.map((stat) => `${stat.label}: ${stat.value}`).join(', '),
    pathText,
  ]
    .filter(Boolean)
    .join('. ');
  return {
    company: player.name,
    color: safePalette ? PLAYER_ACCENT.safe : PLAYER_ACCENT.standard,
    mode: modeOf(state),
    outcome,
    tone,
    when,
    stats,
    path,
    summary: `${summary}.`,
    filename: cardFilename(player.name, day),
  };
}
