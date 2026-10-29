/**
 * Masaüstünde oyun bir web sayfası gibi davranmasın (Tur 71).
 *
 * Kabuk bir web görünümü ve tarayıcının kısayolları orada da duruyor:
 * Windows'un WebView2'si F5 ve Ctrl+R ile sayfayı yeniden yüklüyor (son
 * otomatik kayıttan sonraki oyun gidiyor), Ctrl+P yazdırıyor, Ctrl+F sayfada
 * arıyor, Alt+← geri gidiyor. Sağ tık "Geri, Yeniden yükle" menüsü açıyor,
 * sürüklenen metin maviye boyanıyor (seçim, `styles.css`'te
 * `[data-shell='desktop']`). Bunlar burada kapanıyor. Yazı alanlarının kendi
 * kısayolları (kopyala, yapıştır, geri al) ve menüsü yerinde kalıyor.
 *
 * Masaüstüne ait iki tuş oyunun: F11 ve Alt+Enter tam ekran.
 */

/**
 * Cmd ile tarayıcının işi olan harfler (`KeyboardEvent.code`). macOS'ta
 * uygulama menüsünün kısayolları (Cmd+H gizle, Cmd+M küçült, Cmd+W kapat,
 * Cmd+Q çık) burada yok: sayfa tuşu yutarsa menü de çalışmıyor.
 */
const META_CHORDS = new Set([
  'KeyR', // yeniden yükle
  'KeyP', // yazdır
  'KeyF', // sayfada ara
  'KeyG', // sonrakini bul
  'KeyU', // kaynağı göster
  'KeyS', // sayfayı kaydet
  'KeyO', // dosya aç
  'Equal', // yakınlaştır
  'Minus', // uzaklaştır
  'Digit0', // yakınlığı sıfırla
  'NumpadAdd',
  'NumpadSubtract',
  'Numpad0',
]);
/** Ctrl ile (Windows ve Linux): aynıları ve WebView2'nin indirilenler, geçmiş, yeni pencere kısayolları. */
const CTRL_CHORDS = new Set([...META_CHORDS, 'KeyJ', 'KeyH', 'KeyN']);

/** Tek başına tarayıcının işi olan tuşlar: yeniden yükle, ara, imleçle gezinme, gezinti. */
const BROWSER_KEYS = new Set(['F5', 'F3', 'F7', 'BrowserBack', 'BrowserForward', 'BrowserRefresh', 'BrowserSearch']);

export type KeyVerdict = 'browser' | 'fullscreen' | null;

type KeyLike = Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>;

/**
 * Bir tuş basışı kimin: tarayıcının (yutulur), tam ekranın ya da oyunun
 * (`null`). `editable`: odak yazı alanında.
 */
export function keyVerdict(event: KeyLike, editable = false): KeyVerdict {
  // AltGr Windows'ta Ctrl+Alt olarak geliyor ve bir harf yazıyor (Almanca
  // "}" AltGr+0, Lehçe "ś" AltGr+S); tarayıcının kısayolları Alt'sız (Cursor Bugbot).
  const altGr = event.ctrlKey && event.altKey;
  if (event.code === 'F11' || (event.altKey && !altGr && (event.code === 'Enter' || event.code === 'NumpadEnter'))) return 'fullscreen';
  if (BROWSER_KEYS.has(event.code)) return 'browser';
  if (altGr) return null;
  if ((event.ctrlKey && CTRL_CHORDS.has(event.code)) || (event.metaKey && META_CHORDS.has(event.code))) return 'browser';
  // Alt + ok: geri ve ileri. Yazı alanında macOS'ta sözcük sözcük gezinme (Option + ok).
  if (!editable && event.altKey && (event.code === 'ArrowLeft' || event.code === 'ArrowRight')) return 'browser';
  return null;
}

/** Yazı alanı mı: orada sağ tık kopyala ve yapıştır menüsü. */
function editable(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || typeof element.closest !== 'function') return false;
  return element.closest('input, textarea, [contenteditable]:not([contenteditable="false"])') !== null;
}

export interface NativeOptions {
  /** Tam ekranı aç ya da kapat; kabuğun komutu. */
  toggleFullscreen: () => void;
}

/** Sayfaya bağla; bırakma işlevini döndürüyor (testler için). */
export function nativeFeel(target: Window, options: NativeOptions): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    const verdict = keyVerdict(event, editable(event.target));
    if (!verdict) return;
    event.preventDefault();
    // Oyunun kendi dinleyicileri (kamera, hız) bu tuşları görmesin; pencereye
    // bağlı olanlar da (`stopPropagation` aynı hedefin dinleyicilerini durdurmuyor).
    event.stopImmediatePropagation();
    if (verdict === 'fullscreen' && !event.repeat) options.toggleFullscreen();
  };
  const onContextMenu = (event: MouseEvent) => {
    // Yazı alanında ve seçili kodda (davet kodu, paket yolu) menü kopyalamaya yarıyor.
    if (editable(event.target) || (target.getSelection()?.toString() ?? '') !== '') return;
    event.preventDefault();
  };
  // Oyunda sürükle-bırak yok: sürüklenen görsel ya da metin pencereden dışarı taşınmasın.
  const onDragStart = (event: DragEvent) => {
    if (!editable(event.target)) event.preventDefault();
  };
  target.addEventListener('keydown', onKeyDown, { capture: true });
  target.addEventListener('contextmenu', onContextMenu, { capture: true });
  target.addEventListener('dragstart', onDragStart, { capture: true });
  return () => {
    target.removeEventListener('keydown', onKeyDown, { capture: true });
    target.removeEventListener('contextmenu', onContextMenu, { capture: true });
    target.removeEventListener('dragstart', onDragStart, { capture: true });
  };
}
