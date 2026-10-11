/** Türkçe çekirdek metinleri — 'world' grubu (Tur 23). Anahtar biçimi: 'core.<dosya>.<ad>'. */
export const world = {
  // npc.ts — rakip hamlelerinin haberleri
  'core.npc.chainTitle': '{name} dikey entegrasyona gidiyor',
  'core.npc.chainBody': '{district} bölgesinde {building} kurdu — {good} maliyetini kendi eline alıyor.',
  'core.npc.researchTitle': '{name} kaliteye yatırıyor',
  'core.npc.marketingTitle': '{name} markasını büyütüyor',
  'core.npc.armBody': '{district} bölgesinde {building} açtı — hedefi {category} kategorisi.',
  'core.npc.pruneTitle': '{name} şube kapattı',
  'core.npc.pruneCity': 'Şehirdeki',
  'core.npc.pruneBodyKeep': '{district} {building} ayda ~{loss} zarar ediyordu. Bina yıkıldı, arsa elinde kalıyor.',
  'core.npc.pruneBodySell': '{district} {building} ayda ~{loss} zarar ediyordu. Parsel yeniden satışta.',
  'core.npc.expandTitle': '{name} genişliyor',
  'core.npc.expandCity': 'Şehirde',
  'core.npc.expandBuyoutBody': '{district} bölgesinde bir parseli devralıp {building} açtı.',
  'core.npc.expandBody': '{district} bölgesinde {building} açtı.',
  'core.npc.buybackTitle': '{name} kendi hissesini topluyor',
  'core.npc.buybackBody':
    "Payın %{percent}'a ulaştı; {name} hisselerini hazinesine çekiyor. Dolaşımda kontrole yetecek hisse kalmazsa devralma emrin düşer.",

  // issuance.ts — ihraç koşulları ve haberleri
  'core.issuance.disabled': 'Sermaye artırımı kapalı.',
  'core.issuance.noCompany': 'Şirket bulunamadı.',
  'core.issuance.minBook': 'Halka arz için şirket değeri en az {amount} olmalı.',
  'core.issuance.cooldown': 'Yeni ihraç için {days} gün bekle.',
  'core.issuance.founderFloor': "Kurucu payı %{percent}'in altına inemez.",
  'core.issuance.noPrice': 'Hisse fiyatı yok.',
  'core.issuance.minShares': 'En az {count} hisse.',
  'core.issuance.maxShares': 'Bu ihraçta en fazla {count} hisse.',
  'core.issuance.ipoDone': 'Halka arz tamamlandı',
  'core.issuance.raiseDone': 'Sermaye artırımı tamamlandı',
  'core.issuance.playerBody':
    '{shares} yeni hisse, {raised} kasaya girdi. Yatırımcıların payı %{share}; şirketin büyümesinin bu kadarı artık onların.',
  'core.issuance.rivalIpo': '{name} halka arz oldu',
  'core.issuance.rivalRaise': '{name} sermaye artırdı',
  'core.issuance.rivalBody':
    '{shares} yeni hisse kurumsal yatırımcılarda, {raised} kasaya girdi. Kontrol eşiği büyüdü: %50 için artık {control} hisse gerekiyor.',

  // goals.ts — hedef ayrıntıları, hedef ve zafer haberleri
  'core.goals.outletsDetail': '{count} / {target} mağaza',
  'core.goals.unitsDetail': '{count} / {target} üretim ünitesi',
  'core.goals.moneyDetail': '{value} / {target}',
  'core.goals.rankAhead': 'bir numarasın',
  'core.goals.rankBehind': "liderin %{percent}'i",
  'core.goals.stakeDetail': 'en büyük payın %{percent}',
  'core.goals.acquisitionsDetail': '{count} / {target} devralma',
  'core.goals.victory': 'zafer',
  'core.goals.victoryNotFirst': '{value} / {target} · henüz bir numara değilsin',
  'core.goals.completed': 'tamamlandı',
  'core.goals.doneTitle': 'Hedef tamam: {title}',
  'core.goals.doneNext': 'Sıradaki basamak: {title} — {hint}',
  'core.goals.doneLast': 'Merdivenin sonu göründü.',
  'core.goals.monopolyTitle': 'Tekel: şehirde rakip kalmadı',
  'core.goals.monopolyBody': 'Son rakip de senin oldu. Şehrin bütün ticareti tek elde.',
  'core.goals.tycoonTitle': 'Şehrin sahibi sensin',
  'core.goals.tycoonBody': '{target} hedefini aştın ve bütün rakiplerin önündesin.',

  // contracts.ts — sözleşme ret sebepleri, başlıkları ve haberleri
  'core.contracts.noOffer': 'Masada teklif yok.',
  'core.contracts.alreadyActive': 'Zaten aktif bir sözleşmen var.',
  'core.contracts.deliveredTitle': 'Sözleşme teslim edildi',
  'core.contracts.deliveredBody': '{title} — belediye {reward} ödedi.',
  'core.contracts.expiredTitle': 'Sözleşme süresi doldu',
  'core.contracts.expiredBody': '{title} teslim edilemedi. Cayma bedeli: {penalty}.',
  'core.contracts.offerTitle': 'Belediyeden sözleşme teklifi',
  'core.contracts.offerBody': '{title} — ödül {reward}, süre {days} gün. Teklif ~{lifetime} gün masada.',
  'core.contracts.buildTitle': '{district} bölgesine {count} {category} işletmesi',
  'core.contracts.shareTitle': '{category} pazarında %{percent} pay',
  'core.contracts.millions': '{value} M ₺',
  'core.contracts.thousands': '{value} B ₺',

  // indirect.ts — dolaylı bina tahmininde etkinin neden sıfır olduğu
  'core.indirect.noUncovered': 'Menzilde deposuz mağazan yok.',
  'core.indirect.noOutlets': 'Henüz mağazan yok.',
  'core.indirect.noFocus': 'Çalışacağı kategori yok.',
  'core.indirect.noSales': 'Henüz mağazan yok — çalışacağı satış yok.',
  'core.indirect.researchFull': 'Bu kategoride Ar-Ge tavanı dolu.',
  'core.indirect.marketingFull': 'Bu kategoride pazarlama tavanı dolu.',

  // entrants.ts — yeni rakip girişi
  'core.entrants.vacancyTitle': 'Şehre yeni bir şirket geliyor',
  'core.entrants.vacancyBody':
    'Boşalan pazarı gözüne kestiren bir grup {days} gün içinde şehre girecek. Boşluğu önce sen doldurabilirsin.',
  'core.entrants.entryTitle': 'Şehre yeni rakip: {name}',
  'core.entrants.entryBody':
    '{ceo} yönetiminde, {capital} sermayeyle geldi. {description} Hisseleri {lockDays} gün kurucu kilidinde.',

  // city.ts — imar takvimi
  'core.city.planTitle': 'İmar planı açıklandı: {district}',
  'core.city.planBody': '{district} bölgesi {days} gün sonra imara açılıyor. Arsa şimdilik ucuz — açılış günü koşu başlar.',
  'core.city.openedTitle': '{district} imara açıldı',
  'core.city.openedBody':
    'Yeni parseller satışta. Bölge nüfusu hızla büyüyecek — erken giren, talebi rakipsiz karşılar.',

  // league.ts — lig koşusunun sonu
  'core.league.lostTitle': 'Lig koşusu bitti: devralındın',
  'core.league.lostBody': 'Bu haftanın skoru sıfır. Yeni bir koşu aynı şehirde baştan başlar.',
  'core.league.finishedTitle': 'Lig koşusu bitti: {score}',
  'core.league.finishedBody': '{days} gün doldu. Skorun {score} — koşu kodunu paylaş ya da tabloya gönder.',

  // events.ts — olay ve dönem kapanışı
  'core.events.endedTitle': '{title} sona erdi',
  'core.events.endedBody': 'Piyasa normale dönüyor.',
  'core.events.eraClosingTitle': '{title} kapanıyor',
  'core.events.eraClosingBody': 'Yaklaşık {days} gün içinde yeni bir dönem başlayacak. Planını ona göre kur.',

  // citygrowth.ts — siluetin ilk değişimi
  'core.citygrowth.risingTitle': '{district} yükseliyor',
  'core.citygrowth.risingBody': '{district} bölgesinde ilk {structure} yükseldi. Arsa değerleri onu izleyecek.',
} as const;
