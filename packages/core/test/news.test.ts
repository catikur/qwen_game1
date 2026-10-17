import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_BY_ID } from '@capital/content';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { playerStrategy } from './proxy';

describe('haber akışı', () => {
  /*
   * Tur 38. "X genişliyor" akışın %41'iydi (büyük şehirde %58'i); kart,
   * kriz ve baskın uyarıları kalabalıkta kayboluyordu. Haftanın genişlemeleri
   * tek özet haberde; oyuncunun aynı kategoride mağazası olan bölgedeki
   * açılış ayrıca haber.
   */
  test('rakip genişlemesi haftalık özette; haftada tek özet, sayım başlıkla aynı', () => {
    const engine = new GameEngine(createNewGame({ seed: 3, companyName: 'Haber AŞ', citySize: 'large' }));
    const s = engine.getState();
    const seen = new Map<string, number>();
    let digests = 0;
    let last = -1;
    for (let day = 1; day <= 240; day++) {
      if (day % 5 === 0) playerStrategy(engine);
      engine.runDay();
      for (const item of s.news) {
        if (item.id <= last) break;
        if (!item.group) continue;
        assert.match(item.group, /^expand:\d+$/);
        const total = Object.values(item.tally ?? {}).reduce((sum, n) => sum + n, 0);
        if (total > 1) {
          digests++;
          assert.match(item.title, new RegExp(`bu hafta ${total} yeni işletme`), item.title);
        }
        seen.set(item.group, total);
      }
      last = s.news[0]?.id ?? last;
      // Akışta her hafta için en çok bir özet.
      const groups = s.news.map((item) => item.group).filter((group): group is string => group !== undefined);
      assert.equal(new Set(groups).size, groups.length, `gün ${day}: aynı haftanın iki özeti`);
    }
    assert.ok(digests >= 5, `${digests} özet haber`);
    assert.ok([...seen.values()].some((total) => total >= 3), 'haftada üç ve daha çok açılış birleşmeli');
  });

  test('oyuncunun kategorisindeki bölgeye açılış tek başına haber', () => {
    const engine = new GameEngine(createNewGame({ seed: 3, companyName: 'Haber AŞ' }));
    const s = engine.getState();
    let direct = 0;
    let last = -1;
    for (let day = 1; day <= 240; day++) {
      if (day % 5 === 0) playerStrategy(engine);
      engine.runDay();
      for (const item of s.news) {
        if (item.id <= last) break;
        if (item.group || !/genişliyor$/.test(item.title) || item.tileId === undefined) continue;
        const building = Object.values(s.buildings).find((b) => b.tileId === item.tileId);
        const def = building ? BUILDING_BY_ID[building.defId] : undefined;
        if (!building || def?.role !== 'outlet') continue;
        const rivalled = Object.values(s.buildings).some(
          (own) =>
            own.companyId === s.playerCompanyId &&
            own.districtId === building.districtId &&
            BUILDING_BY_ID[own.defId]?.role === 'outlet' &&
            BUILDING_BY_ID[own.defId]?.category === def.category,
        );
        assert.ok(rivalled, `${item.title}: ${item.body}`);
        direct++;
      }
      last = s.news[0]?.id ?? last;
    }
    assert.ok(direct >= 1, `${direct} doğrudan rekabet haberi`);
  });
});
