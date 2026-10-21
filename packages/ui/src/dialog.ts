import { useEffect } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Pencerenin klavye sözleşmesi (Tur 47, erişilebilirlik).
 *
 * Paneller `role="dialog"` taşıyordu ama odak dışarıda kalıyordu: açılınca
 * klavye kullanıcısı hâlâ arkadaki düğmedeydi, Tab sahneye ve üst bara
 * kaçıyordu, kapanınca odak sayfanın başına düşüyordu. Artık açılınca odak
 * pencereye giriyor, Tab ve Shift+Tab pencerenin içinde dönüyor, kapanınca
 * odak açan düğmeye geri veriliyor. Escape her pencereyi zaten kapatıyor
 * (oyun ekranında GameRoot, kurulumda NewGame).
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // Bir pencereden ötekine geçişte (Yardım → Ayarlar) eskisinin temizliği
    // bundan önce çalışıyor: React kaldırılan bileşenin etkisini yeni
    // bileşeninkinden önce kapatıyor. Odak o an eski pencereyi açan düğmeye
    // dönmüş oluyor; yeni pencere onu açan olarak alıyor.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.focus({ preventScroll: true });
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [ref]);
}
