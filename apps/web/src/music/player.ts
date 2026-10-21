import { BEATS_PER_BAR, MOODS, composeBar } from './score';
import type { Layer, Mood, NoteEvent } from './score';

/**
 * Müziğin çalıcısı (Tur 49): besteyi (`score.ts`) WebAudio'ya veriyor.
 *
 * İleri bakan zamanlayıcı: her 100 ms'de bir, önümüzdeki 1,5 saniyenin
 * ölçüleri sıraya konuyor. Sekme arka plandayken tarayıcı zamanlayıcıyı
 * saniyede bire indiriyor; pencere ondan geniş, müzik kesilmiyor.
 *
 * Ruh hâli ve yoğunluk ölçü başında okunuyor (`setMix`): şehir geceye
 * dönünce ya da kriz başlayınca müzik ölçünün ortasında değil, bir sonraki
 * ölçüde dönüyor. Katman kazançları ise yumuşakça kayıyor: oyun duraklayınca
 * yalnız pad ve bas kalıyor, oyun bitince müzik susuyor.
 */
export interface MusicMix {
  mood: Mood;
  /** Kriz uyarısı ya da baskın: günün müziğinin altında kalp atışı. */
  heartbeat: boolean;
  /** 0..1, şehrin büyüklüğü. */
  intensity: number;
  /** Duraklatıldı: yalnız pad ve bas. */
  paused: boolean;
  /** Oyun bitti ya da sonuç ekranı: sus. */
  silent: boolean;
}

export interface MusicDebug {
  mood: Mood;
  bar: number;
  /** Katman başına çalınan nota (sıraya konduğu anda sayılıyor). */
  played: Record<Layer, number>;
  /** Katmanların şu anki kazancı. */
  layers: Record<Layer, number>;
}

const LOOKAHEAD_S = 1.5;
const TICK_MS = 100;
const LAYERS: readonly Layer[] = ['pad', 'bass', 'arp', 'lead', 'pulse'];
/** Katmanların karışımdaki payı (müzik yolunun %100'ünde). */
const LAYER_LEVEL: Record<Layer, number> = { pad: 0.5, bass: 0.55, arp: 0.32, lead: 0.3, pulse: 0.6 };

const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Yankı için üretilmiş, sabit tohumlu sönümlenen gürültü. */
function impulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  let seed = 0x2545f491;
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      const noise = ((seed >>> 0) / 4294967296) * 2 - 1;
      data[i] = noise * (1 - i / length) ** 2.6;
    }
  }
  return buffer;
}

export class MusicPlayer {
  private readonly layers: Record<Layer, GainNode>;
  private readonly reverb: ConvolverNode;
  private mix: MusicMix = { mood: 'day', heartbeat: false, intensity: 0.3, paused: false, silent: false };
  private mood: Mood = 'day';
  private bar = 0;
  private nextBarAt = 0;
  private readonly played: Record<Layer, number> = { pad: 0, bass: 0, arp: 0, lead: 0, pulse: 0 };
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
  ) {
    // Kuru ve yankılı iki yol; pad, arpej ve melodi yankıya da gidiyor.
    const dry = ctx.createGain();
    dry.connect(out);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx, 2.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.reverb.connect(wet).connect(out);
    const layers = {} as Record<Layer, GainNode>;
    for (const layer of LAYERS) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(dry);
      if (layer !== 'bass' && layer !== 'pulse') gain.connect(this.reverb);
      layers[layer] = gain;
    }
    this.layers = layers;
  }

  start(): void {
    if (this.timer) return;
    this.nextBarAt = this.ctx.currentTime + 0.3;
    this.applyLevels(1.5);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Şehrin istediği müzik; yarım saniyede bir (ses manzarasıyla birlikte). */
  setMix(mix: MusicMix): void {
    const changed = mix.paused !== this.mix.paused || mix.silent !== this.mix.silent;
    this.mix = mix;
    if (changed) this.applyLevels(mix.silent ? 2.5 : 1.2);
  }

  private applyLevels(seconds: number): void {
    const now = this.ctx.currentTime;
    for (const layer of LAYERS) {
      const on = !this.mix.silent && (!this.mix.paused || layer === 'pad' || layer === 'bass');
      this.layers[layer].gain.setTargetAtTime(on ? LAYER_LEVEL[layer] : 0, now, seconds / 3);
    }
  }

  private tick(): void {
    const now = this.ctx.currentTime;
    // Zamanlayıcı bir süre çalışmadıysa (sekme uyudu, kare takıldı) kaçan
    // ölçüler geçmişe sıralanmıyor: hepsi bir anda çalardı. Müzik bir
    // sonraki ölçüden sürüyor.
    if (this.nextBarAt < now) this.nextBarAt = now + 0.1;
    const horizon = now + LOOKAHEAD_S;
    while (this.nextBarAt < horizon) {
      // Ruh hâli ölçü başında değişiyor.
      this.mood = this.mix.mood;
      const beat = 60 / MOODS[this.mood].tempo;
      if (!this.mix.silent) {
        for (const note of composeBar(this.mood, this.bar, 1, this.mix.intensity, this.mix.heartbeat)) {
          this.voice(note, this.nextBarAt + note.beat * beat, note.length * beat);
        }
      }
      this.nextBarAt += BEATS_PER_BAR * beat;
      this.bar++;
    }
  }

  /** Bir notanın sesi: katmanına göre tını ve zarf. */
  private voice(note: NoteEvent, at: number, length: number): void {
    const ctx = this.ctx;
    const out = this.layers[note.layer];
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(out);
    const hz = frequency(note.midi);
    // Ölçüldü (Tur 49, çevrimdışı çizim): varsayılan düzeyde müziğin RMS'i
    // ~0,027, tepesi ~0,13; şehrin uğultusunun altında, olay seslerinin yanında.
    const peak = note.velocity * 0.38;
    const oscillators: OscillatorNode[] = [];
    const add = (type: OscillatorType, detune = 0) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = hz;
      osc.detune.value = detune;
      oscillators.push(osc);
      return osc;
    };
    let end = at + length;
    if (note.layer === 'pad') {
      // Yavaş açılan, iki hafif kayık üçgen; alçak geçirgenle ılık.
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1100;
      filter.connect(gain);
      add('triangle', -6).connect(filter);
      add('triangle', 6).connect(filter);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(peak * 0.55, at + Math.min(0.9, length / 3));
      gain.gain.setTargetAtTime(0, end - 0.15, 0.35);
      end += 1.2;
    } else if (note.layer === 'bass') {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      filter.connect(gain);
      add('triangle').connect(filter);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(peak, at + 0.02);
      gain.gain.setTargetAtTime(peak * 0.6, at + 0.05, 0.3);
      gain.gain.setTargetAtTime(0, end - 0.05, 0.12);
      end += 0.5;
    } else if (note.layer === 'pulse') {
      // Kalp atışı: perdesi hafif düşen kısa bir sinüs.
      const osc = add('sine');
      osc.frequency.setValueAtTime(hz * 1.5, at);
      osc.frequency.exponentialRampToValueAtTime(hz, at + 0.08);
      osc.connect(gain);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(peak * 1.3, at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      end = at + 0.35;
    } else if (note.layer === 'arp') {
      // Kısa, tıngırtılı: üçgen, hızlı sönüm.
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2600;
      filter.connect(gain);
      add('triangle').connect(filter);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(peak, at + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(0.18, Math.min(0.5, length)));
      end = at + Math.max(0.2, Math.min(0.55, length + 0.05));
    } else {
      // Melodi: sinüs, hafif titreşim, yumuşak atak.
      const osc = add('sine');
      const vibrato = ctx.createOscillator();
      vibrato.frequency.value = 5;
      const depth = ctx.createGain();
      depth.gain.value = 3;
      vibrato.connect(depth).connect(osc.detune);
      oscillators.push(vibrato);
      osc.connect(gain);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(peak, at + 0.04);
      gain.gain.setTargetAtTime(peak * 0.7, at + 0.08, 0.2);
      gain.gain.setTargetAtTime(0, end - 0.05, 0.15);
      end += 0.6;
    }
    for (const osc of oscillators) {
      osc.start(at);
      osc.stop(end);
    }
    // Biten notanın düğümleri kendiliğinden toplanıyor; ilkini dinlemek yeter.
    oscillators[0]!.onended = () => gain.disconnect();
    this.played[note.layer]++;
  }

  debug(): MusicDebug {
    const layers = {} as Record<Layer, number>;
    for (const layer of LAYERS) layers[layer] = Math.round(this.layers[layer].gain.value * 1000) / 1000;
    return { mood: this.mood, bar: this.bar, played: { ...this.played }, layers };
  }
}
