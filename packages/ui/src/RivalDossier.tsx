import type { ReactElement } from 'react';
import { RELATION, formatDecimal, rivalBio } from '@capital/content';
import type { RelationEventKind } from '@capital/content';
import { amendsBlocker, amendsCost, formatMoney, relationScore, rivalProfile, stanceOf, temperamentOf } from '@capital/core';
import { CeoPortrait } from './CeoPortrait';
import { t } from './i18n';
import type { MessageKey } from './i18n';
import { useGame, useGameState } from './useGame';

/**
 * Rakibin dosyası (Tur 59): CEO'su kim, nasıl biri, seni nasıl hatırlıyor.
 *
 * Rakipler paneli eskiden bir sıralama tablosuydu. Şimdi her rakibin bir
 * dosyası var: CEO'nun yüzü, geçmişi ve mizacı; oyuncuya karşı ilişki
 * puanı (−100..100) ve eşikleri; hafızadaki son olaylar; bugün sana karşı
 * ne yaptığı (husumet ya da ittifak); ve uzlaşma. Puanın her kıpırtısı
 * bir olaydan: dosya hepsini yazıyor.
 */
const MEMORY_LABEL: Record<RelationEventKind, MessageKey> = {
  shares: 'panels.rival.memory.shares',
  sold: 'panels.rival.memory.sold',
  outbid: 'panels.rival.memory.outbid',
  lobbyAgainst: 'panels.rival.memory.lobbyAgainst',
  lobbyWith: 'panels.rival.memory.lobbyWith',
  freight: 'panels.rival.memory.freight',
  freightCancel: 'panels.rival.memory.freightCancel',
  undercut: 'panels.rival.memory.undercut',
  campaignHeld: 'panels.rival.memory.campaignHeld',
  settled: 'panels.rival.memory.settled',
  amends: 'panels.rival.memory.amends',
  feud: 'panels.rival.memory.feud',
};

/** Rakiplerin satırındaki ilişki çipi. */
export function RelationChip({ companyId }: { companyId: string }): ReactElement | null {
  const state = useGameState();
  const company = state.companies[companyId];
  if (!company || company.isPlayer || !rivalProfile(state, company.profileId)) return null;
  const stance = stanceOf(state, companyId);
  const score = Math.round(relationScore(company));
  const label = stance === 'hostile' ? t('panels.rival.stance.hostile') : stance === 'allied' ? t('panels.rival.stance.allied') : t('panels.rival.stance.neutral');
  return (
    <span className={`relation-chip stance-${stance ?? 'neutral'}`} data-relation-chip={companyId} data-stance={stance ?? 'neutral'}>
      {label} <span className="relation-score">{score > 0 ? `+${score}` : score}</span>
    </span>
  );
}

export function RivalDossier({ companyId }: { companyId: string }): ReactElement | null {
  const { run } = useGame();
  const state = useGameState();
  const company = state.companies[companyId];
  const profile = rivalProfile(state, company?.profileId);
  const temperament = temperamentOf(state, companyId);
  if (!company || !profile || !temperament) return null;

  const score = relationScore(company);
  const stance = stanceOf(state, companyId);
  const relation = company.relation;
  const cost = amendsCost(state, companyId);
  const blocker = amendsBlocker(state, companyId);
  // Ölçek −100..100 → çubukta %0..100; eşikler çubuğun üstünde çizgi.
  const at = (value: number): string => `${((value - RELATION.min) / (RELATION.max - RELATION.min)) * 100}%`;
  const signed = (value: number): string => (value > 0 ? `+${formatDecimal(value, 1)}` : formatDecimal(value, 1));

  return (
    <section className="rival-dossier" data-rival-dossier={companyId} aria-label={t('panels.rival.aria', { name: company.name })}>
      <header className="dossier-head">
        <CeoPortrait portrait={profile.portrait} size={64} />
        <div className="dossier-who">
          <strong>{profile.ceoName}</strong>
          <span className="muted">{t('panels.rival.ceoOf', { name: company.name })}</span>
          <span className={`temperament-chip temperament-${temperament.id}`} data-temperament={temperament.id}>
            {temperament.name}
          </span>
        </div>
      </header>
      <p className="dossier-bio">{rivalBio(profile.id, profile.trait)}</p>
      <p className="muted dossier-temperament">{temperament.description}</p>

      <div className="relation-meter" data-relation-score={Math.round(score)} data-stance={stance ?? 'neutral'}>
        <div className="relation-meter-head">
          <span>{t('panels.rival.relation')}</span>
          <RelationChip companyId={companyId} />
        </div>
        <div className="relation-bar" role="img" aria-label={t('panels.rival.barAria', { score: Math.round(score) })}>
          <span className="relation-mark hostile" style={{ left: at(RELATION.hostileAt) }} />
          <span className="relation-mark allied" style={{ left: at(RELATION.allyAt) }} />
          <span className={`relation-fill ${score < 0 ? 'neg' : 'pos'}`} style={score < 0 ? { left: at(score), right: '50%' } : { left: '50%', right: `calc(100% - ${at(score)})` }} />
        </div>
        <p className="muted relation-scale">
          {t('panels.rival.scale', { hostile: RELATION.hostileAt, ally: RELATION.allyAt, fadeHostile: formatDecimal(temperament.fadeHostile, 2), fadeFriendly: formatDecimal(temperament.fadeFriendly, 2) })}
        </p>
      </div>

      {stance && (
        <ul className={`relation-effects stance-${stance}`} data-relation-effects={stance}>
          {(stance === 'hostile'
            ? (['panels.rival.hostile.campaign', 'panels.rival.hostile.lobby', 'panels.rival.hostile.auction'] as const)
            : (['panels.rival.allied.campaign', 'panels.rival.allied.lobby', 'panels.rival.allied.auction'] as const)
          ).map((key) => (
            <li key={key}>{t(key, { counter: Math.round(RELATION.counterLobby * 100), ally: Math.round(RELATION.allyLobby * 100), spite: Math.round((RELATION.spite - 1) * 100) })}</li>
          ))}
        </ul>
      )}

      <div className="dossier-memory">
        <h4>{t('panels.rival.memory.title')}</h4>
        {relation && relation.memory.length > 0 ? (
          <ul>
            {relation.memory.map((entry) => (
              <li key={`${entry.kind}-${entry.day}`} data-memory-kind={entry.kind}>
                <span className="muted">{t('panels.rival.memory.day', { day: entry.day })}</span>
                <span>{t(MEMORY_LABEL[entry.kind])}</span>
                <span className={entry.delta < 0 ? 'neg' : 'pos'}>{signed(entry.delta)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t('panels.rival.memory.empty')}</p>
        )}
      </div>

      <div className="dossier-amends">
        <button
          type="button"
          onClick={() => run({ type: 'MAKE_AMENDS', companyId })}
          disabled={blocker !== null}
          data-amends={companyId}
          data-amends-cost={cost}
          title={blocker ?? t('panels.rival.amendsTitle')}
        >
          {t('panels.rival.amends', { cost: formatMoney(cost), points: Math.round(RELATION.events.amends * temperament.friendly) })}
        </button>
        {blocker && <p className="muted" data-amends-blocker>{blocker}</p>}
      </div>
    </section>
  );
}
