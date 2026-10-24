/**
 * Dosya adına giren metin (Tur 64'te şehir kartı için; Tur 65'te kaydın
 * dışa aktarması da): ASCII, Türkçe harfler eşine (Ş → S, ı → i), boşluk
 * tireye, gerisi düşüyor. Harfli ad bazı sistemlerde (yerel ayarı UTF-8
 * olmayan) indirmede "download"a dönüyordu; dosya her uygulamada aynı
 * adla gitsin. Boş kalırsa `fallback`.
 */
export function fileSlug(text: string, fallback = 'capitalforge'): string {
  const slug = text
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 _.-]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug || fallback;
}
