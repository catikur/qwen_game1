import type { ReactElement } from 'react';
import { PATHS, PATH_BY_ID, PATH_SOURCES, formatPercent } from '@capital/content';
import type { PathId } from '@capital/content';
import { companyPath } from '@capital/core';
import type { GameState } from '@capital/core';
import { t } from './i18n';
import type { MessageKey } from './i18n';

/**
 * Şirketin yolu (Tur 61): kârın kaynağı ve yolun adı.
 *
 * Hedefler panelinde bugüne kadarki yol, zafer ekranında zafer gününde
 * donan yol ve payları (`victory`): uzaktaki şehir zaferden sonra da
 * yaşıyor, ekran yolu açıklayan günü çiziyor (Codex #91). Çubuklar koşu
 * boyunca toplanan kârın payı; yolun eşikleri altta yazıyor, oyuncu hangi
 * yola ne kadar kaldığını bilsin.
 */
export function PathSummary({ state, victory }: { state: GameState; victory?: GameState['victory'] }): ReactElement {
  const live = companyPath(state);
  const frozen = victory?.path;
  const path = frozen ? PATH_BY_ID[frozen] : live.path;
  const shares = (frozen && victory?.shares) || live.shares;
  const acquisitions = frozen ? (victory?.acquisitions ?? live.acquisitions) : live.acquisitions;
  const empty = PATH_SOURCES.every((source) => shares[source] === 0);
  const rule = (id: PathId) => PATHS.find((def) => def.id === id)!;
  return (
    <section className="path-summary" data-path={path.id}>
      <h4 className="path-head">
        {t(frozen ? 'hud.path.victoryTitle' : 'hud.path.title')}: <strong data-path-name>{path.name}</strong>
      </h4>
      {empty ? (
        <p className="muted">{t('hud.path.empty')}</p>
      ) : (
        <>
          <p className="muted path-blurb">{path.blurb}</p>
          <ul className="path-sources">
            {PATH_SOURCES.map((source) => {
              const share = Math.round(shares[source] * 100);
              const label = t(`hud.path.source.${source}` as MessageKey);
              return (
                <li key={source} className="path-source" data-path-source={source} data-share={share}>
                  <span className="path-source-label">{label}</span>
                  <div className="goal-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={share} aria-label={label}>
                    <span style={{ width: `${share}%` }} />
                  </div>
                  <span className="path-source-share">{formatPercent(share)}</span>
                </li>
              );
            })}
          </ul>
          {acquisitions > 0 && <p className="muted">{t('hud.path.acquisitions', { count: acquisitions })}</p>}
        </>
      )}
      <p className="muted path-rule">
        {t('hud.path.rule', {
          realestate: formatPercent(Math.round((rule('realestate').share ?? 0) * 100)),
          energy: formatPercent(Math.round((rule('energy').share ?? 0) * 100)),
          freight: formatPercent(Math.round((rule('freight').share ?? 0) * 100)),
          acquisitions: rule('takeover').acquisitions ?? 0,
        })}
      </p>
    </section>
  );
}
