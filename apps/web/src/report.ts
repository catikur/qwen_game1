import { AUTOSAVE_SLOT, exportToJson, loadGame } from '@capital/persistence';
import type { GameState } from '@capital/core';
import { setReportHost } from '@capital/ui';
import { deliverTextFile } from './host';

/*
 * Hata raporunun kabuğu (Tur 74). Arayüzün rapor sayfası dosya kaydetmeyi
 * ve kayıt okumayı bilmiyor; burası veriyor. Dosya her teslim yolundan
 * gidiyor (tarayıcıda indirme, masaüstünde İndirilenler klasörü). Kayıt:
 * oyun açıksa o anki durum, değilse son otomatik kayıt. Rapor hiçbir yere
 * gönderilmiyor; oyuncu dosyayı kendisi yolluyor.
 */
let live: (() => GameState) | null = null;

/** Oyun ekranı açılınca o anki durumu verir, kapanınca bırakır (`GameRoot.tsx`). */
export function setLiveGame(next: (() => GameState) | null): void {
  live = next;
}

export function initReport(): void {
  setReportHost({
    deliver: (filename, text) => deliverTextFile(filename, text),
    save: async () => {
      if (live) return exportToJson(live());
      const loaded = await loadGame(AUTOSAVE_SLOT);
      return loaded.ok ? exportToJson(loaded.state) : null;
    },
  });
}
