import type { SaveBackend, SaveGuard, SaveMeta, SaveRecord } from '@capital/persistence';
import type { Invoke } from './bridge';

/**
 * Kayıt slotları dosyada (Tur 66): `<uygulama verisi>/saves/slot-N.json`.
 *
 * Şehir birkaç megabayt; JSON olarak yazılıp okunuyor ama komuta ham bayt
 * gidiyor (bir dizginin içinde kaçışlı JSON değil). Slotları listelemek
 * yalnız künyeleri getiriyor; Rust dosyayı kendisi ayrıştırıyor.
 *
 * Yazmadan önceki denetim (`guard`) dosyayı okuyup yazıyor: iki komut. Arada
 * yazan yok: oyun tek pencere (Tur 70), Steam Cloud da oyun açıkken
 * eşitlemiyor.
 */
export function fileSaves(invoke: Invoke): SaveBackend {
  const get = async (slot: number): Promise<SaveRecord | undefined> => {
    const bytes = await invoke<ArrayBuffer | null>('save_read', { slot });
    if (!bytes || bytes.byteLength === 0) return undefined;
    return JSON.parse(new TextDecoder().decode(bytes)) as SaveRecord;
  };
  return {
    async put(record: SaveRecord, guard?: SaveGuard) {
      // Okunamayan kayıt kurtarılamıyor: üstüne yazılıyor.
      if (guard) guard(await get(record.meta.slot).catch(() => undefined));
      await invoke('save_write', new TextEncoder().encode(JSON.stringify(record)), {
        headers: { slot: String(record.meta.slot) },
      });
    },

    get,

    list: () => invoke<SaveMeta[]>('save_list'),

    async remove(slot: number) {
      await invoke('save_remove', { slot });
    },
  };
}
