import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CelebrationLog, FIREWORK_COLORS, Fireworks, MOMENT, RingPulses, aimHeight, fireworkSchedule, smooth, waveDelay } from '../src/moments';
import { StreetLife } from '../src/street';

/**
 * Önemli anlar (Tur 63). Hesap WebGL'siz: sahne yalnızca bu nesneleri
 * çiziyor ve ne zaman tetikleneceklerine karar veriyor.
 */
describe('anların zamanlaması', () => {
  test('dalga merkezden uzaklaştıkça geç varıyor, bir sınırı aşmıyor', () => {
    assert.equal(waveDelay(0), 0);
    assert.ok(waveDelay(4) < waveDelay(12));
    assert.equal(waveDelay(1000), MOMENT.waveMax);
    assert.equal(waveDelay(-3), 0);
    assert.equal(smooth(0), 0);
    assert.equal(smooth(1), 1);
    assert.equal(smooth(2), 1);
    assert.ok(Math.abs(smooth(0.5) - 0.5) < 1e-9);
  });

  test('havai fişek takvimi tohumlu, süreye sığıyor, sıralı', () => {
    const a = fireworkSchedule(42);
    assert.deepEqual(a, fireworkSchedule(42));
    assert.notDeepEqual(a, fireworkSchedule(43));
    assert.equal(a.length, MOMENT.fireworkBursts);
    for (let i = 1; i < a.length; i++) assert.ok(a[i]!.at >= a[i - 1]!.at - 0.12, 'sıra');
    for (const burst of a) {
      assert.ok(burst.at >= 0 && burst.at < MOMENT.fireworkSeconds * 0.85, `at ${burst.at}`);
      assert.ok(Math.abs(burst.dx) <= 1 && Math.abs(burst.dz) <= 1);
      assert.ok(burst.height >= 5 && burst.height <= 8.5);
      assert.ok(burst.color >= 0 && burst.color < FIREWORK_COLORS.length);
    }
  });
});

describe('halka', () => {
  test('gecikmesini bekliyor, açılıp sönüyor, havuz taşmıyor', () => {
    const rings = new RingPulses();
    rings.pulse(3, 4, '#ff0000', 0.5);
    rings.update(0.1);
    assert.deepEqual(rings.stats(), { rings: 1, visible: 0 }, 'gecikmede görünmüyor');
    rings.update(0.1);
    rings.update(0.1);
    rings.update(0.1);
    rings.update(0.1);
    rings.update(0.05);
    assert.deepEqual(rings.stats(), { rings: 1, visible: 1 });
    const mesh = rings.group.children.find((child) => child.visible) as THREE.Mesh;
    assert.equal(mesh.position.x, 3);
    assert.equal(mesh.position.z, 4);
    assert.equal(((mesh.material as THREE.MeshBasicMaterial).color.getHexString()), 'ff0000');
    for (let i = 0; i < 20; i++) rings.update(0.1);
    assert.deepEqual(rings.stats(), { rings: 0, visible: 0 }, 'söndü');
    for (let i = 0; i < 60; i++) rings.pulse(i, 0, '#ffffff');
    assert.equal(rings.stats().rings, 24, 'havuz sabit');
    rings.clear();
    assert.deepEqual(rings.stats(), { rings: 0, visible: 0 });
    rings.dispose();
  });
});

describe('havai fişek', () => {
  test('takvimi atıyor, kıvılcımlar yükselip yere inmeden sönüyor, sonra duruyor', () => {
    const fireworks = new Fireworks();
    assert.equal(fireworks.stats().active, false);
    fireworks.start(7, '#22aa66');
    const center = { x: 20, z: 10 };
    let peak = 0;
    let sawSparks = false;
    for (let t = 0; t < MOMENT.fireworkSeconds + 3; t += 0.05) {
      fireworks.update(0.05, center, 12);
      const stats = fireworks.stats();
      if (stats.shells > 0) {
        sawSparks = true;
        peak = Math.max(peak, stats.height / stats.sparks);
      }
      assert.ok(stats.shells <= 6, 'havuz');
    }
    assert.ok(sawSparks, 'patladı');
    assert.ok(peak > 3, `kıvılcımlar havada (ortalama en yüksek ${peak.toFixed(2)})`);
    const end = fireworks.stats();
    assert.equal(end.fired, end.scheduled);
    assert.equal(end.active, false, 'bitti');
    assert.equal(end.shells, 0);
    fireworks.dispose();
  });

  test('ilk renk oyuncunun; durdurulunca hiçbir şey çizilmiyor', () => {
    const fireworks = new Fireworks();
    fireworks.start(1, '#123456');
    for (let i = 0; i < 40 && fireworks.stats().shells === 0; i++) fireworks.update(0.05, { x: 0, z: 0 }, 10);
    const colors = fireworks.group.children
      .filter((child) => child.visible)
      .map((child) => ((child as THREE.Points).material as THREE.PointsMaterial).color.getHexString());
    assert.ok(colors.includes('123456'), colors.join(','));
    fireworks.stop();
    fireworks.update(0.05, { x: 0, z: 0 }, 10);
    assert.deepEqual([fireworks.stats().shells, fireworks.stats().active], [0, false]);
    fireworks.dispose();
  });
});

describe('toz', () => {
  test('bir buluta dokuz puf; dağılınca kayboluyor; en çok on dört bulut', () => {
    const street = new StreetLife(24, 24, 6, 0);
    street.update(0.016);
    const idle = street.stats.puffs;
    street.burst(5, 5, 1);
    street.update(0.016);
    assert.equal(street.stats.dust, 1);
    assert.equal(street.stats.puffs, idle + 9);
    for (let i = 0; i < 20; i++) street.update(0.1);
    assert.equal(street.stats.dust, 0, 'dağıldı');
    assert.equal(street.stats.puffs, idle);
    for (let i = 0; i < 30; i++) street.burst(i, i, 1);
    street.update(0.016);
    assert.equal(street.stats.dust, 14);
    street.dispose();
  });
});

describe('kutlama kaydı', () => {
  test('açılıştaki zafer kutlanmıyor; yeni zafer bir kez; aynı gün senaryo ve zafer, zafer kapatılınca ikinci kez değil (Codex #93)', () => {
    const log = new CelebrationLog();
    const day = (n: number) => ({ time: { day: n } });
    assert.equal(log.note({ ...day(5), victory: { day: 3 } }), false, 'kayıttaki zafer');
    assert.equal(log.note({ ...day(6), victory: { day: 3 } }), false);
    const fresh = new CelebrationLog();
    assert.equal(fresh.note(day(1)), false, 'ilk senkron');
    // Aynı gün: senaryo kazanıldı ve zafer geldi.
    const both = { ...day(40), victory: { day: 40 }, scenario: { outcome: 'won' as const, finishedDay: 40 } };
    assert.equal(fresh.note(both), true, 'bir kutlama');
    assert.equal(fresh.note(both), false);
    // Zafer kapatıldı: senaryonun kutlaması yeni değil.
    assert.equal(fresh.note({ ...both, victory: { day: 40, dismissed: true } }), false, 'havai fişek ikinci kez yok');
    assert.equal(fresh.note({ ...day(41), scenario: { outcome: 'won' as const, finishedDay: 40 } }), false);
    // Başka gün yeni bir zafer (yeni koşu aynı sahnede): yeniden.
    assert.equal(fresh.note({ ...day(90), victory: { day: 90 } }), true);
    assert.equal(fresh.note({ ...day(92), victory: { day: 92, dismissed: true } }), false, 'kapatılmış gelen zafer kutlanmıyor');
    fresh.reset();
    assert.equal(fresh.note({ ...day(95), victory: { day: 95 } }), false, 'sıfırlanınca ilk senkron gibi');
  });
});

describe('toz temizliği', () => {
  test('azaltılmış harekete geçince süren toz hemen kalkıyor (Codex #93)', () => {
    const street = new StreetLife(24, 24, 6, 0);
    street.burst(5, 5, 1);
    street.update(0.016);
    assert.equal(street.stats.dust, 1);
    street.clearDust();
    street.update(0.016);
    assert.equal(street.stats.dust, 0);
    street.dispose();
  });
});

describe('toz ve veri lensi', () => {
  test('lens açılınca süren toz bitiyor, lensteyken toz kalkmıyor; lens kapanınca eski toz dönmüyor (Codex #93)', () => {
    const street = new StreetLife(24, 24, 6, 0);
    street.burst(5, 5, 1);
    street.update(0.016);
    assert.equal(street.stats.dust, 1);
    street.setDataLens(true);
    street.burst(8, 8, 1);
    for (let i = 0; i < 600; i++) street.update(0.1);
    street.setDataLens(false);
    street.update(0.016);
    assert.equal(street.stats.dust, 0, 'lensin ardından eski toz yok');
    street.burst(9, 9, 1);
    street.update(0.016);
    assert.equal(street.stats.dust, 1, 'lens kapanınca toz yine kalkıyor');
    street.dispose();
  });
});

describe('havai fişeğin yüksekliği', () => {
  /** Kameranın baktığı yer (0, 0, 0); `distance` uzaklıkta, `polar` eğimle. */
  function cameraAt(distance: number, polar: number): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(46, 16 / 10, 0.5, 400);
    camera.position.set(0, Math.cos(polar) * distance, Math.sin(polar) * distance);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    return camera;
  }

  test('patlama kameranın önünde ve ekranda istenen yükseklikte; en yakın zoomda da (Codex #93)', () => {
    for (const distance of [8, 12, 40, 90]) {
      for (const polar of [0.45, 0.75, 1.05]) {
        const camera = cameraAt(distance, polar);
        for (const goal of [0.08, 0.3, 0.5]) {
          const where = `uzaklık ${distance}, eğim ${polar}, hedef ${goal}`;
          const height = aimHeight(camera, 1.5, -2, goal);
          const depth = -new THREE.Vector3(1.5, height, -2).applyMatrix4(camera.matrixWorldInverse).z;
          assert.ok(depth >= 4 - 1e-6, `kameranın önünde, kıvılcımlar da (${where}, yükseklik ${height.toFixed(2)}, derinlik ${depth.toFixed(2)})`);
          const screen = new THREE.Vector3(1.5, height, -2).project(camera);
          assert.ok(Math.abs(screen.y) <= 1, `ekranda (${where}, y ${screen.y.toFixed(3)})`);
          const lowest = new THREE.Vector3(1.5, 0.5, -2).project(camera).y;
          if (lowest > goal) assert.equal(height, 0.5, `yerin hemen üstü bile hedeften yukarıda: en alçakta (${where})`);
          else {
            const capped = depth < 4.01;
            assert.ok(screen.y <= goal + 0.01 && (capped || screen.y >= goal - 0.01), `hedefte ya da kameranın önündeki en yüksek yerde (${where}, y ${screen.y.toFixed(3)})`);
          }
        }
      }
    }
  });
});
