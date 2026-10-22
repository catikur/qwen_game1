/**
 * Davet bağlantısı (Tur 55): `?lig=ABC234`. Kurulum ekranı Tohum Ligi'yle
 * açılıyor, lig panelinin katılma alanı kodla dolu geliyor. Katılınca
 * parametre adresten kalkıyor (sayfa yenilenince yeniden sormasın).
 */

const CODE = /^[A-Z2-9]{6}$/;

/** Adresteki davet kodu (geçerliyse). */
export function inviteCode(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = new URLSearchParams(window.location.search).get('lig');
    const code = raw?.trim().toUpperCase() ?? '';
    return CODE.test(code) ? code : null;
  } catch {
    return null;
  }
}

/** Bu sayfanın adresine kodu ekler: arkadaşın açtığında aynı oyun, davetle. */
export function inviteLink(code: string): string {
  if (typeof window === 'undefined') return `?lig=${code}`;
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('lig', code);
  return url.toString();
}

/** Katıldıktan sonra kod adresten kalkıyor. */
export function clearInvite(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('lig')) return;
    url.searchParams.delete('lig');
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    // adres değiştirilemiyor (gömülü görünüm): kod adreste kalıyor, zararsız
  }
}
