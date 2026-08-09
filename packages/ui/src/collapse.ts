import { useEffect, useState } from 'react';

/** Dar ekran eşiği — `styles.css` içindeki mobil media query ile aynı. */
const NARROW = '(max-width: 860px)';

/**
 * Açılır-kapanır panellerin başlangıç durumu.
 *
 * Varsayılan CİHAZA GÖRE değişiyor ve bunun ölçülmüş bir sebebi var:
 * 390×664'lük bir ekranda yapı menüsü 292 px, lens çubuğu 104 px yer
 * kaplıyordu; ikisi birlikte ekranın %60'ı. HUD'un toplam içeriği 967 px
 * olduğu için 303 px kaydırma gerekiyordu ve haritaya kesintisiz kalan
 * pay %38'e düşüyordu.
 *
 * Geniş ekranda böyle bir sıkışıklık yok — orada paneller açık başlıyor,
 * çünkü kapalı başlamak masaüstünde bilgiyi bir dokunuş uzağa itmekten
 * başka bir şey yapmazdı.
 *
 * Kullanıcı bir kez karar verdikten sonra ekran döndürülse bile o karara
 * dokunulmuyor: `matchMedia` yalnızca BAŞLANGIÇ değerini belirliyor.
 */
export function useCollapsible(): {
  open: boolean;
  toggle: () => void;
  setOpen: (value: boolean) => void;
} {
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return true;
    return !window.matchMedia(NARROW).matches;
  });

  // Ekran gerçekten dar mı geniş mi — ilk karar tarayıcı hazır olmadan
  // verilmiş olabilir (SSR yok ama test ortamları için güvenli taraf).
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    setOpen(!window.matchMedia(NARROW).matches);
  }, []);

  return { open, toggle: () => setOpen((value) => !value), setOpen };
}
