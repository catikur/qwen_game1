import { useEffect, useRef, useState } from 'react';

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
  /** Kullanıcı bu paneli bir kez açıp kapattı mı? */
  const touched = useRef(false);

  /*
   * Genişlik değişince varsayılan YENİDEN uygulanır — ama yalnızca
   * kullanıcı henüz karışmadıysa.
   *
   * İlk sürüm kararı yalnızca mount anında veriyordu ve bu sessiz bir
   * hataydı: masaüstü genişliğinde açılan bir sekme telefon boyutuna
   * inince açık kalıyor, tam genişlikte üç panel üst üste biniyor ve
   * biri ekranın dışına taşıyordu (ölçümde y = −122 px). Telefonda
   * gerçek karşılığı ekranı döndürmek.
   *
   * `touched` kapısı olmasa düzeltme kendi başına bir hataya dönerdi:
   * oyuncunun açtığı panel, ekran her döndüğünde kapanırdı.
   */
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia(NARROW);
    const apply = (): void => {
      if (!touched.current) setOpen(!query.matches);
    };
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  return {
    open,
    toggle: () => {
      touched.current = true;
      setOpen((value) => !value);
    },
    setOpen: (value: boolean) => {
      touched.current = true;
      setOpen(value);
    },
  };
}
