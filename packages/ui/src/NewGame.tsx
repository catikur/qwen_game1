import { useState } from 'react';
import type { ReactElement } from 'react';
import { CEOS, CITY_SIZES, DEFAULT_CEO_ID, DEFAULT_CITY_SIZE, DEFAULT_DIFFICULTY, DIFFICULTIES } from '@capital/content';
import type { CitySizeId, DifficultyId } from '@capital/content';
import { leagueWeekId } from '@capital/core';
import { CeoPortrait } from './CeoPortrait';
import { t } from './i18n';

/**
 * Açılış ekranı.
 *
 * Oyuncu doğrudan tabloya düşmek yerine masaya bir kimlikle oturuyor:
 * şirketin adı ve kimin yönettiği. İki soru, tek ekran, tek buton —
 * "sıkmadan içine çekmek" kuralı burada da geçerli.
 */
export function NewGameScreen({
  onStart,
  onCancel,
}: {
  onStart: (companyName: string, ceoId: string, difficulty: DifficultyId, league: boolean, citySize: CitySizeId) => void;
  onCancel?: () => void;
}): ReactElement {
  const [name, setName] = useState('');
  const [ceoId, setCeoId] = useState(DEFAULT_CEO_ID);
  const [difficulty, setDifficulty] = useState<DifficultyId>(DEFAULT_DIFFICULTY);
  const [league, setLeague] = useState(false);
  const [citySize, setCitySize] = useState<CitySizeId>(DEFAULT_CITY_SIZE);
  const size = CITY_SIZES.find((c) => c.id === citySize) ?? CITY_SIZES[0]!;
  const weekId = leagueWeekId();
  const selected = CEOS.find((c) => c.id === ceoId) ?? CEOS[0]!;
  const level = DIFFICULTIES.find((d) => d.id === difficulty) ?? DIFFICULTIES[1]!;

  // Lig herkese aynı şehri verir: zorluk Dengeli, şehir standart.
  const submit = () =>
    onStart(name.trim() || t('hud.newGame.defaultName'), ceoId, league ? 'normal' : difficulty, league, league ? 'standard' : citySize);

  return (
    <div className="newgame">
      <div className="newgame-inner">
        <header className="newgame-head">
          <p className="newgame-eyebrow">{t('hud.newGame.eyebrow')}</p>
          <h1>{t('hud.newGame.title')}</h1>
          <p className="newgame-lead">{t('hud.newGame.lead')}</p>
        </header>

        <label className="newgame-field">
          <span>{t('hud.newGame.nameLabel')}</span>
          <input
            type="text"
            value={name}
            maxLength={32}
            autoFocus
            placeholder={t('hud.newGame.namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
        </label>

        <div className="newgame-field">
          <span>{t('hud.newGame.ceoQuestion')}</span>
          <ul className="ceo-grid">
            {CEOS.map((ceo) => (
              <li key={ceo.id}>
                <button
                  type="button"
                  className={`ceo-card${ceo.id === ceoId ? ' selected' : ''}`}
                  onClick={() => setCeoId(ceo.id)}
                  aria-pressed={ceo.id === ceoId}
                >
                  <CeoPortrait portrait={ceo.portrait} size={72} />
                  <span className="ceo-name">{ceo.name}</span>
                  <span className="ceo-title">{ceo.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="ceo-detail">
          <CeoPortrait portrait={selected.portrait} size={104} />
          <div>
            <h2>
              {selected.name} <span className="ceo-title">· {selected.title}</span>
            </h2>
            <p className="ceo-bio">{selected.bio}</p>
            <p className="ceo-perk">
              <span className="tag good">{t('hud.ceo.strength')}</span> {selected.perk}
            </p>
            <p className="ceo-perk">
              <span className="tag bad">{t('hud.ceo.weakness')}</span> {selected.drawback}
            </p>
          </div>
        </div>

        {/*
          Oyun türü: serbest şehir ya da haftanın tohumu. Ligde şehir ve
          kurallar herkes için aynı; zorluk seçimi bu yüzden kalkıyor.
        */}
        <div className="newgame-field">
          <span>{t('hud.newGame.modeQuestion')}</span>
          <div className="difficulty-picker mode-picker" role="radiogroup" aria-label={t('hud.newGame.modeGroup')}>
            <button
              type="button"
              role="radio"
              aria-checked={!league}
              className={`difficulty-option${!league ? ' selected' : ''}`}
              data-mode="free"
              onClick={() => setLeague(false)}
            >
              {t('hud.newGame.modeFree')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={league}
              className={`difficulty-option${league ? ' selected' : ''}`}
              data-mode="league"
              onClick={() => setLeague(true)}
            >
              {t('hud.newGame.modeLeague', { week: weekId })}
            </button>
          </div>
          {league && (
            <div className="difficulty-detail">
              <p>{t('hud.newGame.leagueBlurb')}</p>
              <ul>
                <li>{t('hud.newGame.leagueFactRules')}</li>
                <li>{t('hud.newGame.leagueFactGhost')}</li>
              </ul>
            </div>
          )}
        </div>

        {/*
          Zorluk görünmez bir bonus değil: seçilen kademenin farkları
          açıkça yazıyor. Oyuncu neye razı olduğunu bilerek başlamalı.
        */}
        {!league && (
        <div className="newgame-field">
          <span>{t('hud.newGame.difficultyQuestion')}</span>
          <div className="difficulty-picker" role="radiogroup" aria-label={t('hud.newGame.difficultyGroup')}>
            {DIFFICULTIES.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={option.id === difficulty}
                className={`difficulty-option${option.id === difficulty ? ' selected' : ''}`}
                data-difficulty={option.id}
                onClick={() => setDifficulty(option.id)}
              >
                {option.name}
              </button>
            ))}
          </div>
          <div className="difficulty-detail">
            <p>{level.blurb}</p>
            <ul>
              {level.facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </div>
        </div>
        )}

        {!league && (
        <div className="newgame-field">
          <span>{t('hud.newGame.sizeQuestion')}</span>
          <div className="difficulty-picker mode-picker" role="radiogroup" aria-label={t('hud.newGame.sizeGroup')}>
            {CITY_SIZES.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={option.id === citySize}
                className={`difficulty-option${option.id === citySize ? ' selected' : ''}`}
                data-city-size={option.id}
                onClick={() => setCitySize(option.id)}
              >
                {option.name}
              </button>
            ))}
          </div>
          <div className="difficulty-detail">
            <p>{size.blurb}</p>
            <ul>
              {size.facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </div>
        </div>
        )}

        <div className="newgame-actions">
          {onCancel && (
            <button type="button" onClick={onCancel}>
              {t('hud.newGame.cancel')}
            </button>
          )}
          <button type="button" className="primary" onClick={submit}>
            {t('hud.newGame.start')}
          </button>
        </div>
      </div>
    </div>
  );
}
