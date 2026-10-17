import type { ReactElement } from 'react';
import { CATEGORIES, PROJECT_BY_ID, PROJECT_TIMING, formatPercent } from '@capital/content';
import type { CategoryId } from '@capital/content';
import {
  formatDate,
  formatMoney,
  getPlayer,
  projectName,
  projectStandings,
  projectTable,
  projectsEnabled,
  rivalProfile,
} from '@capital/core';
import type { GameState, ProjectState } from '@capital/core';
import { CeoPortrait } from './CeoPortrait';
import { useGame, useGameState } from './useGame';
import { t } from './i18n';

/**
 * Şehir projesi paneli (Tur 37d).
 *
 * Katkı açık bir tablo: kim ne kadar verdi, öne geçmek için ne gerekiyor.
 * Kapalı zarf yerine açık tablo, parsel ihalesindeki gerekçeyle aynı:
 * oyuncu rakibin projeye ne kadar değer biçtiğini görüyor ve kararını
 * buna göre veriyor. Katkı geri dönmüyor — herkes öder, biri kazanır.
 */

/** "+%16" / "−%30": işaretle sayı arasında satır kırılmasın (kelime birleştirici). */
function signed(multiplier: number): string {
  const percent = Math.round((multiplier - 1) * 100);
  return `${percent < 0 ? '−' : '+'}\u2060${formatPercent(Math.abs(percent))}`;
}

/** Katkı düğmeleri: öne geçmek için gereken ve kasanın küçük dilimleri. */
function contributionSteps(state: GameState, project: ProjectState): Array<{ amount: number; label: string }> {
  const player = getPlayer(state);
  const standings = projectStandings(state, project);
  const mine = project.contributions[player.id] ?? 0;
  const leader = standings[0];
  const steps: Array<{ amount: number; label: string }> = [];
  const round = (value: number): number => Math.ceil(value / 1000) * 1000;
  if (leader && leader.companyId !== player.id) {
    const toLead = round(leader.amount - mine + 1000);
    steps.push({ amount: Math.max(PROJECT_TIMING.minContribution, toLead), label: t('panels.project.toLead') });
  }
  for (const share of [0.02, 0.05, 0.1]) {
    const amount = round(player.cash * share);
    if (amount >= PROJECT_TIMING.minContribution && !steps.some((step) => step.amount === amount)) {
      steps.push({ amount, label: t('panels.project.cashShare', { share: formatPercent(Math.round(share * 100)) }) });
    }
  }
  return steps;
}

function Standings({ project }: { project: ProjectState }): ReactElement {
  const state = useGameState();
  const rows = projectTable(state, project);
  const top = rows[0]?.amount ?? 0;
  const player = getPlayer(state);
  if (rows.length === 0) return <p className="muted">{t('panels.project.noContributions')}</p>;
  return (
    <ol className="project-standings">
      {rows.map((row) => {
        const company = state.companies[row.companyId];
        const profile = rivalProfile(state, company?.profileId);
        const isPlayer = row.companyId === player.id;
        return (
          <li key={row.companyId} className={`project-row${isPlayer ? ' is-player' : ''}`} data-project-row={isPlayer ? 'player' : 'rival'}>
            <span className="project-rank">{row.rank}</span>
            {profile ? <CeoPortrait portrait={profile.portrait} size={24} /> : <span className="project-dot" style={{ background: company?.color }} />}
            <span className="project-name">{isPlayer ? t('panels.project.you') : (company?.name ?? row.companyId)}</span>
            <span className="project-bar" aria-hidden="true">
              <span style={{ width: `${top > 0 ? Math.round((row.amount / top) * 100) : 0}%`, background: company?.color }} />
            </span>
            <strong className="project-amount">{formatMoney(row.amount)}</strong>
          </li>
        );
      })}
    </ol>
  );
}

export function ProjectPanel(): ReactElement {
  const state = useGameState();
  const { run, toast } = useGame();
  const project = state.project;
  const day = state.time.day;
  const history = state.cityProjects ?? [];

  if (!projectsEnabled(state)) return <p className="muted">{t('panels.project.disabled')}</p>;

  return (
    <div className="project-panel">
      {project ? (
        <ActiveProject project={project} onContribute={(amount) => {
          if (run({ type: 'CONTRIBUTE_PROJECT', amount })) toast(t('panels.project.contributed', { amount: formatMoney(amount) }), 'good');
        }} />
      ) : (
        <p className="muted">
          {state.nextProjectDay !== undefined
            ? t('panels.project.next', { date: formatDate(state.nextProjectDay) })
            : t('panels.project.none')}
        </p>
      )}
      {history.length > 0 && (
        <section className="project-history">
          <h3>{t('panels.project.historyTitle')}</h3>
          <ul>
            {history.map((done) => (
              <li key={`${done.defId}:${done.doneDay}`}>
                <strong>{projectName(state, done.defId, done.sponsorName)}</strong>
                <span className="muted"> · {state.districts[done.districtId]?.name ?? ''} · {formatDate(done.doneDay)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="muted project-day">{t('panels.project.today', { date: formatDate(day) })}</p>
    </div>
  );
}

function ActiveProject({ project, onContribute }: { project: ProjectState; onContribute: (amount: number) => void }): ReactElement {
  const state = useGameState();
  const { focusOn } = useGame();
  const def = PROJECT_BY_ID[project.defId];
  const district = state.districts[project.districtId];
  const day = state.time.day;
  const funding = project.phase === 'funding';
  const player = getPlayer(state);
  const mine = project.contributions[player.id] ?? 0;
  const rank = projectStandings(state, project).findIndex((row) => row.companyId === player.id) + 1;
  const present = Object.values(state.buildings).some((b) => b.companyId === player.id && b.districtId === project.districtId);

  return (
    <section className="project-card" data-project={project.defId} data-phase={project.phase}>
      <header className="project-head">
        <div>
          <h3>{def.name}</h3>
          <button type="button" className="ghost project-where" onClick={() => focusOn({ tileId: project.tileId })}>
            {district?.name ?? ''}
          </button>
        </div>
        <span className="project-days">
          {funding
            ? t('panels.project.fundingDays', { days: Math.max(0, project.closesDay - day) })
            : t('panels.project.buildingDays', { days: Math.max(0, project.doneDay - day) })}
        </span>
      </header>
      <p className="project-pitch">{def.pitch}</p>
      <div className="project-effects">
        <span className="project-label">{t('panels.project.effects')}</span>
        {(Object.entries(def.demand) as [CategoryId, number][]).map(([category, multiplier]) => (
          <span key={category} className="pulse-chip">
            {CATEGORIES[category].name} {signed(multiplier)}
          </span>
        ))}
        <span className="pulse-chip">{t('panels.project.land', { change: signed(def.landValue) })}</span>
        <span className="muted project-neighbours">{t('panels.project.neighbours', { share: formatPercent(Math.round(def.neighborShare * 100)) })}</span>
      </div>
      <p className="project-privilege">
        {t('panels.project.privilege', {
          upkeep: signed(PROJECT_TIMING.sponsorUpkeep),
          attraction: signed(PROJECT_TIMING.sponsorAttraction),
          category: CATEGORIES[def.leadCategory].name,
        })}
        {!present && <span className="muted"> {t('panels.project.notPresent')}</span>}
      </p>
      {funding ? (
        <>
          <Standings project={project} />
          <p className="project-mine">
            {mine > 0 ? t('panels.project.mine', { amount: formatMoney(mine), rank }) : t('panels.project.mineNone')}
          </p>
          <div className="project-actions">
            {contributionSteps(state, project).map((step) => (
              <button
                key={step.amount}
                type="button"
                className="primary"
                data-project-give={step.amount}
                disabled={player.cash < step.amount}
                onClick={() => onContribute(step.amount)}
              >
                {step.label} · {formatMoney(step.amount)}
              </button>
            ))}
          </div>
          <p className="muted project-note">{t('panels.project.sunk')}</p>
        </>
      ) : (
        <p className="project-sponsor">
          {project.sponsorName
            ? t('panels.project.sponsored', { sponsor: project.sponsorId === player.id ? t('panels.project.you') : project.sponsorName })
            : t('panels.project.citySponsored')}
        </p>
      )}
    </section>
  );
}

/** Bina penceresinde proje karesi notu: "Şehir projesi: Metro Hattı · Karaca Holding". */
export function ProjectSiteNote({ tileId }: { tileId: number }): ReactElement | null {
  const state = useGameState();
  const { setView } = useGame();
  if (!projectsEnabled(state)) return null;
  const active = state.project?.tileId === tileId ? state.project : undefined;
  const done = state.cityProjects?.find((entry) => entry.tileId === tileId);
  if (!active && !done) return null;
  const name = active ? projectName(state, active.defId, active.sponsorName) : projectName(state, done!.defId, done!.sponsorName);
  return (
    <p className="project-site-note" data-project-site>
      <span>{active ? t('panels.project.siteActive', { name }) : t('panels.project.siteDone', { name })}</span>{' '}
      <button type="button" className="ghost" onClick={() => setView({ openPanel: 'project' })}>
        {t('panels.project.open')}
      </button>
    </p>
  );
}
