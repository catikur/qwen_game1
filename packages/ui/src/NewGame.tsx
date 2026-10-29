import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { CEOS, CITY_SIZES, CITY_TYPES, DEFAULT_CEO_ID, DEFAULT_CITY_SIZE, DEFAULT_CITY_TYPE, DEFAULT_DIFFICULTY, DIFFICULTIES, MODIFIERS, MODIFIER_BY_ID, SCENARIOS, SCENARIO_BY_ID, formatDecimal, modifierMultiplier, normalizeModifiers, numberLocale } from '@capital/content';
import type { CitySizeId, CityTypeId, DifficultyId, ModifierId, ScenarioDef } from '@capital/content';
import { LEAGUE_DAILY_DAYS, leagueDayId, leagueRule, leagueWeekId } from '@capital/core';
import type { LeagueBoardKind } from '@capital/core';
import { CeoPortrait } from './CeoPortrait';
import { LocalePicker } from './LocalePicker';
import { t } from './i18n';
import { tutorialSeen } from './tutorialStore';
import { ScenarioCard } from './ScenarioCard';
import { ScenarioDetail } from './ScenarioDetail';
import { packLinkCode } from './packLink';
import { CareerPanel, useCareerRevision } from './CareerPanel';
import { SettingsPanel } from './SettingsPanel';
import { useWhatsNewUnseen } from './whatsNew';
import { useDialogFocus } from './dialog';
import { careerSummary } from './career';
import { inviteCode } from './invite';

/** Günün koşusunun adı: "22 Ekim" (etkin dilde; gün UTC). */
function leagueDayLabel(dayId: string): string {
  try {
    return new Intl.DateTimeFormat(numberLocale(), { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${dayId}T00:00:00Z`));
  } catch {
    return dayId;
  }
}

/*
 * Paket rafı (Tur 67) geç iniyor: doğrulayıcı, paylaşım kodu ve rafın
 * metinleri yalnız senaryo sekmesi açılınca. Hazır senaryolar beklemiyor.
 */
const shelf = () => import('./PackShelf');
const PackList = lazy(() => shelf().then((m) => ({ default: m.PackList })));
const PackActions = lazy(() => shelf().then((m) => ({ default: m.PackActions })));
const PackAdd = lazy(() => shelf().then((m) => ({ default: m.PackAdd })));
const PackEditorHost = lazy(() => shelf().then((m) => ({ default: m.PackEditorHost })));

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
  deliverFile,
  notice,
}: {
  onStart: (
    companyName: string,
    ceoId: string,
    difficulty: DifficultyId,
    /** Lig koşusu: haftanın tohumu ya da günün koşusu (Tur 53); serbest oyunda ve senaryoda yok. */
    league: LeagueBoardKind | null,
    citySize: CitySizeId,
    tutorial: boolean,
    /** Hazır ya da yüklü senaryonun kimliği; editörden denenen taslakta tanımın kendisi (Tur 68). */
    scenario: string | ScenarioDef | null,
    modifiers: ModifierId[],
    /** Şehrin türü (Tur 76): yalnız serbest şehirde; lig ve senaryo dengeli. */
    cityType: CityTypeId,
  ) => void;
  onCancel?: () => void;
  /** Senaryodan dönen oyuncu listeye düşsün (Tur 39). */
  initialScenario?: string;
  /** Editörün "dosya olarak indir"i (kabuğun; masaüstünde İndirilenler). */
  deliverFile?: (filename: string, text: string) => Promise<string>;
  /** Açılışta otomatik kayıt açılmadıysa nedeni (Tur 75): oyuncu sessizce yeni oyuna düşmesin. */
  notice?: string;
}): ReactElement {
  const [name, setName] = useState('');
  const [ceoId, setCeoId] = useState(DEFAULT_CEO_ID);
  const [difficulty, setDifficulty] = useState<DifficultyId>(DEFAULT_DIFFICULTY);
  // Ek kurallar (Tur 45): yalnız serbest şehirde, kademenin üstüne.
  const [modifiers, setModifiers] = useState<ModifierId[]>([]);
  const toggleModifier = (id: ModifierId) =>
    setModifiers((current) => normalizeModifiers(current.includes(id) ? current.filter((m) => m !== id) : [...current, id]));
  // Oyun türü: serbest şehir, haftanın tohumu, günün koşusu (Tur 53) ya da senaryo (Tur 39).
  // Davet bağlantısıyla gelen (Tur 55) Tohum Ligi'yle başlıyor: arkadaşının ligine lig panelinden katılıyor.
  // Senaryo bağlantısıyla gelen (Tur 67, `?paket=`) senaryo sekmesinde, kod ekleme kutusunda.
  const invite = inviteCode();
  const [mode, setMode] = useState<'free' | 'league' | 'daily' | 'scenario'>(
    initialScenario || packLinkCode() ? 'scenario' : invite ? 'league' : 'free',
  );
  const league = mode === 'league';
  const daily = mode === 'daily';
  const leagueKind: LeagueBoardKind | null = league ? 'week' : daily ? 'day' : null;
  const [scenarioId, setScenarioId] = useState<string>(initialScenario ?? SCENARIOS[0]!.id);
  // Paketten gelen senaryolar da kayıt defterinde (`registerPack`); silinen senaryo ilk hazıra düşüyor.
  // Raf yeni sürümü aynı kimlikle eklediğinde kimlik değişmiyor: sayaç ayrıntıyı yeniden çizdiriyor (Codex #97).
  const scenario = SCENARIO_BY_ID[scenarioId] ?? SCENARIOS[0]!;
  const [, setPackRevision] = useState(0);
  const refreshPacks = () => setPackRevision((revision) => revision + 1);
  const selectAdded = (id: string) => {
    setScenarioId(id);
    setPackRevision((revision) => revision + 1);
  };
  const free = mode === 'free';
  const [citySize, setCitySize] = useState<CitySizeId>(DEFAULT_CITY_SIZE);
  // Şehrin türü (Tur 76): liman, sanayi, başkent ya da dengeli.
  const [cityType, setCityType] = useState<CityTypeId>(DEFAULT_CITY_TYPE);
  const kind = CITY_TYPES.find((c) => c.id === cityType) ?? CITY_TYPES[0]!;
  // Rehber ilk oyunda açık gelir; bu tarayıcıda bir kez bitirilen ya da
  // kapatılan rehber bir daha kendiliğinden açılmaz (Tur 26).
  const [tutorial, setTutorialOption] = useState(() => !tutorialSeen());
  const size = CITY_SIZES.find((c) => c.id === citySize) ?? CITY_SIZES[0]!;
  const weekId = leagueWeekId();
  const dayLabel = leagueDayLabel(leagueDayId());
  // Haftanın kuralı ve gelecek haftanınki (Tur 53): sıra sabit, oyuncu önceden bilsin.
  const rule = leagueRule(weekId);
  const nextRule = leagueRule(leagueWeekId(new Date(Date.now() + 7 * 86_400_000)));
  const selected = CEOS.find((c) => c.id === ceoId) ?? CEOS[0]!;
  const level = DIFFICULTIES.find((d) => d.id === difficulty) ?? DIFFICULTIES[1]!;
  // Kariyer (Tur 41): oyun dışında da açılabilsin, koşular arasında bakılan yer burası.
  // Ayarlar (Tur 47) da: metin boyutu ve renkler kurulumda da gerekiyor.
  const [overlay, setOverlay] = useState<'none' | 'career' | 'settings'>('none');
  const whatsNew = useWhatsNewUnseen();
  // Oyun içindeki paneller gibi Escape kapatıyor (Tur 44).
  useEffect(() => {
    if (overlay === 'none') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') setOverlay('none');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [overlay]);
  useCareerRevision();
  const career = careerSummary();
  const badges = career.statuses.filter((status) => career.unlocked[status.def.id]).length;

  // Lig herkese aynı şehri verir: zorluk Dengeli, şehir standart. Senaryonun
  // şehri ve zorluğu tanımından; rehber ilk oyun içindir, senaryoda kapalı.
  // Editörün "dene"si (Tur 68): taslağın tanımıyla, kaydetmeden.
  const tryScenario = (def: ScenarioDef) =>
    onStart(name.trim() || t('hud.newGame.defaultName'), ceoId, def.difficulty, null, def.citySize, false, def, [], DEFAULT_CITY_TYPE);

  const submit = () =>
    onStart(
      name.trim() || t('hud.newGame.defaultName'),
      ceoId,
      leagueKind ? 'normal' : mode === 'scenario' ? scenario.difficulty : difficulty,
      leagueKind,
      leagueKind ? 'standard' : mode === 'scenario' ? scenario.citySize : citySize,
      mode === 'scenario' ? false : tutorial,
      mode === 'scenario' ? scenario.id : null,
      free ? modifiers : [],
      free ? cityType : DEFAULT_CITY_TYPE,
    );

  return (
    <div className="newgame">
      <div className="newgame-inner">
        <div className="newgame-locale">
          <button type="button" className="ghost newgame-career" data-career-open onClick={() => setOverlay('career')}>
            {t('hud.career.open', { done: badges, total: career.statuses.length })}
          </button>
          <button
            type="button"
            className="ghost newgame-settings"
            data-settings-open
            data-whats-new={whatsNew || undefined}
            aria-label={whatsNew ? t('hud.settings.openNew') : undefined}
            onClick={() => setOverlay('settings')}
          >
            {t('hud.settings.open')}
            {whatsNew && <span className="whats-new-dot" aria-hidden="true" />}
          </button>
          <LocalePicker />
        </div>
        <header className="newgame-head">
          <p className="newgame-eyebrow">{t('hud.newGame.eyebrow')}</p>
          <h1>{t('hud.newGame.title')}</h1>
          <p className="newgame-lead">{t('hud.newGame.lead')}</p>
        </header>
        {notice && (
          <p className="newgame-notice" role="status" data-boot-notice>
            {notice}
          </p>
        )}

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
              aria-checked={daily}
              className={`difficulty-option${daily ? ' selected' : ''}`}
              data-mode="daily"
              onClick={() => setMode('daily')}
            >
              {t('hud.newGame.modeDaily', { day: dayLabel })}
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
              {invite && (
                <p className="league-invite" data-league-invite={invite}>
                  {t('hud.newGame.leagueInvite', { code: invite })}
                </p>
              )}
              <p>{t('hud.newGame.leagueBlurb')}</p>
              {rule && (
                <p className="league-rule" data-league-rule={rule}>
                  <strong>{t('hud.newGame.leagueRule', { name: MODIFIER_BY_ID[rule].name })}</strong> {MODIFIER_BY_ID[rule].blurb}
                </p>
              )}
              <ul>
                <li>{t(rule ? 'hud.newGame.leagueFactRule' : 'hud.newGame.leagueFactRules')}</li>
                <li>{t('hud.newGame.leagueFactGhost')}</li>
                {nextRule && (
                  <li data-league-next-rule={nextRule}>{t('hud.newGame.leagueNextRule', { name: MODIFIER_BY_ID[nextRule].name })}</li>
                )}
              </ul>
            </div>
          )}
          {daily && (
            <div className="difficulty-detail" data-detail="daily">
              <p>{t('hud.newGame.dailyBlurb', { days: LEAGUE_DAILY_DAYS })}</p>
              <ul>
                <li>{t('hud.newGame.dailyFactRules')}</li>
                <li>{t('hud.newGame.dailyFactReset')}</li>
              </ul>
            </div>
          )}
          {mode === 'scenario' && (
            <div className="scenario-pick" data-detail="scenario">
              <ul className="scenario-list" role="radiogroup" aria-label={t('hud.scenario.listLabel')}>
                {SCENARIOS.map((option) => (
                  <li key={option.id}>
                    <ScenarioCard def={option} selected={option.id === scenario.id} onSelect={setScenarioId} />
                  </li>
                ))}
              </ul>
              <Suspense fallback={null}>
                <PackList selectedId={scenario.id} onSelect={setScenarioId} onChange={refreshPacks} />
                <PackEditorHost example={scenario.source ? SCENARIOS[0]! : scenario} onTry={tryScenario} onSaved={selectAdded} {...(deliverFile ? { deliverFile } : {})} />
              </Suspense>
              <ScenarioDetail def={scenario}>
                <Suspense fallback={null}>
                  <PackActions def={scenario} onRemoved={() => setScenarioId(SCENARIOS[0]!.id)} />
                </Suspense>
              </ScenarioDetail>
              <Suspense fallback={null}>
                <PackAdd example={scenario.source ? null : scenario} onSelect={selectAdded} />
              </Suspense>
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

        {/*
          Ek kurallar (Tur 45) de görünmez değil: seçilenin etkisi yazıyor,
          zorluk çarpanı zafer ekranında ve kariyerde.
        */}
        {free && (
        <div className="newgame-field" data-modifiers>
          <span>{t('hud.newGame.modifiersQuestion')}</span>
          <div className="modifier-picker" role="group" aria-label={t('hud.newGame.modifiersGroup')}>
            {MODIFIERS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={modifiers.includes(option.id)}
                className={`difficulty-option${modifiers.includes(option.id) ? ' selected' : ''}`}
                data-modifier={option.id}
                title={option.blurb}
                onClick={() => toggleModifier(option.id)}
              >
                {option.name}
              </button>
            ))}
          </div>
          <div className="difficulty-detail" data-detail="modifiers">
            {modifiers.length === 0 ? (
              <p className="muted">{t('hud.newGame.modifiersNone')}</p>
            ) : (
              <>
                <ul>
                  {MODIFIERS.filter((option) => modifiers.includes(option.id)).map((option) => (
                    <li key={option.id} data-modifier-facts={option.id}>
                      <strong>{option.name}:</strong> {option.facts.join(' · ')}
                    </li>
                  ))}
                </ul>
                <p className="modifier-multiplier" data-modifier-multiplier>
                  {t('hud.newGame.modifiersMultiplier', { value: formatDecimal(modifierMultiplier(modifiers), 2) })}
                </p>
              </>
            )}
          </div>
        </div>
        )}

        {free && (
        <div className="newgame-field">
          <span>{t('hud.newGame.typeQuestion')}</span>
          <div className="difficulty-picker mode-picker city-type-picker" role="radiogroup" aria-label={t('hud.newGame.typeGroup')}>
            {CITY_TYPES.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={option.id === cityType}
                className={`difficulty-option${option.id === cityType ? ' selected' : ''}`}
                data-city-type={option.id}
                style={{ ['--city-type' as string]: option.color }}
                onClick={() => setCityType(option.id)}
              >
                {option.name}
              </button>
            ))}
          </div>
          <div className="difficulty-detail" data-detail="city-type">
            <p>{kind.blurb}</p>
            <ul>
              {kind.facts.map((fact) => (
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
      {overlay === 'career' && (
        <SetupOverlay className="career-overlay" title={t('hud.career.title')} closeLabel={t('hud.career.close')} onClose={() => setOverlay('none')}>
          <CareerPanel />
        </SetupOverlay>
      )}
      {overlay === 'settings' && (
        <SetupOverlay className="settings-overlay" title={t('panels.modal.title.settings')} closeLabel={t('panels.common.close')} onClose={() => setOverlay('none')}>
          <SettingsPanel />
        </SetupOverlay>
      )}
    </div>
  );
}

/** Kurulum ekranının penceresi: oyun içindeki panellerle aynı kabuk ve klavye sözleşmesi. */
function SetupOverlay({
  className,
  title,
  closeLabel,
  onClose,
  children,
}: {
  className: string;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}): ReactElement {
  const frame = useRef<HTMLDivElement>(null);
  useDialogFocus(frame);
  return (
    <div className={`modal-backdrop ${className}`} onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="setup-overlay-title" tabIndex={-1} ref={frame}>
        <header className="modal-head">
          <h2 id="setup-overlay-title">{title}</h2>
          <button type="button" className="icon" onClick={onClose} aria-label={closeLabel}>
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
