import type { SaveBackend, SaveMeta, SaveRecord } from '@capital/persistence';
import type { Invoke } from './bridge';

/**
 * Kayıt slotları dosyada (Tur 66): `<uygulama verisi>/saves/slot-N.json`.
 *
 * Şehir birkaç megabayt; JSON olarak yazılıp okunuyor ama komuta ham bayt
 * gidiyor (bir dizginin içinde kaçışlı JSON değil). Slotları listelemek
 * yalnız künyeleri getiriyor; Rust dosyayı kendisi ayrıştırıyor.
 */
export function fileSaves(invoke: Invoke): SaveBackend {
  return {
    async put(record: SaveRecord) {
      await invoke('save_write', new TextEncoder().encode(JSON.stringify(record)), {
        headers: { slot: String(record.meta.slot) },
      });
    },

    async get(slot: number) {
      const bytes = await invoke<ArrayBuffer | null>('save_read', { slot });
      if (!bytes || bytes.byteLength === 0) return undefined;
      return JSON.parse(new TextDecoder().decode(bytes)) as SaveRecord;
    },

    list: () => invoke<SaveMeta[]>('save_list'),

    async remove(slot: number) {
      await invoke('save_remove', { slot });
    },
  };
}
