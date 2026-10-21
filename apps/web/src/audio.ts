import { sharesHeld, sharesOutstanding } from '@capital/core';
import type { GameState } from '@capital/core';
import { getSettings, subscribeSettings, updateSettings } from '@capital/ui';
import { MusicPlayer } from './music/player';
import type { MusicDebug } from './music/player';
import type { Mood } from './music/score';

/**
 * Yaşayan ses manzarası — tamamen üretilmiş, tek bir ses dosyası yok.
 *
 * Şehir sesini durumundan alıyor:
 *   - UĞULTU: kahverengi gürültü, alçak geçirgen. Nüfus büyüdükçe
 *     dolgunlaşıyor, hız kademesiyle hafifçe yükseliyor.
 *   - TRAFİK: bant geçirgen gürültü, yavaş bir dalgalanmayla. Şirketlerin
 *     bina sayısı (= kamyon, müşteri) arttıkça belirginleşiyor, gece
 *     çekiliyor.
 *   - GECE: cırcır böcekleri — yüksek perdeli, hızlı genlik titreşimiyle
 *     açılıp kapanan iki ton. Yalnızca karanlıkta.
 *   - GERİLİM: baskın aşamasına göre yükselen, birbirinden hafif kayık
 *     iki testere dişi. Baskın yokken sessiz — tehdidi önce kulak duyar.
 *
 * Olaylar tek atımlık: kasa (iyi haber, kendi binan), tok bir vuruş
 * (inşaat), alçak bir şişme (kötü haber), tokmak (meclis kararı).
 *
 * Kural: ilk kullanıcı dokunuşuna kadar SESSİZ (tarayıcı politikası ve
 * nezaket). Sessize alma bu tarayıcıda hatırlanıyor.
 *
 * Düzeyler Ayarlar'dan (Tur 47): genel, şehir (sürekli katmanlar) ve
 * olaylar (tek atımlık sesler) ayrı yollardan geçiyor. Sessize alma da
 * ayarların içinde; ses düğmesi ve Ayarlar aynı seçimi değiştiriyor.
 *
 * Müzik (Tur 49) dördüncü yol: `music/score.ts` besteliyor, `music/player.ts`
 * çalıyor. Ruh hâlini şehir seçiyor: gündüz, gece, kriz; kriz uyarısında
 * ve baskında günün müziğinin altında kalp atışı. Duraklayınca yalnız pad
 * ve bas, oyun bitince susuyor.
 */

/** Genel sesin %100'deki kazancı: Tur 47'ye kadarki sabit düzey. */
const MASTER_LEVEL = 0.55;

type SoundName = 'cash' | 'build' | 'bad' | 'gavel';

function noiseBuffer(ctx: AudioContext, kind: 'brown' | 'white', seconds = 2): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Sabit tohumlu gürültü: her açılışta aynı doku, Math.random yok.
  let seed = 0x9e3779b9;
  const next = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = next() * 2 - 1;
    if (kind === 'white') data[i] = white;
    else {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  }
  return buffer;
}

export interface SoundscapeDebug {
  context: 'none' | AudioContextState;
  muted: boolean;
  played: Record<SoundName, number>;
  levels: { hum: number; traffic: number; night: number; tension: number };
  /** Ses yollarına verilen kazanç: genel, müzik (Tur 49), şehir, olaylar (Tur 47). */
  buses: { master: number; music: number; ambience: number; effects: number };
  /** Müzik çalmaya başladıysa ruh hâli, ölçü, çalınan nota, katmanlar. */
  music: MusicDebug | null;
}

export class Soundscape {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: GainNode | null = null;
  private effects: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private music: MusicPlayer | null = null;
  /** Gündüz/gece eşiği aşılırken gidip gelmesin: son seçilen. */
  private musicMood: Mood = 'day';
  private hum: GainNode | null = null;
  private traffic: GainNode | null = null;
  private night: GainNode | null = null;
  private tension: GainNode | null = null;
  /** Olay tabanı hangi durum nesnesine ait — yeni oyun/kayıt tabanı sıfırlar. */
  private baseline: GameState | null = null;
  private lastNewsId = 0;
  private lastPlayerBuildings = 0;
  private readonly listeners = new Set<() => void>();
  private readonly played: Record<SoundName, number> = { cash: 0, build: 0, bad: 0, gavel: 0 };
  private readonly levels = { hum: 0, traffic: 0, night: 0, tension: 0 };

  private stopSettings: (() => void) | null = null;
  private readonly startOnTouch = () => {
    this.start();
    window.removeEventListener('pointerdown', this.startOnTouch);
    window.removeEventListener('keydown', this.startOnTouch);
  };

  /** Oyun ekranı açılınca: ilk dokunuşu bekle, ayarları izle. */
  attach(): void {
    this.stopSettings ??= subscribeSettings(() => {
      this.applyLevels(0.08);
      this.listeners.forEach((listener) => listener());
    });
    if (!this.ctx) {
      window.addEventListener('pointerdown', this.startOnTouch);
      window.addEventListener('keydown', this.startOnTouch);
    }
  }

  /**
   * Oyun ekranı kapanınca (yeni oyun menüsü): müzik ve şehir susuyor, bağlam
   * kapanıyor. Tur 49'a kadar menüde şehir sesi son düzeyinde çalmaya devam
   * ediyordu; müzikle birlikte bu duyulur hâle geldi. `attach` yeniden
   * açabiliyor (geliştirmede React etkileri iki kez kuruyor).
   */
  dispose(): void {
    window.removeEventListener('pointerdown', this.startOnTouch);
    window.removeEventListener('keydown', this.startOnTouch);
    this.stopSettings?.();
    this.stopSettings = null;
    this.music?.stop();
    this.music = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.master = this.ambience = this.effects = this.musicBus = null;
    this.hum = this.traffic = this.night = this.tension = null;
  }

  isMuted(): boolean {
    return getSettings().muted;
  }

  /** Ayarlardaki düzeyler; bağlam yokken yalnızca hedefler. */
  private buses(): SoundscapeDebug['buses'] {
    const { muted, volume } = getSettings();
    return { master: muted ? 0 : MASTER_LEVEL * volume.master, music: volume.music, ambience: volume.ambience, effects: volume.effects };
  }

  private applyLevels(seconds: number): void {
    if (!this.ctx || !this.master || !this.ambience || !this.effects || !this.musicBus) return;
    const target = this.buses();
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(target.master, now, seconds);
    this.musicBus.gain.setTargetAtTime(target.music, now, seconds);
    this.ambience.gain.setTargetAtTime(target.ambience, now, seconds);
    this.effects.gain.setTargetAtTime(target.effects, now, seconds);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setMuted(muted: boolean): void {
    // Ayarlar abonesi düzeyleri uyguluyor ve dinleyicilere duyuruyor.
    updateSettings({ muted });
  }

  /** İlk dokunuşta: bağlam ve sürekli katmanlar. */
  private start(): void {
    if (this.ctx) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    let ctx: AudioContext;
    try {
      ctx = new Ctor();
    } catch {
      return;
    }
    this.ctx = ctx;
    const levels = this.buses();
    const master = ctx.createGain();
    master.gain.value = levels.master;
    master.connect(ctx.destination);
    this.master = master;
    // Şehir: sürekli katmanlar. Olaylar: tek atımlık sesler.
    const ambience = ctx.createGain();
    ambience.gain.value = levels.ambience;
    ambience.connect(master);
    this.ambience = ambience;
    const effects = ctx.createGain();
    effects.gain.value = levels.effects;
    effects.connect(master);
    this.effects = effects;
    // Müzik: kendi yolu, kendi düzeyi.
    const musicBus = ctx.createGain();
    musicBus.gain.value = levels.music;
    musicBus.connect(master);
    this.musicBus = musicBus;
    this.music = new MusicPlayer(ctx, musicBus);
    this.music.start();

    const loop = (buffer: AudioBuffer) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.start();
      return source;
    };
    const brown = noiseBuffer(ctx, 'brown', 3);
    const white = noiseBuffer(ctx, 'white', 2);

    // Uğultu
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 320;
    this.hum = ctx.createGain();
    this.hum.gain.value = 0;
    loop(brown).connect(humFilter).connect(this.hum).connect(ambience);

    // Trafik: bant geçirgen + yavaş dalga
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 850;
    band.Q.value = 0.7;
    const swell = ctx.createGain();
    swell.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.35;
    lfo.connect(lfoDepth).connect(swell.gain);
    lfo.start();
    this.traffic = ctx.createGain();
    this.traffic.gain.value = 0;
    loop(white).connect(band).connect(swell).connect(this.traffic).connect(ambience);

    // Gece: iki yüksek ton, hızlı genlik titreşimi
    this.night = ctx.createGain();
    this.night.gain.value = 0;
    for (const [pitch, rate] of [
      [4200, 28],
      [4650, 33],
    ] as const) {
      const tone = ctx.createOscillator();
      tone.frequency.value = pitch;
      const chirp = ctx.createGain();
      chirp.gain.value = 0;
      const trill = ctx.createOscillator();
      trill.frequency.value = rate;
      const trillDepth = ctx.createGain();
      trillDepth.gain.value = 0.5;
      trill.connect(trillDepth).connect(chirp.gain);
      tone.connect(chirp).connect(this.night);
      tone.start();
      trill.start();
    }
    const nightLevel = ctx.createGain();
    nightLevel.gain.value = 0.035;
    this.night.connect(nightLevel).connect(ambience);

    // Gerilim: iki kayık testere dişi, alçak geçirgen
    const tensionFilter = ctx.createBiquadFilter();
    tensionFilter.type = 'lowpass';
    tensionFilter.frequency.value = 260;
    this.tension = ctx.createGain();
    this.tension.gain.value = 0;
    for (const pitch of [55, 55.7]) {
      const saw = ctx.createOscillator();
      saw.type = 'sawtooth';
      saw.frequency.value = pitch;
      saw.connect(tensionFilter);
      saw.start();
    }
    tensionFilter.connect(this.tension).connect(ambience);
    this.listeners.forEach((listener) => listener());
  }

  /** Durumdan katman seviyeleri ve olay sesleri. Yarım saniyede bir çağrılır. */
  update(state: GameState, daylight: number): void {
    const player = state.companies[state.playerCompanyId];
    const population = state.districts.reduce((sum, d) => sum + d.population, 0);
    const buildings = Object.keys(state.buildings).length;
    const speed = state.time.speed;

    let raid = 0;
    if (player) {
      for (const company of Object.values(state.companies)) {
        if (company.isPlayer) continue;
        raid = Math.max(raid, sharesHeld(state, company.id, player.id) / sharesOutstanding(state, player.id));
      }
    }
    const stage = raid >= 0.4 ? 3 : raid >= 0.25 ? 2 : raid >= 0.1 ? 1 : 0;

    const paused = speed === 0 || state.gameOver !== undefined;
    this.levels.hum = paused ? 0.05 : Math.min(0.22, 0.06 + population / 400_000);
    this.levels.traffic = paused ? 0 : Math.min(0.12, 0.015 + buildings / 2500) * (0.35 + 0.65 * daylight);
    this.levels.night = paused ? 0 : Math.max(0, 1 - daylight * 1.6);
    this.levels.tension = [0, 0.03, 0.07, 0.12][stage]!;

    // Müzik: ruh hâli ölçü başında değişiyor (çalıcı), eşik burada.
    const crisis = state.crisis;
    if (crisis?.phase === 'active' && state.time.day >= crisis.activeDay) this.musicMood = 'crisis';
    else if (this.musicMood !== 'day' && daylight > 0.5) this.musicMood = 'day';
    else if (this.musicMood !== 'night' && daylight < 0.35) this.musicMood = 'night';
    else if (this.musicMood === 'crisis') this.musicMood = daylight >= 0.42 ? 'day' : 'night';
    this.music?.setMix({
      mood: this.musicMood,
      heartbeat: crisis?.phase === 'warning' || stage >= 2,
      intensity: Math.min(1, buildings / 1200),
      paused: speed === 0,
      silent: state.gameOver !== undefined,
    });

    if (this.ctx && this.hum && this.traffic && this.night && this.tension) {
      const now = this.ctx.currentTime;
      this.hum.gain.setTargetAtTime(this.levels.hum, now, 1.2);
      this.traffic.gain.setTargetAtTime(this.levels.traffic, now, 1.2);
      this.night.gain.setTargetAtTime(this.levels.night, now, 2);
      this.tension.gain.setTargetAtTime(this.levels.tension, now, 1.5);
    }

    // Olaylar: yeni haberler ve oyuncunun yeni binaları. Durum nesnesi
    // değiştiyse (yeni oyun, kayıt yükleme) taban sıfırlanıyor: haber
    // kimlikleri her oyunda baştan sayıyor ve eski taban yeni oyunun
    // bütün seslerini susturur, geçmiş haberleri de çalmamak gerekir.
    const own = player ? Object.values(state.buildings).filter((b) => b.companyId === player.id).length : 0;
    if (state !== this.baseline) {
      this.baseline = state;
      this.lastNewsId = state.news[0]?.id ?? 0;
      this.lastPlayerBuildings = own;
      return;
    }
    const fresh = state.news.filter((item) => item.id > this.lastNewsId);
    if (fresh.length > 0) {
      this.lastNewsId = fresh[0]!.id;
      const item = fresh[0]!;
      if (item.title.startsWith('Meclis')) this.play('gavel');
      else if (item.tone === 'good') this.play('cash');
      else if (item.tone === 'bad') this.play('bad');
    }
    if (own > this.lastPlayerBuildings) this.play('build');
    this.lastPlayerBuildings = own;
  }

  private play(name: SoundName): void {
    this.played[name]++;
    const ctx = this.ctx;
    // Olay sesleri kendi yolundan: Ayarlar'daki "Olaylar" düzeyi.
    const out = this.effects;
    if (!ctx || !out || getSettings().muted) return;
    const now = ctx.currentTime;
    const envelope = (gain: GainNode, peak: number, attack: number, decay: number) => {
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak, now + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
    };

    if (name === 'cash') {
      // Kasa: iki parlak kısmi ve kısa bir tık.
      for (const [pitch, delay] of [
        [1320, 0],
        [1760, 0.07],
      ] as const) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = pitch;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now + delay);
        gain.gain.linearRampToValueAtTime(0.18, now + delay + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.45);
        osc.connect(gain).connect(out);
        osc.start(now + delay);
        osc.stop(now + delay + 0.5);
      }
    } else if (name === 'build') {
      // İnşaat: perdesi düşen tok bir vuruş.
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(48, now + 0.25);
      const gain = ctx.createGain();
      envelope(gain, 0.35, 0.004, 0.32);
      osc.connect(gain).connect(out);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (name === 'bad') {
      // Kötü haber: alçak, minör bir şişme.
      for (const pitch of [110, 130.8]) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = pitch;
        const gain = ctx.createGain();
        envelope(gain, 0.12, 0.35, 1.1);
        osc.connect(gain).connect(out);
        osc.start(now);
        osc.stop(now + 1.6);
      }
    } else if (name === 'gavel') {
      // Tokmak: iki kısa, kuru vuruş.
      for (const delay of [0, 0.16]) {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = 220;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 900;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now + delay);
        gain.gain.linearRampToValueAtTime(0.16, now + delay + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.09);
        osc.connect(filter).connect(gain).connect(out);
        osc.start(now + delay);
        osc.stop(now + delay + 0.12);
      }
    }
  }

  debug(): SoundscapeDebug {
    return {
      context: this.ctx ? this.ctx.state : 'none',
      muted: getSettings().muted,
      played: { ...this.played },
      levels: { ...this.levels },
      buses: this.buses(),
      music: this.music?.debug() ?? null,
    };
  }
}
