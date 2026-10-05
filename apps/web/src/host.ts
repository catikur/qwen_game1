/**
 * Barındırıcı köprüsü.
 *
 * Oyun iki yerde çalışıyor: kendi sunucusunda (geliştirme, önizleme) ve
 * claude.ai'de yayınlanmış tek dosyalık bir sayfa olarak. İkincisinde
 * sayfa bir çerçevenin içinde ve tarayıcının sıradan indirme bağlantısı
 * ENGELLİ; dosya ancak barındırıcının `downloads` yeteneğiyle
 * verilebiliyor. Bu modül iki dünyayı tek bir arayüzün arkasına alıyor.
 *
 * Kural: yetenek var mı diye `window.claude.use(name)` sorulur, cevap
 * `null` ise özellik sessizce yokmuş gibi davranılır. Barındırıcı dışında
 * (`window.claude` hiç yokken) her şey eski yolundan çalışır.
 */

interface HostClaude {
  use(name: string): Promise<unknown>;
}

interface DownloadsNamespace {
  save(request: { filename: string; data: string | Blob }): Promise<{ status: string }>;
}

interface HostError {
  code?: string;
}

export function hostClaude(): HostClaude | null {
  const candidate = (window as unknown as { claude?: Partial<HostClaude> }).claude;
  return candidate && typeof candidate.use === 'function' ? (candidate as HostClaude) : null;
}

/** Bir yeteneğin ad alanını ister; yoksa ya da hata verirse `null`. */
export async function hostCapability<T>(name: string): Promise<T | null> {
  const claude = hostClaude();
  if (!claude) return null;
  try {
    return ((await claude.use(name)) as T | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * Dosya teslim sonucu — oyuncuya ne söyleneceğini belirleyen tek şey.
 *
 * Ayrım bilinçli olarak ince: "indirildi" yalnızca barındırıcı viewer'ın
 * kabul ettiğini doğruladığında söyleniyor. Sıradan tarayıcıda indirmenin
 * sonucunu gözlemleyemiyoruz; orada dürüst cümle "başlatıldı".
 */
export type DeliveryOutcome = 'saved' | 'started' | 'copied' | 'declined' | 'blocked';

export async function deliverTextFile(filename: string, text: string): Promise<DeliveryOutcome> {
  const claude = hostClaude();

  if (claude) {
    // Barındırıcı içindeyiz: sıradan bağlantı burada çalışmaz.
    const downloads = await hostCapability<DownloadsNamespace>('downloads');
    if (downloads) {
      try {
        const result = await downloads.save({ filename, data: text });
        return result.status === 'saved' || result.status === 'delivered' ? 'saved' : 'blocked';
      } catch (error) {
        if ((error as HostError).code === 'declined') return 'declined';
        // Diğer her ret (kullanılamaz, oran sınırı, izin yok) panoya düşer.
      }
    }
    return (await copyToClipboard(text)) ? 'copied' : 'blocked';
  }

  // Kendi sunucusunda: tarayıcının kendi indirmesi. Bağlantı nesnesi
  // tıklamadan HEMEN SONRA iptal edilmiyor — bazı tarayıcılar indirmeyi
  // bir sonraki görev döngüsünde başlatıyor ve erken iptal onu sessizce
  // düşürüyordu. Yarım dakika, en yavaş tarayıcıya da yetiyor.
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return 'started';
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
