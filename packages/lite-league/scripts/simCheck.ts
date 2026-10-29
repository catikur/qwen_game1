/**
 * Canlı sunucunun simülasyonu bu depodakiyle aynı mı (Tur 71).
 *
 * Sunucu gelen koşuyu kendi simülasyonuyla yeniden oynatıyor. İzi Pages'teki
 * oyununkinden farklıysa her yeni koşu 409 `sim` alıp cihazda bekliyor;
 * haftası kapanınca da tabloya giremiyor. Tur 56–70 boyunca canlı sunucu
 * Tur 55'te kaldı ve canlı denetim "çalışıyor" dedi, çünkü hiçbir uç sürümü
 * söylemiyordu. Denetim artık sunucunun izini (`GET /v1/seed/sim`) bu
 * deponun iziyle (`SERVER_REPLAY.sim()`, sunucunun kendi işlevi)
 * karşılaştırıyor. Komut satırı `sim-check.ts`.
 */

export type SimCheck =
  | { status: 'same'; live: string }
  | { status: 'different'; live: string }
  /** Uç yok: Tur 71'den eski sunucu. */
  | { status: 'old' }
  | { status: 'unreachable'; detail: string };

export interface SimCheckOptions {
  /** Az önce dağıtıldıysa yeni sürümün yayılmasını bekle: deneme sayısı ve arası. */
  attempts?: number;
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Sunucunun izi; uç yoksa `old`, okunamazsa `unreachable`. Eski sunucu
 * tanımadığı yolu kimlik sorarak geri çeviriyor (401): uç herkese açık,
 * yeni sunucuda 401 olmuyor.
 */
async function liveSim(url: string, fetcher: typeof fetch): Promise<{ sim: string } | Extract<SimCheck, { status: 'old' | 'unreachable' }>> {
  let response: Response;
  try {
    response = await fetcher(`${url.replace(/\/+$/, '')}/v1/seed/sim`);
  } catch (error) {
    return { status: 'unreachable', detail: String(error) };
  }
  if (response.status === 401 || response.status === 404) return { status: 'old' };
  if (response.status !== 200) return { status: 'unreachable', detail: `HTTP ${response.status}` };
  const body = (await response.json().catch(() => null)) as { sim?: unknown } | null;
  return typeof body?.sim === 'string' ? { sim: body.sim } : { status: 'unreachable', detail: 'yanıtta iz yok' };
}

export async function simCheck(url: string, local: string, fetcher: typeof fetch = fetch, options: SimCheckOptions = {}): Promise<SimCheck> {
  const attempts = Math.max(1, options.attempts ?? 1);
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let result: SimCheck = { status: 'unreachable', detail: '' };
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const live = await liveSim(url, fetcher);
    result = 'sim' in live ? { status: live.sim === local ? 'same' : 'different', live: live.sim } : live;
    if (result.status === 'same') return result;
    if (attempt < attempts) await sleep(options.delayMs ?? 10_000);
  }
  return result;
}

const UPDATE = 'Sunucuyu güncelle: Actions → Lite lig sunucusu → Run workflow, ya da pnpm lite:league-bundle ile panelden (ios-lite/README.md).';

/**
 * Sonucun CI satırı ve çıkış kodu. Katı kipte (main'e birleşme, elle koşu)
 * eski sunucu hata: Pages'teki oyun o sunucuyla lige koşu gönderemiyor. PR'da
 * uyarı: PR'ın simülasyonu henüz hiçbir yerde yayında değil.
 */
export function simReport(result: SimCheck, local: string, strict: boolean): { line: string; code: number } {
  const level = strict ? '::error::' : '::warning::';
  switch (result.status) {
    case 'same':
      return { line: `Lig sunucusunun simülasyonu depodakiyle aynı (${local}).`, code: 0 };
    case 'different':
      return {
        line: `${level}Canlı sunucunun simülasyonu depodakinden farklı (canlı ${result.live}, depo ${local}): oyunun yeni koşuları 409 alıp cihazda bekliyor, haftası kapanınca tabloya giremiyor. ${UPDATE}`,
        code: strict ? 1 : 0,
      };
    case 'old':
      return {
        line: `${level}Canlı sunucu Tur 71'den eski: simülasyon izini söylemiyor, oyunun yeni koşularını büyük olasılıkla 409 ile geri çeviriyor. ${UPDATE}`,
        code: strict ? 1 : 0,
      };
    case 'unreachable':
      return { line: `::error::Lig sunucusunun simülasyon izi okunamadı: ${result.detail}`, code: 1 };
  }
}
