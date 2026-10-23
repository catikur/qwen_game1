import { useEffect, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';
import { ACHIEVEMENT_GROUPS, CEO_BY_ID, PATH_BY_ID, SCENARIO_BY_ID, formatDecimal, getCitySize, getDifficulty, modifierMultiplier, moneyUnits, numberLocale, withCurrency } from '@capital/content';
import type { AchievementGroup } from '@capital/content';
import { formatMoney, runPaths } from '@capital/core';
import type { AchievementStatus, GameState } from '@capital/core';
import { careerRevision, careerSummary, subscribeCareer, syncCareer, unlockedInRun } from './career';
import type { CareerRun, UnlockRecord } from './career';
import { careerRunResult } from './careerFormat';
import { t } from './i18n';
import type { MessageKey } from './i18n';

/**
 * Kariyer sayfası (Tur 41): rozetler ve koşu geçmişi.
 *
 * Oyun içinde Hedefler panelinden, oyun dışında kurulum ekranından
 * açılıyor; ikisi de aynı bileşen. Depo değişince (rozet açıldı, koşu
 * kaydedildi) kendiliğinden yeniden çiziliyor.
 */
export function useCareerRevision(): number {
  return useSyncExternalStore(subscribeCareer, careerRevision, careerRevision);
}

const RUNS_SHOWN = 12;

function dateOf(iso: string): string {
  return new Date(iso).toLocaleDateString(numberLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
}


function Medal(): ReactElement {
  return (
    <svg className="career-medal" viewBox="0 0 24 24" aria-hidden="true">
      <path className="career-medal-ribbon" d="M7.5 2h4l1.3 6.2-3.4 1.6zM16.5 2h-4l-1.3 6.2 3.4 1.6z" />
      <circle className="career-medal-disc" cx="12" cy="15" r="6.6" />
      <path
        className="career-medal-star"
        d="M12 11.2l1.15 2.35 2.6.38-1.88 1.83.44 2.58L12 17.12l-2.31 1.22.44-2.58-1.88-1.83 2.6-.38z"
      />
    </svg>
  );
}

/** Eşik değerleri yuvarlak: "12 M ₺ / 250 M ₺". */
function roundMoney(value: number): string {
  return value >= 1_000_000 ? withCurrency(`${Math.floor(value / 1_000_000)}${moneyUnits().million}`) : formatMoney(value);
}

function progressText(status: AchievementStatus): string | null {
  // Şehir sayısı hep birden başlıyor: "1 / 2" ilerleme değil.
  if (status.target <= 1 || status.def.kind === 'cities') return null;
  const money = status.def.kind === 'worth' || status.def.kind === 'companyWorth';
  const value = Math.min(status.value, status.target);
  return t('hud.career.progress', {
    value: money ? roundMoney(value) : String(Math.floor(value)),
    target: money ? roundMoney(status.target) : String(status.target),
  });
}

function unlockedText(record: UnlockRecord): string {
  const date = dateOf(record.at);
  return record.companyName && record.day !== undefined
    ? t('hud.career.unlockedAt', { date, company: record.companyName, day: record.day })
    : t('hud.career.unlockedOn', { date });
}

function Badge({ status, record }: { status: AchievementStatus; record: UnlockRecord | undefined }): ReactElement {
  const done = Boolean(record);
  const progress = done ? null : progressText(status);
  const share = status.target > 0 ? Math.min(1, status.value / status.target) : 0;
  return (
    <li className={`career-badge ${done ? 'done' : 'locked'}`} data-achievement={status.def.id} data-done={done ? 'true' : 'false'}>
      <Medal />
      <div className="career-badge-body">
        <div className="career-badge-head">
          <span className="career-badge-title">{status.def.title}</span>
          <span className="career-badge-state">{done ? t('hud.career.done') : t('hud.career.locked')}</span>
        </div>
        <p className="career-badge-hint">{status.def.hint}</p>
        {done && record ? <p className="career-badge-when">{unlockedText(record)}</p> : null}
        {progress ? (
          <>
            <div className="goal-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
              <span style={{ width: `${Math.round(share * 100)}%` }} />
            </div>
            <p className="career-badge-progress">{progress}</p>
          </>
        ) : null}
      </div>
    </li>
  );
}

function runTitle(run: CareerRun): string {
  if (run.mode === 'scenario') return t('hud.career.mode.scenario', { title: SCENARIO_BY_ID[run.scenarioId ?? '']?.title ?? run.scenarioId ?? '' });
  if (run.mode === 'league') return t(run.leagueKind === 'day' ? 'hud.career.mode.daily' : 'hud.career.mode.league');
  return t('hud.career.mode.free');
}

function RunRow({ run }: { run: CareerRun }): ReactElement {
  const ceo = run.ceoId ? CEO_BY_ID[run.ceoId] : undefined;
  const winPaths = runPaths(run).filter((id) => PATH_BY_ID[id]);
  const facts = [
    ceo ? ceo.name : t('hud.career.noCeo'),
    getDifficulty(run.difficulty).name,
    getCitySize(run.citySize).name,
    // Ek kurallar (Tur 45): sayısı ve zorluk çarpanı; senaryonun kuralı çarpansız (Tur 60).
    ...(run.modifiers?.length
      ? [
          run.mode === 'scenario'
            ? t('hud.career.scenarioRules', { count: run.modifiers.length })
            : t('hud.career.rules', { count: run.modifiers.length, value: formatDecimal(modifierMultiplier(run.modifiers), 2) }),
        ]
      : []),
    ...(run.cities > 1 ? [t('hud.career.cities', { count: run.cities })] : []),
    // Zafere giden yol (Tur 61); holding'de her şehrin zaferi kendi yoluyla.
    ...(winPaths.length > 0 ? [t('hud.career.paths', { list: winPaths.map((id) => PATH_BY_ID[id].name).join(', ') })] : []),
  ];
  return (
    <li className="career-run" data-run-mode={run.mode} {...(winPaths.length > 0 ? { 'data-run-paths': winPaths.join(',') } : {})}>
      <div className="career-run-head">
        <span className="career-run-title">
          {runTitle(run)} · {run.companyName}
        </span>
        <span className="career-run-worth">{run.mode === 'scenario' ? '' : formatMoney(run.worth)}</span>
      </div>
      <div className="career-run-meta">
        <span>{facts.join(' · ')}</span>
        <span className="career-run-result">{careerRunResult(run)}</span>
        <span className="muted">{dateOf(run.lastSeenIso)}</span>
      </div>
    </li>
  );
}

export function CareerPanel(): ReactElement {
  useCareerRevision();
  // Oyun dışında da açılıyor: senaryo yıldızları ve toplamlar burada yetişsin.
  useEffect(() => {
    syncCareer();
  }, []);
  const summary = careerSummary();
  const done = summary.statuses.filter((status) => summary.unlocked[status.def.id]).length;
  const byGroup = (group: AchievementGroup) => summary.statuses.filter((status) => status.def.group === group);
  const runs = summary.runs.slice(0, RUNS_SHOWN);
  return (
    <div className="career" data-career>
      <div className="statgrid small career-stats">
        <div className="stat">
          <span className="stat-label">{t('hud.career.stat.badges')}</span>
          <span className="stat-value" data-career-badges>
            {done}/{summary.statuses.length}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">{t('hud.career.stat.stars')}</span>
          <span className="stat-value">{summary.scenarioStars}/{Object.keys(SCENARIO_BY_ID).length * 3}</span>
        </div>
        <div className="stat">
          <span className="stat-label">{t('hud.career.stat.victories')}</span>
          <span className="stat-value">{summary.victories}</span>
        </div>
        <div className="stat">
          <span className="stat-label">{t('hud.career.stat.best')}</span>
          <span className="stat-value">{formatMoney(summary.bestWorth)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">{t('hud.career.stat.runs')}</span>
          <span className="stat-value">{summary.runCount}</span>
        </div>
      </div>
      {ACHIEVEMENT_GROUPS.map((group) => (
        <section key={group} className="career-group" data-career-group={group}>
          <h3>{t(`hud.career.group.${group}` as MessageKey)}</h3>
          <ul className="career-badges">
            {byGroup(group).map((status) => (
              <Badge key={status.def.id} status={status} record={summary.unlocked[status.def.id]} />
            ))}
          </ul>
        </section>
      ))}
      <section className="career-group career-history" data-career-runs>
        <h3>{t('hud.career.runs')}</h3>
        {runs.length === 0 ? (
          <p className="muted">{t('hud.career.runsEmpty')}</p>
        ) : (
          <>
            <ol className="career-runs">
              {runs.map((run) => (
                <RunRow key={run.key} run={run} />
              ))}
            </ol>
            <p className="muted">{t('hud.career.runsNote', { count: runs.length })}</p>
          </>
        )}
      </section>
      <p className="muted career-note">{t('hud.career.note')}</p>
    </div>
  );
}

/** Sonuç ekranlarında: bu koşuda kazanılan rozetler (yoksa hiçbir şey). */
export function CareerRunLine({ state }: { state: GameState }): ReactElement | null {
  useCareerRevision();
  const opened = unlockedInRun(state);
  if (opened.length === 0) return null;
  return (
    <p className="career-run-line" data-career-run-line>
      <Medal />
      <span>{t('hud.career.thisRun', { list: opened.map((def) => def.title).join(', ') })}</span>
    </p>
  );
}
