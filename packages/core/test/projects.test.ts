import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { PROJECT_BY_ID, PROJECT_TIMING } from '@capital/content';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { getPlayer } from '../src/selectors';
import { agenda } from '../src/agenda';
import { collectEventModifiers } from '../src/systems/events';
import { createLeagueGame, replayRun, runFromState } from '../src/league';
import { purchaseBlocker } from '../src/actions';
import { estimateInvestment } from '../src/systems/market';
import { runTakeoverTick, sharesOutstanding } from '../src/systems/equity';
import {
  contributeToProject,
  projectAttraction,
  projectStandings,
  projectUpkeep,
  runProjectTick,
} from '../src/systems/projects';
import type { GameState } from '../src/types';
import { playerStrategy } from './proxy';

function play(seed: number, days: number): GameEngine {
  const engine = new GameEngine(createNewGame({ seed }));
  for (let day = 1; day <= days; day++) {
    if (day % 5 === 0) playerStrategy(engine);
    engine.runDay();
  }
  return engine;
}

/** Bugün bir proje aç (takvimi beklemeden). */
function openNow(state: GameState): void {
  delete state.project;
  state.nextProjectDay = state.time.day;
  runProjectTick(state);
  assert.ok(state.project, 'proje açılmadı');
}

/** Projeyi `day` gününe kadar günlük adımla ilerlet (yalnız proje adımı). */
function advanceTo(state: GameState, day: number): void {
  while (state.time.day < day) {
    state.time.day += 1;
    runProjectTick(state);
  }
}

describe('şehir projeleri', () => {
  test('takvimle açılıyor; saha kamunun, satılmıyor; haber ve gündem', () => {
    const engine = play(1, 300);
    const state = engine.getState();
    const opened = state.project ?? state.cityProjects?.[0];
    assert.ok(opened, '300 günde proje açılmadı');
    assert.ok(state.news.some((item) => item.title.includes(PROJECT_BY_ID[opened.defId].name)));
    const fresh = play(1, 120).getState();
    openNow(fresh);
    const project = fresh.project!;
    assert.equal(project.phase, 'funding');
    assert.equal(project.closesDay - project.openedDay, PROJECT_TIMING.windowDays);
    assert.equal(fresh.map.tiles[project.tileId]!.kind, 'civic');
    assert.ok(purchaseBlocker(fresh, project.tileId), 'saha satın alınabiliyor');
    assert.ok(agenda(fresh).some((item) => item.kind === 'project' && item.urgency === 1));
  });

  test('katkı: kasadan düşüyor, tabloya giriyor; küçük, kasasız ve kapalı katkı reddediliyor', () => {
    const state = play(1, 120).getState();
    openNow(state);
    const player = getPlayer(state);
    player.cash = 1_000_000;
    assert.equal(contributeToProject(state, PROJECT_TIMING.minContribution - 1).ok, false);
    assert.equal(contributeToProject(state, 5_000_000).ok, false);
    assert.ok(contributeToProject(state, 200_000).ok);
    assert.equal(player.cash, 800_000);
    assert.equal(state.project!.contributions[player.id], 200_000);
    assert.equal(projectStandings(state, state.project!)[0]!.companyId, player.id);
    assert.ok(state.news[0]!.title.includes(PROJECT_BY_ID[state.project!.defId].name));
    state.project!.phase = 'building';
    assert.equal(contributeToProject(state, 50_000).ok, false);
  });

  test('rakipler haftada bir, bütçeleriyle sınırlı katkı veriyor; rakipler donukken vermiyor', () => {
    const state = play(7, 400).getState();
    openNow(state);
    const project = state.project!;
    advanceTo(state, project.closesDay - 1);
    const rivals = Object.values(state.companies).filter((c) => !c.isPlayer);
    const given = rivals.reduce((sum, c) => sum + (project.contributions[c.id] ?? 0), 0);
    assert.ok(given > 0, 'rakip katkısı yok');
    for (const rival of rivals) {
      const amount = project.contributions[rival.id] ?? 0;
      assert.ok(amount <= Math.max(0, rival.netWorth) * 0.05 * 1.5 + 1000, `${rival.name} bütçeyi aştı: ${amount}`);
    }

    const frozen = play(7, 400).getState();
    frozen.flags.npcCompetition = false;
    openNow(frozen);
    advanceTo(frozen, frozen.project!.closesDay - 1);
    assert.deepEqual(frozen.project!.contributions, {});
  });

  test('pencere kapanınca en büyük katkı sponsor; şantiye; bitince simge yapı ve kalıcı etki', () => {
    const state = play(1, 200).getState();
    openNow(state);
    const project = state.project!;
    const def = PROJECT_BY_ID[project.defId];
    const player = getPlayer(state);
    state.flags.npcCompetition = false;
    player.cash = 50_000_000;
    assert.ok(contributeToProject(state, 2_000_000).ok);
    const landBefore = state.map.tiles.filter((t) => t.districtId === project.districtId).reduce((sum, t) => sum + t.landValue, 0);
    const brandBefore = player.brand[def.leadCategory] ?? 0;

    advanceTo(state, project.closesDay);
    assert.equal(state.project!.phase, 'building');
    assert.equal(state.project!.sponsorId, player.id);
    assert.equal(state.map.tiles[project.tileId]!.structureId, 'construction_site');
    assert.equal(state.project!.doneDay, project.closesDay + PROJECT_TIMING.buildDays, 'inşaat kapanıştan sayılıyor');

    advanceTo(state, project.doneDay);
    assert.equal(state.project, undefined);
    assert.equal(state.map.tiles[project.tileId]!.structureId, def.structureId);
    assert.equal(state.cityProjects!.length, 1);
    assert.equal(state.cityProjects![0]!.sponsorId, player.id);
    const landAfter = state.map.tiles.filter((t) => t.districtId === project.districtId).reduce((sum, t) => sum + t.landValue, 0);
    assert.ok(landAfter > landBefore * (def.landValue - 0.01));
    assert.ok((player.brand[def.leadCategory] ?? 0) > brandBefore);
    assert.equal(projectAttraction(state, player.id, project.districtId), PROJECT_TIMING.sponsorAttraction);
    const elsewhere = state.districts.find((d) => d.id !== project.districtId)!.id;
    assert.equal(projectAttraction(state, player.id, elsewhere), 1, 'ayrıcalık yalnız proje bölgesinde');
    assert.equal(projectUpkeep(state, player.id, project.districtId), PROJECT_TIMING.sponsorUpkeep);
    assert.equal(projectUpkeep(state, player.id, elsewhere), 1);
    const rivalId = Object.values(state.companies).find((c) => !c.isPlayer)!.id;
    assert.equal(projectUpkeep(state, rivalId, project.districtId), 1, 'ayrıcalık yalnız sponsorun');

    const mods = collectEventModifiers(state);
    const here = mods.districtDemand.find((entry) => entry.districtId === project.districtId);
    assert.deepEqual(here?.multipliers, def.demand);
    assert.ok(mods.districtDemand.length > 1, 'komşu bölgeye etki yok');
    assert.ok(state.nextProjectDay! > state.time.day + PROJECT_TIMING.gapDays[0] - 1);

    // Bayrak kapanınca etki de kalkıyor (Codex #60 dersi).
    state.flags.cityProjects = false;
    assert.deepEqual(collectEventModifiers(state).districtDemand, []);
    assert.equal(projectAttraction(state, player.id, project.districtId), 1);
    assert.equal(projectUpkeep(state, player.id, project.districtId), 1);
  });

  test('sponsor ayrıcalığı yapı menüsünün hızlı tahmininde de görünüyor', () => {
    const state = play(1, 200).getState();
    const player = getPlayer(state);
    // Kapasitesi dolmayan bir bölge: dolu mağazada çekicilik satışa dönmez.
    const district = state.districts.find(
      (d) => d.opensOnDay === undefined && estimateInvestment(state, d.id, 'supermarket', player.id)!.utilisation < 0.95,
    );
    assert.ok(district, 'kapasitesi dolmayan bölge yok');
    const before = estimateInvestment(state, district.id, 'supermarket', player.id)!;
    state.cityProjects = [{ defId: 'metro', districtId: district.id, tileId: 0, doneDay: state.time.day, sponsorId: player.id, sponsorName: player.name }];
    const after = estimateInvestment(state, district.id, 'supermarket', player.id)!;
    assert.ok(after.expectedUnits > before.expectedUnits, `${after.expectedUnits} > ${before.expectedUnits}`);
    // Bakım indirimi de tahminde: sabit gider düşüyor (defterle aynı çarpan).
    assert.ok(after.fixedCosts < before.fixedCosts, `${after.fixedCosts} < ${before.fixedCosts}`);
  });

  test('sponsorun bölgedeki binalarının defterinde bakım indirimi', () => {
    const engine = play(1, 200);
    const state = engine.getState();
    const player = getPlayer(state);
    const mine = Object.values(state.buildings).find((b) => b.companyId === player.id);
    assert.ok(mine, 'oyuncunun binası yok');
    const snapshot = JSON.stringify(state);
    engine.runDay();
    const plain = state.buildings[mine.id]!.last.upkeep;
    const sponsored = new GameEngine(JSON.parse(snapshot));
    sponsored.getState().cityProjects = [
      { defId: 'metro', districtId: mine.districtId, tileId: 0, doneDay: state.time.day, sponsorId: player.id, sponsorName: player.name },
    ];
    sponsored.runDay();
    const cut = sponsored.getState().buildings[mine.id]!.last.upkeep;
    assert.ok(Math.abs(cut - plain * PROJECT_TIMING.sponsorUpkeep) < 1e-6, `${cut} ≈ ${plain} × ${PROJECT_TIMING.sponsorUpkeep}`);
  });

  test('öndeki katkıcı devralınınca katkısı devralana geçiyor; sponsor o (Codex #64)', () => {
    const state = play(1, 200).getState();
    openNow(state);
    state.flags.npcCompetition = false;
    const project = state.project!;
    const [leader, acquirer] = Object.values(state.companies).filter((c) => !c.isPlayer);
    project.contributions = { [leader!.id]: 500_000, [acquirer!.id]: 100_000 };
    // Devralan, öndekinin hisselerinin çoğunu topladı.
    leader!.lockedUntilDay = undefined;
    acquirer!.shares[leader!.id] = Math.ceil(sharesOutstanding(state, leader!.id) * 0.6);
    runTakeoverTick(state, () => {});
    assert.equal(state.companies[leader!.id], undefined, 'devralma olmadı');
    assert.equal(project.contributions[acquirer!.id], 600_000);
    assert.deepEqual(projectStandings(state, project).map((row) => row.companyId), [acquirer!.id]);
    advanceTo(state, project.closesDay);
    assert.equal(state.project!.sponsorId, acquirer!.id, 'sponsor bulunamadı, belediye karşıladı sayıldı');

    // Güvenlik ağı: oyundan çıkmış şirketin satırı tabloda görünmüyor.
    const other = Object.values(state.companies).find((c) => !c.isPlayer && c.id !== acquirer!.id)!;
    const ghost = { [other.id]: 900_000, missing: 1_000_000 };
    assert.deepEqual(projectStandings(state, { ...project, contributions: ghost }).map((row) => row.companyId), [other.id]);
  });

  test('laboratuvarda (olaylar kapalı) ve bayrak kapalıyken proje yok', () => {
    const engine = new GameEngine(createNewGame({ seed: 1 }));
    engine.getState().flags.cityProjects = false;
    for (let day = 0; day < 400; day++) engine.runDay();
    assert.equal(engine.getState().project, undefined);
    assert.equal(engine.getState().cityProjects, undefined);
    const lab = createNewGame({ seed: 1 });
    lab.flags.randomEvents = false;
    lab.nextProjectDay = 0;
    runProjectTick(lab);
    assert.equal(lab.project, undefined);
  });

  test('lig: katkılar günlüğe giriyor ve tekrar aynı skoru veriyor', async () => {
    const engine = new GameEngine(createLeagueGame('2026-W43', 'Proje AŞ', null));
    let given = 0;
    while (engine.getState().league!.finishedDay === undefined) {
      const state = engine.getState();
      if (state.time.day % 5 === 0) playerStrategy(engine);
      if (state.project?.phase === 'funding' && (state.time.day - state.project.openedDay) % 20 === 1) {
        const amount = Math.floor(getPlayer(state).cash * 0.05);
        if (amount >= PROJECT_TIMING.minContribution && engine.dispatch({ type: 'CONTRIBUTE_PROJECT', amount }).ok) given++;
      }
      engine.runDay();
    }
    assert.ok(given > 0, 'ligde katkı verilmedi');
    const run = runFromState(engine.getState())!;
    assert.ok(run.log.some(([, command]) => command.type === 'CONTRIBUTE_PROJECT'));
    const result = await replayRun(run);
    assert.ok(result.ok, result.reason);
    assert.equal(result.score, run.score);
  });
});
