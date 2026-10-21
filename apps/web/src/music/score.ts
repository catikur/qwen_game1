/**
 * Oyunun müziği: besteleme (Tur 49). Saf, sesten habersiz.
 *
 * Ses manzarası gibi müzik de dosyasız; her ölçü burada notalara dökülüyor,
 * çalıcı (`player.ts`) onları WebAudio'ya veriyor. Üç ruh hâli var ve şehir
 * hangisini istiyorsa ölçü başında ona geçiliyor:
 *
 * - **Gündüz:** Re majör, I–vi–IV–V, dakikada 84 vuruş. Ilık bir pad, kök
 *   bas, sekizlik arpej, ikinci yarısında kısa bir melodi.
 * - **Gece:** aynı tonda vi–IV–I–V, 68 vuruş. Pad alçakta, arpej seyrek,
 *   melodi nadiren. Şehir uyuyor ama ışıklar yanık.
 * - **Kriz:** Si minör, i–VI–III–VII, 96 vuruş. Kalp atışı gibi bas,
 *   kısa vuruşlu arpej, melodi yok. Kriz uyarısında ve baskında günün
 *   müziği sürüyor, altında usul bir kalp atışı (`heartbeat`).
 *
 * Tekrar hissini kırmak için: sekiz ölçülük cümleler, melodi yalnız
 * cümlenin ikinci yarısında; arpej biçimi cümleden cümleye değişiyor;
 * notalar ölçü numarası ve tohumla seçiliyor (aynı ölçü hep aynı, iki
 * cümle birbirinin aynı değil). `intensity` şehrin büyüklüğü: arpejin ve
 * melodinin yoğunluğu onunla artıyor.
 */
export type Mood = 'day' | 'night' | 'crisis';
export type Layer = 'pad' | 'bass' | 'arp' | 'lead' | 'pulse';

export interface NoteEvent {
  layer: Layer;
  /** Ölçü içindeki başlangıç, vuruş cinsinden (0 ≤ beat < 4). */
  beat: number;
  /** Süre, vuruş cinsinden. */
  length: number;
  /** MIDI nota numarası (60 = Do4). */
  midi: number;
  /** 0..1 */
  velocity: number;
}

export interface MoodDef {
  /** Dakikada vuruş. */
  tempo: number;
  /** Tonik, MIDI. */
  root: number;
  /** Dizi, tonikten yarım ses aralıkları. */
  scale: readonly number[];
  /** Ölçü başına akor, dizinin derecesi (0 = tonik). */
  progression: readonly number[];
}

export const BEATS_PER_BAR = 4;
/** Cümle uzunluğu: melodi ikinci yarısında giriyor, arpej biçimi cümlede bir değişiyor. */
export const PHRASE_BARS = 8;

const MAJOR = [0, 2, 4, 5, 7, 9, 11] as const;
const MINOR = [0, 2, 3, 5, 7, 8, 10] as const;

export const MOODS: Record<Mood, MoodDef> = {
  day: { tempo: 84, root: 62, scale: MAJOR, progression: [0, 5, 3, 4] },
  night: { tempo: 68, root: 62, scale: MAJOR, progression: [5, 3, 0, 4] },
  crisis: { tempo: 96, root: 59, scale: MINOR, progression: [0, 5, 2, 6] },
};

/** Sabit tohumlu küçük üreteç (mulberry32): her ölçü kendi tohumuyla. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dizinin `degree`. basamağı, oktav taşıyarak (negatif derece aşağı iner). */
export function scaleNote(def: MoodDef, degree: number): number {
  const size = def.scale.length;
  const octave = Math.floor(degree / size);
  const index = ((degree % size) + size) % size;
  return def.root + 12 * octave + def.scale[index]!;
}

/** Ölçünün akoru: derecesi ve üç notası (kök, üçlü, beşli). */
export function chordOf(def: MoodDef, bar: number): { degree: number; notes: number[] } {
  const degree = def.progression[((bar % def.progression.length) + def.progression.length) % def.progression.length]!;
  return { degree, notes: [degree, degree + 2, degree + 4].map((d) => scaleNote(def, d)) };
}

/** Arpej biçimleri: akorun üç notası ve üst oktavdaki kökü üzerinde. */
const ARP_SHAPES: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 2, 1, 0, 1],
  [0, 2, 1, 3, 0, 2, 1, 3],
  [0, 1, 2, 1, 3, 2, 1, 2],
];

/**
 * Bir ölçünün notaları. `intensity` 0..1 (küçük kasaba → metropol).
 * Aynı (ruh hâli, ölçü, tohum, yoğunluk) hep aynı ölçüyü verir.
 */
export function composeBar(mood: Mood, bar: number, seed = 1, intensity = 0.5, heartbeat = false): NoteEvent[] {
  const def = MOODS[mood];
  const rand = random(seed * 7919 + bar * 104729 + (mood === 'day' ? 1 : mood === 'night' ? 2 : 3));
  const level = Math.min(1, Math.max(0, intensity));
  const { degree, notes } = chordOf(def, bar);
  const phrase = Math.floor(bar / PHRASE_BARS);
  const inPhrase = ((bar % PHRASE_BARS) + PHRASE_BARS) % PHRASE_BARS;
  const events: NoteEvent[] = [];

  // Pad: akorun üç notası bir oktav aşağıda, bütün ölçü boyunca. Gece daha da aşağıda ve yumuşak.
  const padShift = mood === 'night' ? -24 : -12;
  for (const midi of notes) {
    events.push({ layer: 'pad', beat: 0, length: BEATS_PER_BAR, midi: midi + padShift, velocity: mood === 'night' ? 0.32 : 0.4 });
  }

  // Bas: kök iki oktav aşağıda. Gündüz üçüncü vuruşta beşli; krizde kalp atışı (bir-iki, bir-iki).
  const bassRoot = scaleNote(def, degree) - 24;
  if (mood === 'crisis') {
    for (const beat of [0, 0.5, 2, 2.5]) {
      events.push({ layer: 'pulse', beat, length: 0.35, midi: bassRoot, velocity: beat % 2 === 0 ? 0.7 : 0.45 });
    }
  } else {
    events.push({ layer: 'bass', beat: 0, length: mood === 'night' ? 4 : 2, midi: bassRoot, velocity: 0.55 });
    if (mood === 'day') events.push({ layer: 'bass', beat: 2, length: 2, midi: scaleNote(def, degree + 4) - 24, velocity: 0.45 });
    // Kriz uyarısı ya da baskın: günün müziği sürüyor, altında usul bir kalp atışı.
    if (heartbeat) {
      events.push({ layer: 'pulse', beat: 0, length: 0.35, midi: bassRoot, velocity: 0.4 });
      events.push({ layer: 'pulse', beat: 0.5, length: 0.35, midi: bassRoot, velocity: 0.26 });
    }
  }

  // Arpej: sekizlik (gece dörtlük). Yoğunluk düşükken bazı basamaklar susuyor.
  const shape = ARP_SHAPES[((phrase % ARP_SHAPES.length) + ARP_SHAPES.length) % ARP_SHAPES.length]!;
  const step = mood === 'night' ? 1 : 0.5;
  const arpTones = [...notes, notes[0]! + 12];
  const keep = mood === 'night' ? 0.35 + 0.35 * level : 0.55 + 0.45 * level;
  for (let i = 0; i * step < BEATS_PER_BAR; i++) {
    const beat = i * step;
    // Ölçünün başı hep çalıyor: akor duyulsun.
    if (beat !== 0 && rand() > keep) continue;
    events.push({
      layer: 'arp',
      beat,
      length: mood === 'crisis' ? 0.2 : step * 0.9,
      midi: arpTones[shape[i % shape.length]!]!,
      velocity: (beat % 1 === 0 ? 0.5 : 0.38) * (mood === 'night' ? 0.8 : 1),
    });
  }

  // Melodi: yalnız gündüz ve gece, cümlenin ikinci yarısında. Pentatonik
  // (dizinin 1, 2, 3, 5, 6. basamağı), güçlü vuruşta akor notasına yakın, adım adım.
  if (mood !== 'crisis' && inPhrase >= PHRASE_BARS / 2) {
    const chance = mood === 'night' ? 0.25 + 0.2 * level : 0.55 + 0.35 * level;
    if (rand() < chance) {
      const penta = [0, 1, 2, 4, 5];
      let position = penta.indexOf(degree % 7) >= 0 ? penta.indexOf(degree % 7) : 2;
      const count = mood === 'night' ? 1 + Math.floor(rand() * 2) : 2 + Math.floor(rand() * (2 + level * 2));
      const beats = [0, 1, 1.5, 2, 3, 3.5].slice(0, Math.max(count, 1));
      beats.forEach((beat, i) => {
        position = Math.min(penta.length * 2 - 1, Math.max(0, position + (rand() < 0.5 ? -1 : 1)));
        const deg = penta[position % penta.length]! + 7 * Math.floor(position / penta.length);
        // Bir sonraki notadan önce bitiyor; son nota ölçünün sonuna kadar.
        const until = beats[i + 1] ?? BEATS_PER_BAR;
        events.push({ layer: 'lead', beat, length: Math.min(1.5, until - beat) * 0.92, midi: scaleNote(def, deg) + 12, velocity: 0.42 });
      });
    }
  }
  return events;
}
