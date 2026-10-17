import { useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';
import { CARD_BY_ID, CATEGORIES, fillTemplate, formatPercent } from '@capital/content';
import type { CardChoiceDef, CardEffect } from '@capital/content';
import { cardParams, formatMoney, rivalProfile } from '@capital/core';
import type { CardBoost, CardState } from '@capital/core';
import { CeoPortrait } from './CeoPortrait';
import { useGame, useGameState } from './useGame';
import { t } from './i18n';
import type { MessageKey } from './i18n';

/**
 * Karar kartı (Tur 37b).
 *
 * Masaya gelen kart haritanın üstünde, rıhtımın hemen üstünde açılıyor.
 * Oyunu durdurmuyor (casual kuralı) ve "Sonra" ile küçülüyor: gündemdeki
 * çip geri sayımı taşıyor ve dokununca kartı yeniden açıyor.
 *
 * Her seçeneğin bedeli ve getirisi RAKAMLA yazılı — "reklama dönüştür"
 * ne kazandırır sorusunun cevabı tahmin değil: kartın tutarı teklif
 * gününde sabitleniyor, gösterilen bedel ödenen bedel. Şanslı
 * seçeneklerde ihtimal ve "tutmazsa" satırı da açık.
 */

// ------------------------------------------------------------ açık/kapalı

/** Küçültülmüş kartın anahtarı (kart kimliği + teklif günü); yeni kart her zaman açık gelir. */
let closedKey: string | null = null;
const listeners = new Set<() => void>();

function keyOf(card: CardState): string {
  return `${card.defId}:${card.offeredDay}`;
}

function setClosed(key: string | null): void {
  closedKey = key;
  for (const listener of listeners) listener();
}

/** Gündem çipi: küçültülmüş kartı yeniden aç. */
export function reopenDecisionCard(): void {
  setClosed(null);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const readClosed = (): string | null => closedKey;

// ------------------------------------------------------------ etki dili

interface Chip {
  text: string;
  tone: 'good' | 'bad' | 'neutral';
}

function signedPercent(value: number): string {
  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? '+' : '−'}${formatPercent(Math.abs(rounded))}`;
}

/** Bir etki listesinin okunur özeti: "−82 B ₺", "Çekicilik +%20 · 30 gün · Market". */
export function effectChips(card: CardState, effects: readonly CardEffect[]): Chip[] {
  const chips: Chip[] = [];
  for (const effect of effects) {
    if (effect.kind === 'cash') {
      const amount = card.amount * effect.times;
      chips.push({
        text: `${amount < 0 ? '−' : '+'}${formatMoney(Math.abs(amount))}`,
        tone: amount < 0 ? 'neutral' : 'good',
      });
    } else if (effect.kind === 'boost') {
      const change = effect.multiplier - 1;
      // Çekicilik artısı iyi; bakım, ücret, satış maliyeti eksisi iyi.
      const good = effect.target === 'attraction' ? change > 0 : change < 0;
      const scope =
        effect.category && card.category ? CATEGORIES[card.category].name : t('hud.card.scopeAll');
      chips.push({
        text: t(`hud.card.boost.${effect.target}` as MessageKey, {
          change: signedPercent(change),
          days: effect.days,
          scope,
        }),
        tone: good ? 'good' : 'bad',
      });
    } else if (effect.kind === 'pressure') {
      chips.push({
        text: t('hud.card.pressure', { change: `${effect.delta > 0 ? '+' : '−'}${Math.round(Math.abs(effect.delta) * 100)}` }),
        tone: effect.delta < 0 ? 'good' : 'bad',
      });
    }
  }
  return chips;
}

function Chips({ chips }: { chips: Chip[] }): ReactElement {
  return (
    <span className="card-effects">
      {chips.map((chip, index) => (
        <span key={index} className={`card-effect tone-${chip.tone}`}>
          {chip.text}
        </span>
      ))}
    </span>
  );
}

function ChoiceButton({
  card,
  choice,
  params,
  onChoose,
}: {
  card: CardState;
  choice: CardChoiceDef;
  params: Record<string, string>;
  onChoose: () => void;
}): ReactElement {
  const chips = effectChips(card, choice.effects);
  const fail = choice.odds !== undefined ? effectChips(card, choice.fail ?? []) : [];
  return (
    <button type="button" className="card-choice" data-card-choice={choice.id} onClick={onChoose}>
      <span className="card-choice-label">{fillTemplate(choice.label, params)}</span>
      <span className="card-choice-flavor">{fillTemplate(choice.flavor, params)}</span>
      {choice.odds !== undefined && (
        <span className="card-odds">{t('hud.card.odds', { odds: formatPercent(Math.round(choice.odds * 100)) })}</span>
      )}
      {chips.length > 0 ? <Chips chips={chips} /> : <span className="card-effects card-none">{t('hud.card.nothing')}</span>}
      {choice.odds !== undefined && (
        <span className="card-fail">
          {t('hud.card.otherwise')} {fail.length > 0 ? <Chips chips={fail} /> : t('hud.card.nothing')}
        </span>
      )}
    </button>
  );
}

export function DecisionCard(): ReactElement | null {
  const state = useGameState();
  const { run, view } = useGame();
  const closed = useSyncExternalStore(subscribe, readClosed, readClosed);
  const card = state.card;
  const def = card ? CARD_BY_ID[card.defId] : undefined;
  if (!card || !def || state.gameOver) return null;
  if (closed === keyOf(card)) return null;
  /*
   * Oyuncu başka bir işin ortasındayken kart çekiliyor: panel açıkken,
   * arsa seçiliyken (telefonda alttaki "Satın al" düğmesini örterdi) ya
   * da yerleştirme modunda. Gündem çipi geri sayımı taşımaya devam ediyor;
   * iş bitince kart kendiliğinden geri geliyor.
   */
  if (view.openPanel !== 'none' || view.selectedTileId !== null || view.ghostDefId !== null) return null;

  const params = cardParams(state, card);
  const left = Math.max(0, card.deadlineDay - state.time.day);
  const rival = card.rivalId ? state.companies[card.rivalId] : undefined;
  const profile = rivalProfile(state, rival?.profileId);
  const fallback = def.choices.find((choice) => choice.id === def.fallback);

  return (
    <section className="decision-card" role="dialog" aria-label={t('hud.card.label')} data-card={def.id}>
      <header className="card-head">
        {profile && (
          <span className="card-face" title={`${profile.ceoName} · ${profile.name}`}>
            <CeoPortrait portrait={profile.portrait} size={40} />
          </span>
        )}
        <div className="card-heading">
          <span className="card-eyebrow">
            {t('hud.card.eyebrow')} · <span className="card-days">{t('hud.agenda.daysShort', { days: left })}</span>
          </span>
          <h2 className="card-title">{fillTemplate(def.title, params)}</h2>
        </div>
        <button
          type="button"
          className="card-later"
          onClick={() => setClosed(keyOf(card))}
          title={t('hud.card.laterTitle')}
        >
          {t('hud.card.later')}
        </button>
      </header>
      <p className="card-body">{fillTemplate(def.body, params)}</p>
      <div className="card-choices">
        {def.choices.map((choice) => (
          <ChoiceButton
            key={choice.id}
            card={card}
            choice={choice}
            params={params}
            onChoose={() => run({ type: 'CHOOSE_CARD', choiceId: choice.id })}
          />
        ))}
      </div>
      {fallback && (
        <p className="card-fallback">{t('hud.card.fallback', { choice: fillTemplate(fallback.label, params), days: left })}</p>
      )}
    </section>
  );
}

/** Şirket panelinde süren kart etkileri: "Çekicilik +%20 · 12 gün · Market". */
export function BoostChips({ boosts, day }: { boosts: readonly CardBoost[]; day: number }): ReactElement {
  const chips = boosts
    .filter((boost) => boost.untilDay >= day)
    .map((boost): Chip => {
      const change = boost.multiplier - 1;
      const good = boost.target === 'attraction' ? change > 0 : change < 0;
      return {
        text: t(`hud.card.boost.${boost.target}` as MessageKey, {
          change: signedPercent(change),
          days: boost.untilDay - day + 1,
          scope: boost.category ? CATEGORIES[boost.category].name : t('hud.card.scopeAll'),
        }),
        tone: good ? 'good' : 'bad',
      };
    });
  return <Chips chips={chips} />;
}
