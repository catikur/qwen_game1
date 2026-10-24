/**
 * Küçük kayıtlar dosyada (Tur 66): ayarlar, kariyer, senaryo yıldızları,
 * rehber, dil, görünüm, lig hesabı.
 *
 * Arayüz bunları açılışta `localStorage`'dan EŞZAMANLI okuyor; hepsini
 * beklenen birer dosya okumasına çevirmek her ekranı değiştirirdi. Onun
 * yerine yerel depo bir önbellek: açılışta dosyalardan dolduruluyor
 * (dosya kazanır: Steam Cloud başka bir makineden yenisini getirmiş
 * olabilir), sonra her yazma sırayla dosyaya da gidiyor.
 */
export const PROFILE_PREFIX = 'capitalforge.';

/** Kabuğun kuralıyla aynı (`store.rs` → `valid_key`): anahtar dosyanın adı. */
export function isProfileKey(key: string): boolean {
  return key.startsWith(PROFILE_PREFIX) && key.length <= 96 && !key.endsWith('.tmp') && /^[a-z0-9._-]+$/.test(key);
}

export interface ProfileSink {
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * Dosyadakileri yerel depoya yazar. Dosyada olmayıp depoda olanları döner:
 * ilk açılışta (ya da dosyası silinmiş bir anahtarda) onlar dosyaya
 * gidiyor, depo silinmiyor.
 */
export function hydrate(storage: Storage, entries: Record<string, string>): string[] {
  for (const [key, value] of Object.entries(entries)) {
    if (isProfileKey(key)) storage.setItem(key, value);
  }
  const missing: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && isProfileKey(key) && !(key in entries)) missing.push(key);
  }
  return missing;
}

export interface Mirror {
  /** Sıradaki bütün yazmalar bitince çözülür. */
  idle(): Promise<void>;
  dispose(): void;
}

/**
 * Depoya yapılan her yazmayı dosyaya da gönderir, geldiği sırayla.
 *
 * `Storage.prototype` sarılıyor: `localStorage.setItem = …` depoya
 * "setItem" adlı bir kayıt yazardı. Yalnız verilen depo (oturum deposu
 * değil) ve yalnız oyunun anahtarları.
 */
export function mirror(storage: Storage, sink: ProfileSink): Mirror {
  const proto = Object.getPrototypeOf(storage) as Storage;
  const { setItem, removeItem, clear } = proto;
  let chain: Promise<void> = Promise.resolve();
  const enqueue = (job: () => Promise<void>) => {
    chain = chain.then(job).catch((error: unknown) => console.warn('Ayar dosyası yazılamadı:', error));
  };

  proto.setItem = function (this: Storage, key: string, value: string) {
    setItem.call(this, key, value);
    if (this === storage && isProfileKey(key)) {
      const text = String(value);
      enqueue(() => sink.set(key, text));
    }
  };
  proto.removeItem = function (this: Storage, key: string) {
    removeItem.call(this, key);
    if (this === storage && isProfileKey(key)) enqueue(() => sink.remove(key));
  };
  proto.clear = function (this: Storage) {
    const keys: string[] = [];
    if (this === storage) {
      for (let i = 0; i < this.length; i++) {
        const key = this.key(i);
        if (key && isProfileKey(key)) keys.push(key);
      }
    }
    clear.call(this);
    for (const key of keys) enqueue(() => sink.remove(key));
  };

  return {
    idle: () => chain,
    dispose() {
      proto.setItem = setItem;
      proto.removeItem = removeItem;
      proto.clear = clear;
    },
  };
}
