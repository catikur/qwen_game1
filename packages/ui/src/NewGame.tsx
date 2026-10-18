import { useState } from 'react';
import type { ReactElement } from 'react';
import { CEOS, CITY_SIZES, DEFAULT_CEO_ID, DEFAULT_CITY_SIZE, DEFAULT_DIFFICULTY, DIFFICULTIES, SCENARIOS, getCitySize, getDifficulty } from '@capital/content';
import type { CitySizeId, DifficultyId, ScenarioDef } from '@capital/content';
import { formatMoney, leagueWeekId, scenarioGoalText, scenarioScoreText } from '@capital/core';
import { CeoPortrait } from './CeoPortrait';
import { LocalePicker } from './LocalePicker';
import { t } from './i18n';
import { tutorialSeen } from './tutorial';
import { scenarioRecord } from './scenarioBest';
import { starRow, starThresholds } from './ScenarioScreens';

/**
 * Kurulumun sayılarla özeti: şehir, zorluk, başlangıç günü, süre, kasa.
 * İkinci şehirle başlayan senaryoda oyuncu yeni şehrin ilk gününde,
 * sermayeyle; kurucu şehrin günü ve kasası ayrı.
 */
function scenarioSetupLine(def: ScenarioDef): string {
  const second = def.setup.secondCity;
  if (second) {
    return t('hud.scenario.setupLineHolding', {
      size: getCitySize(second.citySize).name,
      difficulty: getDifficulty(def.difficulty).name,
      days: def.days,
      capital: formatMoney(second.capital),
      day: def.preludeDays,
      cash: formatMoney(def.setup.cash),
    });
  }
  return t('hud.scenario.setupLine', {
    size: getCitySize(def.citySize).name,
    difficulty: getDifficulty(def.difficulty).name,
    day: def.preludeDays,
    days: def.days,
    cash: formatMoney(def.setup.cash),
  });
}

/** Listede senaryonun cihazdaki durumu. */
function scenarioStatus(def: ScenarioDef): string {
  const record = scenarioRecord(def.id);
  if (record.best) return `${starRow(record.best.stars)} · ${scenarioScoreText(def, record.best.score)}`;
  if (record.attempts > 0) return t('hud.scenario.statusTried', { count: record.attempts });
  return t('hud.scenario.statusNew');
}

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
  initialScenario,
}: {
  onStart: (
    companyName: string,
    ceoId: string,
    difficulty: DifficultyId,
    league: boolean,
    citySize: CitySizeId,
    tutorial: boolean,
    scenarioId: string | null,
  ) => void;
  onCancel?: () => void;
  /** Senaryodan dönen oyuncu listeye düşsün (Tur 39). */
  initialScenario?: string;
}): ReactElement {
  const [name, setName] = useState('');
  const [ceoId, setCeoId] = useState(DEFAULT_CEO_ID);
  const [difficulty, setDifficulty] = useState<DifficultyId>(DEFAULT_DIFFICULTY);
  // Oyun türü: serbest şehir, haftanın tohumu ya da senaryo (Tur 39).
  const [mode, setMode] = useState<'free' | 'league' | 'scenario'>(initialScenario ? 'scenario' : 'free');
  const league = mode === 'league';
  const [scenarioId, setScenarioId] = useState<string>(initialScenario ?? SCENARIOS[0]!.id);
  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0]!;
  const free = mode === 'free';
  const [citySize, setCitySize] = useState<CitySizeId>(DEFAULT_CITY_SIZE);
  // Rehber ilk oyunda açık gelir; bu tarayıcıda bir kez bitirilen ya da
  // kapatılan rehber bir daha kendiliğinden açılmaz (Tur 26).
  const [tutorial, setTutorialOption] = useState(() => !tutorialSeen());
  const size = CITY_SIZES.find((c) => c.id === citySize) ?? CITY_SIZES[0]!;
  const weekId = leagueWeekId();
  const selected = CEOS.find((c) => c.id === ceoId) ?? CEOS[0]!;
  const level = DIFFICULTIES.find((d) => d.id === difficulty) ?? DIFFICULTIES[1]!;

  // Lig herkese aynı şehri verir: zorluk Dengeli, şehir standart. Senaryonun
  // şehri ve zorluğu tanımından; rehber ilk oyun içindir, senaryoda kapalı.
  const submit = () =>
    onStart(
      name.trim() || t('hud.newGame.defaultName'),
      ceoId,
      league ? 'normal' : mode === 'scenario' ? scenario.difficulty : difficulty,
      league,
      league ? 'standard' : mode === 'scenario' ? scenario.citySize : citySize,
      mode === 'scenario' ? false : tutorial,
      mode === 'scenario' ? scenario.id : null,
    );

  return (
    <div className="newgame">
      <div className="newgame-inner">
        <div className="newgame-locale">
          <LocalePicker />
        </div>
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
          <div className="difficulty-picker mode-picker game-mode" role="radiogroup" aria-label={t('hud.newGame.modeGroup')}>
            <button
              type="button"
              role="radio"
              aria-checked={free}
              className={`difficulty-option${free ? ' selected' : ''}`}
              data-mode="free"
              onClick={() => setMode('free')}
            >
              {t('hud.newGame.modeFree')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={league}
              className={`difficulty-option${league ? ' selected' : ''}`}
              data-mode="league"
              onClick={() => setMode('league')}
            >
              {t('hud.newGame.modeLeague', { week: weekId })}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'scenario'}
              className={`difficulty-option${mode === 'scenario' ? ' selected' : ''}`}
              data-mode="scenario"
              onClick={() => setMode('scenario')}
            >
              {t('hud.newGame.modeScenario')}
            </button>
          </div>
          {league && (
            <div className="difficulty-detail" data-detail="league">
              <p>{t('hud.newGame.leagueBlurb')}</p>
              <ul>
                <li>{t('hud.newGame.leagueFactRules')}</li>
                <li>{t('hud.newGame.leagueFactGhost')}</li>
              </ul>
            </div>
          )}
          {mode === 'scenario' && (
            <div className="scenario-pick" data-detail="scenario">
              <ul className="scenario-list" role="radiogroup" aria-label={t('hud.scenario.listLabel')}>
                {SCENARIOS.map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={option.id === scenario.id}
                      className={`scenario-card${option.id === scenario.id ? ' selected' : ''}`}
                      data-scenario={option.id}
                      onClick={() => setScenarioId(option.id)}
                    >
                      <span className="scenario-card-title">{option.title}</span>
                      <span className="scenario-card-tagline">{option.tagline}</span>
                      <span className="scenario-card-status" data-scenario-status>
                        {scenarioStatus(option)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="difficulty-detail scenario-detail">
                <p>{scenario.brief}</p>
                <p className="scenario-goal">
                  <span className="tag good">{t('hud.scenario.goal')}</span> {scenarioGoalText(scenario)}
                </p>
                <ul>
                  {scenario.facts.map((fact) => (
                    <li key={fact}>{fact}</li>
                  ))}
                </ul>
                <p className="muted scenario-setup">{scenarioSetupLine(scenario)}</p>
                <p className="muted scenario-stars">{starThresholds(scenario)}</p>
              </div>
            </div>
          )}
        </div>

        {/*
          Zorluk görünmez bir bonus değil: seçilen kademenin farkları
          açıkça yazıyor. Oyuncu neye razı olduğunu bilerek başlamalı.
        */}
        {free && (
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
          <div className="difficulty-detail" data-detail="difficulty">
            <p>{level.blurb}</p>
            <ul>
              {level.facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </div>
        </div>
        )}

        {free && (
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
          <div className="difficulty-detail" data-detail="city-size">
            <p>{size.blurb}</p>
            <ul>
              {size.facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </div>
        </div>
        )}

        {mode !== 'scenario' && (
          <label className="newgame-tutorial" data-newgame-tutorial>
            <input type="checkbox" checked={tutorial} onChange={(e) => setTutorialOption(e.target.checked)} />
            <span>
              <strong>{t('app.coach.newGameOption')}</strong>
              <span className="muted">{t('app.coach.newGameHint')}</span>
            </span>
          </label>
        )}

        <div className="newgame-actions">
          {onCancel && (
            <button type="button" onClick={onCancel}>
              {t('hud.newGame.cancel')}
            </button>
          )}
          <button type="button" className="primary" onClick={submit} data-newgame-start>
            {mode === 'scenario' ? t('hud.newGame.startScenario') : t('hud.newGame.start')}
          </button>
        </div>
      </div>
    </div>
  );
}
