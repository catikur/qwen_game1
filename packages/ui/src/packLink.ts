/*
 * Senaryo bağlantısı (Tur 67): `?paket=CF1.…`. Kurulum ekranı senaryo
 * sekmesiyle açılıyor, raf kodu ekleme kutusuna yazıyor; oyuncu bakıp
 * ekliyor. Burada yalnız adres işleri: kodu açan doğrulayıcı geç inen rafta.
 */

const PARAM = 'paket';

/** Adresteki paylaşım kodu (açılmadan; biçimi rafta denetleniyor). */
export function packLinkCode(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = new URLSearchParams(window.location.search).get(PARAM)?.trim() ?? '';
    return raw.startsWith('CF1.') ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Bağlantı yalnız sıradan bir web sayfasında anlamlı: masaüstü sürümünün
 * adresi (`tauri://`) ve gömülü görünüm başkasında açılmıyor.
 */
export function canLinkPacks(): boolean {
  if (typeof window === 'undefined') return false;
  const { protocol, hostname } = window.location;
  const embedded = typeof (window as unknown as { claude?: { use?: unknown } }).claude?.use === 'function';
  return (protocol === 'https:' || protocol === 'http:') && hostname !== 'tauri.localhost' && !embedded;
}

export function packLink(code: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set(PARAM, code);
  return url.toString();
}

/** Kod kutuya geçince adresten kalkıyor (yenilenince yeniden sormasın). */
export function clearPackLink(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(PARAM)) return;
    url.searchParams.delete(PARAM);
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    // adres değiştirilemiyor (gömülü görünüm): zararsız
  }
}
