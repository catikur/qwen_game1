import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewGame } from '@capital/core';
import { Soundscape } from '../src/audio';
import { MusicPlayer } from '../src/music/player';
import { BEATS_PER_BAR, MOODS, PHRASE_BARS, chordOf, composeBar, scaleNote } from '../src/music/score';
import type { Mood } from '../src/music/score';

const pitchClass = (midi: number) => ((midi % 12) + 12) % 12;
const inScale = (mood: Mood, midi: number) => MOODS[mood].scale.map((step) => (MOODS[mood].root + step) % 12).includes(pitchClass(midi));
const bars = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('müzik: besteleme', () => {
  test('her nota ruh hâlinin dizisinde; ölçünün dışına taşmıyor', () => {
    for (const mood of ['day', 'night', 'crisis'] as const) {
      for (const bar of bars(32)) {
        for (const note of composeBar(mood, bar, 7, 0.6)) {
          assert.ok(inScale(mood, note.midi), `${mood} ölçü ${bar}: ${note.midi} dizide değil`);
          assert.ok(note.beat >= 0 && note.beat < BEATS_PER_BAR && note.beat + note.length <= BEATS_PER_BAR + 1e-9, `${mood} ${note.layer} ${note.beat}+${note.length}`);
          assert.ok(note.velocity > 0 && note.velocity <= 1);
        }
      }
    }
  });

  test('pad o ölçünün akoru; akorlar dört ölçüde bir dönüyor', () => {
    for (const mood of ['day', 'night', 'crisis'] as const) {
      for (const bar of bars(8)) {
        const pad = composeBar(mood, bar).filter((n) => n.layer === 'pad').map((n) => pitchClass(n.midi)).sort();
        const chord = chordOf(MOODS[mood], bar).notes.map(pitchClass).sort();
        assert.deepEqual(pad, chord, `${mood} ölçü ${bar}`);
      }
      assert.deepEqual(chordOf(MOODS[mood], 1), chordOf(MOODS[mood], 5));
    }
  });

  test('gündüz Re majör (I–vi–IV–V), kriz Si minör: tonik akorunda küçük üçlü', () => {
    assert.deepEqual(chordOf(MOODS.day, 0).notes.map(pitchClass), [2, 6, 9], 'Re–Fa#–La');
    assert.deepEqual(chordOf(MOODS.day, 1).notes.map(pitchClass), [11, 2, 6], 'Si minör');
    const crisis = chordOf(MOODS.crisis, 0).notes;
    assert.equal(crisis[1]! - crisis[0]!, 3, 'küçük üçlü');
    assert.equal(scaleNote(MOODS.day, 7), MOODS.day.root + 12, 'yedinci derece bir oktav yukarı');
    assert.equal(scaleNote(MOODS.day, -7), MOODS.day.root - 12);
  });

  test('aynı ölçü hep aynı; iki cümle aynı değil', () => {
    assert.deepEqual(composeBar('day', 13, 3, 0.5), composeBar('day', 13, 3, 0.5));
    const phrase = (start: number) => bars(PHRASE_BARS).map((i) => composeBar('day', start + i, 3, 0.5));
    assert.notDeepEqual(phrase(0), phrase(PHRASE_BARS));
  });

  test('melodi yalnız cümlenin ikinci yarısında ve krizde hiç yok', () => {
    for (const bar of bars(64)) {
      const lead = composeBar('day', bar, 5, 1).filter((n) => n.layer === 'lead');
      if (bar % PHRASE_BARS < PHRASE_BARS / 2) assert.equal(lead.length, 0, `ölçü ${bar}`);
      assert.equal(composeBar('crisis', bar, 5, 1).filter((n) => n.layer === 'lead').length, 0);
    }
    const sung = bars(64).filter((bar) => composeBar('day', bar, 5, 1).some((n) => n.layer === 'lead')).length;
    assert.ok(sung >= 16, `büyük şehirde gündüz melodisi duyuluyor (${sung}/64 ölçü)`);
  });

  test('gece gündüzden seyrek, kasaba metropolden seyrek; krizde kalp atışı var', () => {
    const count = (mood: Mood, intensity: number) =>
      bars(64).reduce((sum, bar) => sum + composeBar(mood, bar, 9, intensity).filter((n) => n.layer === 'arp' || n.layer === 'lead').length, 0);
    assert.ok(count('night', 0.5) < count('day', 0.5) * 0.6, `gece ${count('night', 0.5)} · gündüz ${count('day', 0.5)}`);
    assert.ok(count('day', 0) < count('day', 1), `kasaba ${count('day', 0)} · metropol ${count('day', 1)}`);
    const pulse = composeBar('crisis', 0).filter((n) => n.layer === 'pulse');
    assert.equal(pulse.length, 4);
    assert.equal(composeBar('day', 0).filter((n) => n.layer === 'pulse').length, 0);
  });

  test('kriz uyarısında günün müziği sürüyor, altında kalp atışı; uyumu değişmiyor', () => {
    const calm = composeBar('day', 3, 2, 0.5);
    const warned = composeBar('day', 3, 2, 0.5, true);
    assert.deepEqual(warned.filter((n) => n.layer !== 'pulse'), calm);
    const pulse = warned.filter((n) => n.layer === 'pulse');
    assert.equal(pulse.length, 2);
    assert.ok(pulse.every((n) => inScale('day', n.midi) && n.velocity < 0.5));
  });
});

/**
 * Çalıcının ve ses manzarasının istediği kadar WebAudio: düğümler
 * bağlanıyor, osilatörlerin başlangıcı kaydediliyor, kazancın hedefi
 * hemen değer oluyor (zarf yok).
 */
function fakeContext() {
  const starts: number[] = [];
  const param = () => ({
    value: 0,
    setTargetAtTime(target: number) {
      this.value = target;
    },
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  const node = () => ({
    gain: param(),
    frequency: param(),
    detune: param(),
    Q: param(),
    type: '',
    buffer: null as unknown,
    loop: false,
    onended: null as unknown,
    connect(target: unknown) {
      return target;
    },
    disconnect() {},
    start(at = 0) {
      starts.push(at);
    },
    stop() {},
  });
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    state: 'running',
    destination: node(),
    createGain: node,
    createConvolver: node,
    createBiquadFilter: node,
    createOscillator: node,
    createBufferSource: node,
    createBuffer: (channels: number, length: number) => ({ getChannelData: () => new Float32Array(length), numberOfChannels: channels }),
    close: async () => undefined,
  };
  return { ctx, starts };
}

describe('müzik: çalıcı', () => {
  test('sekme uyuyup uyanınca kaçan ölçüler geçmişe sıralanmıyor (hepsi bir anda çalardı)', () => {
    const { ctx, starts } = fakeContext();
    const player = new MusicPlayer(ctx as unknown as AudioContext, ctx.createGain() as unknown as AudioNode);
    player.start();
    player.stop();
    assert.ok(starts.length > 0, 'ilk ölçüler sırada');
    // Zamanlayıcı 30 saniye çalışmadı (sekme uyudu, kare takıldı); ses saati ilerledi.
    ctx.currentTime = 30;
    const before = starts.length;
    (player as unknown as { tick(): void }).tick();
    const late = starts.slice(before);
    assert.ok(late.length > 0, 'müzik sürüyor');
    assert.ok(late.every((at) => at >= 30), `geçmişe sıralanan nota: ${late.filter((at) => at < 30).length}`);
    assert.ok(player.debug().bar <= 4, `bir anda ${player.debug().bar} ölçü sıralandı`);
  });

  test('ses ilk dokunuşla açılınca müzik oyunun o anki hâliyle başlıyor: gece ve duraklatılmış (Codex #78)', () => {
    // Bağlam yokken de ses manzarası yarım saniyede bir durumu okuyor. İlk
    // dokunuşta çalıcı hemen ilk ölçüyü sıraya koyuyor; karışımı bilmeseydi
    // o ölçü gündüz ve duraklamamış çalardı.
    const { ctx } = fakeContext();
    const listeners = new Map<string, () => void>();
    const fakeWindow = {
      AudioContext: function FakeAudioContext() {
        return ctx;
      },
      addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    };
    Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true });
    const state = createNewGame({ seed: 3, companyName: 'Gece AŞ' });
    state.time.speed = 0;
    const soundscape = new Soundscape();
    soundscape.update(state, 0.1);
    soundscape.attach();
    listeners.get('pointerdown')?.();
    const music = soundscape.debug().music;
    soundscape.dispose();
    assert.ok(music, 'müzik başladı');
    assert.equal(music.mood, 'night', 'ilk ölçü gecenin');
    assert.equal(music.layers.arp, 0, 'duraklatılmış: arpej susuk');
    assert.equal(music.layers.lead, 0, 'duraklatılmış: melodi susuk');
    assert.ok(music.layers.pad > 0, 'pad çalıyor');
  });
});

