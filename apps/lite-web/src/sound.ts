/**
 * Prosedürel sesler (iOS `Sound.swift` ile aynı notalar): hiçbir ses dosyası
 * yok. Her ses birkaç kısa sinüs notası; ilk dokunuşta Web Audio açılıyor.
 */
export type Cue = 'buy' | 'milestone' | 'reward' | 'refuse' | 'event' | 'fanfare';

const NOTES: Record<Cue, Array<[number, number]>> = {
  buy: [[1320, 0.035]],
  milestone: [[660, 0.07], [990, 0.11]],
  reward: [[523, 0.07], [659, 0.07], [784, 0.13]],
  refuse: [[196, 0.09]],
  event: [[740, 0.09], [554, 0.14]],
  fanfare: [[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.22]],
};

const VOLUME: Record<Cue, number> = { buy: 0.1, refuse: 0.16, event: 0.14, milestone: 0.18, reward: 0.18, fanfare: 0.18 };

let context: AudioContext | null = null;
const buffers = new Map<Cue, AudioBuffer>();
let playing: AudioBufferSourceNode | null = null;

function buffer(ctx: AudioContext, cue: Cue): AudioBuffer {
  const cached = buffers.get(cue);
  if (cached) return cached;
  const rate = ctx.sampleRate;
  const notes = NOTES[cue];
  const total = notes.reduce((sum, [, d]) => sum + d, 0);
  const out = ctx.createBuffer(1, Math.ceil(total * rate), rate);
  const samples = out.getChannelData(0);
  let index = 0;
  for (const [frequency, duration] of notes) {
    const count = Math.floor(duration * rate);
    for (let n = 0; n < count && index < samples.length; n++) {
      const t = n / rate;
      // 4 ms giriş, sonra üstel sönüm: tık sesi yok, çan gibi bitiyor.
      const attack = Math.min(1, t / 0.004);
      const decay = Math.exp(-t / (duration * 0.45));
      const tone = Math.sin(2 * Math.PI * frequency * t) + 0.25 * Math.sin(4 * Math.PI * frequency * t);
      samples[index++] = tone * attack * decay * VOLUME[cue];
    }
  }
  buffers.set(cue, out);
  return out;
}

export function play(cue: Cue): void {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
    // Yeni ses eskisini kesiyor: hızlı art arda alımlarda sesler birikmesin.
    playing?.stop();
    const source = context.createBufferSource();
    source.buffer = buffer(context, cue);
    source.connect(context.destination);
    source.start();
    playing = source;
  } catch {
    // Ses yoksa oyun sessiz sürüyor.
  }
}

/** Dokunsal geri bildirim: destekleyen cihazda (Android) kısa titreşim. */
export function haptic(kind: 'selection' | 'warning' | 'success'): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  const pattern = kind === 'selection' ? 8 : kind === 'warning' ? [20, 40, 20] : [12, 30, 24];
  try {
    navigator.vibrate(pattern);
  } catch {
    // yok say
  }
}
