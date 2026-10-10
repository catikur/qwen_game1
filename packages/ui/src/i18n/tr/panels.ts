/** Türkçe metinler — 'panels.' önekli anahtarlar. */
export const panels = {
  // ortak
  'panels.common.close': 'Kapat',

  // yapı menüsü (BuildPanel)
  'panels.build.ariaLabel': 'Yapı menüsü',
  'panels.build.title': 'Yatırımlar',
  'panels.build.titleWithDistrict': 'Yatırımlar · {district}',
  'panels.build.badge.noFreePlots': 'boş parsel yok',
  'panels.build.badge.freePlots': '{count} boş parsel',
  'panels.build.subtitle.district': '{district} · parsel başına getiriye göre sıralı',
  'panels.build.subtitle.noSelection': 'Bir arsa seç, tahminler o bölgeye göre hesaplansın',
  'panels.build.scarce.none': 'Bu bölgede boş parsel kalmadı — dolu bir parseli sahibinden devralman gerekiyor.',
  'panels.build.scarce.count': 'Bu bölgede {count} boş parsel kaldı.',
  'panels.build.toast.noCash': 'Nakit yetersiz — {name} {cost}',
  'panels.build.bestPick': 'bu parsel için en iyi',
  'panels.build.role.rental': ' · kira',
  'panels.build.role.logistics': ' · lojistik',
  'panels.build.role.extract': ' · hammadde',
  'panels.build.role.process': ' · işleme',
  'panels.build.zoned': ' · sanayi/liman',
  'panels.build.locked': '🔒 {netWorth} şirket değeri gerekir',
  'panels.build.placing': ' yerleştiriliyor — kendi boş arsana tıkla.',
  'panels.build.cancelPlacing': 'Vazgeç',
  'panels.build.buildOnSelected': 'Seçili arsaya inşa et',

  // yatırım kartındaki tahmin satırı (EstimateLine)
  'panels.estimate.indirectHint.logistics': 'Menzilindeki mağazalarının dağıtım maliyetini düşürür.',
  'panels.estimate.indirectHint.research': 'Bir kategoride kaliteyi yükseltir; fiyat ya da pay olarak döner.',
  'panels.estimate.indirectHint.marketing': 'Bir kategoride markayı büyütür; fiyat ya da pay olarak döner.',
  'panels.estimate.indirectHint.default': 'Dolaylı fayda.',
  'panels.estimate.where.covered': '{count} mağaza menzilde',
  'panels.estimate.where.focus': '{category} için',
  'panels.estimate.indirectTitle':
    'Bugünkü şehirde, etkisi oturduğunda. Şehir ve karşılanmayan talep büyüdükçe artar; yerleştirirken 120 günlük projeksiyona bakabilirsin.',
  'panels.estimate.indirectGain': '≈ +{gain}/gün katkı · {where} ·',
  'panels.estimate.payback': '{days} günde geri öder',
  'panels.estimate.indirectNoPayback': 'gideri karşılamıyor',
  'panels.estimate.ramp': ' · ~{days} günde oturur',
  'panels.estimate.directProfit': '≈ {profit}/gün ·',
  'panels.estimate.loss': 'zarar eder',

  // 120 günlük projeksiyon (ProjectionBox)
  'panels.projection.atDay': '{days}. günde ≈',
  'panels.projection.perDay': '{amount}/gün',
  'panels.projection.profitNote': 'kâr (katkı {gain}/gün). Rakipler hamle yapmazsa ve sen başka bir şey kurmazsan.',
  'panels.projection.failed': 'Bu parsel için projeksiyon yapılamadı.',
  'panels.projection.busy': 'Hesaplanıyor…',
  'panels.projection.run': '{days} gün sonra ne katar?',

  // arsa detayı (Inspector)
  'panels.inspector.emptyTitle': 'Arsa Detayı',
  'panels.inspector.emptyHint':
    'Haritadan bir arsa seç. Sol üstteki lenslerle nerede karşılanmamış talep olduğunu görebilirsin.',
  'panels.inspector.tileLabel': 'Arsa {x}-{y} · {archetype}',
  'panels.inspector.hqBadgeTitle': 'Şirketinin en eski binası — genel merkez',
  'panels.inspector.hqBadge': 'Genel Merkez',
  'panels.inspector.stat.population': 'Nüfus',
  'panels.inspector.stat.incomeLevel': 'Gelir seviyesi',
  'panels.inspector.stat.landValue': 'Arsa değeri',
  'panels.inspector.stat.openDemand': 'Boş talep',
  'panels.inspector.stat.development': 'Gelişme',
  'panels.inspector.demandTitle': 'Bölge talebi',
  'panels.inspector.demandUnmet': '%{percent} boş',
  'panels.inspector.ownVacant': 'Boş parselin. Soldan bir yatırım seç.',
  'panels.inspector.sellTile': 'Parseli sat ({price})',
  'panels.inspector.ownedBy': '{owner} şirketine ait',

  // sahipsiz parsel durumu (PlotActions)
  'panels.plot.road': '🚧 Sokak — satılık değil.',
  'panels.plot.civic': '🏛️ {name} — belediye malı, satılık değil.',
  'panels.plot.civicDefaultName': 'Kamu alanı',
  'panels.plot.lockedDistrict': '🌱 {district} imara kapalı — {days} gün sonra açılıyor.',
  'panels.plot.lockedHint': 'Arsa burada şimdilik ucuz. Açılış günü koşu başlar — nakdi hazır tutmakta fayda var.',
  'panels.plot.structure': '🏚️ Parselde {name} var.',
  'panels.plot.buyout': 'Sahibinden devral · {price}',
  'panels.plot.buyoutNote': 'Devralınca yapı yıkılır ve parsel senin olur. Boş parsele göre {multiplier}× fiyat ödersin.',
  'panels.plot.vacant': '✅ Boş parsel — doğrudan alınabilir.',
  'panels.plot.buy': 'Parseli satın al · {price}',
  'panels.plot.noCash': 'Nakit yetersiz.',

  // bina detayı (BuildingDetail)
  'panels.building.operatedBy': '{owner} işletiyor',
  'panels.building.ledger.upkeep': 'İşletme gideri',
  'panels.building.ledger.wages': 'Personel',
  'panels.building.ledger.dailyCost': 'Günlük gider',
  'panels.building.ledger.revenue': 'Ciro',
  'panels.building.ledger.cogs': 'Satılan malın maliyeti',
  'panels.building.ledger.dailyProfit': 'Günlük kâr',
  'panels.building.ledger.profitTrend': '30 günlük ortalama',
  'panels.building.supportNote.logistics':
    'Bu bina satış yapmaz. Karşılığı, menzilindeki mağazalarının satış maliyetinde görünür.',
  'panels.building.supportNote.focus':
    'Bu bina satış yapmaz. Karşılığı, atandığı kategorideki mağazalarının kalitesinde ve markasında görünür — Rekabet panelinde ölçebilirsin.',
  'panels.building.stat.utilization': 'Doluluk',
  'panels.building.stat.share': 'Bölge payı',
  'panels.building.stat.price': 'Fiyat',
  'panels.building.autoPrice': 'Fiyatı oyun yönetsin',
  'panels.building.priceMultiplierAria': 'Fiyat çarpanı',
  'panels.building.priceHint': 'Fiyatı düşürmek pazar payını artırır ama marjı yer. Yükseltmek tersini yapar.',
  'panels.building.demolish': "Yık (maliyetin %25'i geri döner)",

  // raf düzenleyici (ShelfEditor)
  'panels.shelf.toast.lastItem': 'Rafta en az bir ürün kalmalı. Değiştirmek için diğerine tıkla.',
  'panels.shelf.toast.removed': '{good} raftan çıktı.',
  'panels.shelf.someGood': 'Bir ürün',
  'panels.shelf.title': 'Raf',
  'panels.shelf.slots': '{used}/{slots} yuva · {district} talebi',
  'panels.shelf.hint.single':
    'Tek yuvan var: diğerine tıklarsan raf değişir, taşımadığın ürünün payı rakibe kalır.',
  'panels.shelf.hint.multi':
    'Bu bölgede talebin ne kadarını yakaladığın rafına bağlı. Taşımadığın ürünün payı rakibe kalır.',

  // odak düzenleyici (FocusEditor)
  'panels.focus.title': 'Odak',
  'panels.focus.unassigned': 'atanmamış',
  'panels.focus.arm.research': 'kalite',
  'panels.focus.arm.marketing': 'marka',
  'panels.focus.summary': '{category} · {arm} kolu',
  'panels.focus.toast.changed': '{name} artık {category} kategorisine çalışıyor.',
  'panels.focus.outletCount': '{count} mağaza',
  'panels.focus.hint.noOutlets':
    'Bu kategoride hiç mağazan yok — kol boşa çalışıyor. Mağazanın olduğu bir kategoriye ata.',
  'panels.focus.hint.default':
    'Kolun faydası mağaza sayınla çarpılır. Kategori değiştirirsen eski kategorideki birikim erimeye başlar.',

  // modal başlıkları (ModalHost)
  'panels.modal.title.chain': 'Tedarik Zinciri',
  'panels.modal.title.rivalry': 'Rekabet',
  'panels.modal.title.auction': 'Parsel İhalesi',
  'panels.modal.title.bourse': 'Borsa',
  'panels.modal.title.company': 'Şirket',
  'panels.modal.title.rivals': 'Rakipler',
  'panels.modal.title.saves': 'Kayıtlar',
  'panels.modal.title.help': 'Nasıl oynanır',
  'panels.modal.title.goals': 'Hedefler',
  'panels.modal.title.council': 'Belediye Meclisi',
  'panels.modal.title.league': 'Tohum Ligi',

  // şirket paneli (CompanyPanel, Sparkline)
  'panels.company.nameLabel': 'Şirket adı',
  'panels.company.stat.cash': 'Nakit',
  'panels.company.stat.debt': 'Borç',
  'panels.company.stat.netWorth': 'Şirket değeri',
  'panels.company.stat.dailyProfit': 'Günlük kâr',
  'panels.company.breakdownTitle': 'Sektör kırılımı',
  'panels.company.noBusinesses': 'Henüz işletmen yok.',
  'panels.company.col.sector': 'Sektör',
  'panels.company.col.outlets': 'Şube',
  'panels.company.col.revenue': 'Ciro/gün',
  'panels.company.col.profit': 'Kâr/gün',
  'panels.company.col.share': 'Pazar payı',
  'panels.company.sparklineAria': 'Şirket değeri eğrisi',
  'panels.company.sparklineCaption': 'Son {days} gün · {min} → {max}',

  // rakipler tablosu (RivalsPanel)
  'panels.rivals.col.company': 'Şirket',
  'panels.rivals.col.value': 'Değer',
  'panels.rivals.col.buildings': 'Bina',
  'panels.rivals.col.tiles': 'Arsa',
  'panels.rivals.col.strongest': 'Güçlü olduğu sektör',
  'panels.rivals.you': ' (sen)',

  // kayıtlar (SavePanel)
  'panels.saves.newGame': 'Yeni oyun',
  'panels.saves.exportJson': 'JSON dışa aktar',
  'panels.saves.manualToggle': 'Metinle aktar',
  'panels.saves.importJson': 'JSON içe aktar',
  'panels.saves.manualHint':
    'Kaydını korumak için bu metnin tamamını kopyala. Başka bir oyunu yüklemek için kendi metnini buraya yapıştır ve yükle.',
  'panels.saves.manualAria': 'Kayıt metni',
  'panels.saves.manualLoad': 'Bu metni yükle',
  'panels.saves.manualClear': 'Temizle',
  'panels.saves.autosave': 'Otomatik kayıt',
  'panels.saves.slot': 'Slot {slot}',
  'panels.saves.slotMeta': '{company} · {day}. gün · {netWorth} ·',
  'panels.saves.empty': 'boş',
  'panels.saves.save': 'Kaydet',
  'panels.saves.load': 'Yükle',

  // nasıl oynanır (HelpPanel) — gövdeler kalın başlığın hemen ardından
  // geldiği için baştaki boşluk metnin parçası.
  'panels.help.step.opportunity.title': 'Fırsat lensini aç.',
  'panels.help.step.opportunity.body': ' Kırmızıya çalan bölgelerde karşılanmamış talep var — orası para bırakır.',
  'panels.help.step.land.title': 'Bir arsa seç ve satın al.',
  'panels.help.step.land.body': ' Merkeze yakın arsalar pahalı ama daha çok müşteri görür ve zamanla değerlenir.',
  'panels.help.step.invest.title': 'Soldan bir yatırım seç.',
  'panels.help.step.invest.body':
    ' Her kartta o bölge için tahmini günlük kâr ve geri ödeme süresi yazar. Rakipler de aynı hesabı yapıyor.',
  'panels.help.step.losses.title': 'Kâr etmeyen şubeye bak.',
  'panels.help.step.losses.body':
    ' Arsa panelinde ciro, maliyet, personel ve kâr kalem kalem yazılıdır — neden kaybettiğin hep görünür.',
  'panels.help.step.pricing.title': 'Fiyatı oyuna bırak ya da devral.',
  'panels.help.step.pricing.body':
    ' Varsayılan otomatik fiyat makul oynar; fiyat savaşı açmak istersen kontrolü sen alırsın.',
  'panels.help.step.bank.title': 'Banka bir hızlandırıcı.',
  'panels.help.step.bank.body':
    ' Kredi erken büyümeyi öne çeker ama taksit ciroya bakmaz; kasa eksiye düşerse pahalı kredili hesap devreye girer, limit aşılırsa haciz gelir. Şirket panelinden.',
  'panels.help.step.workforce.title': 'Çalışanlarının sesi var.',
  'panels.help.step.workforce.body':
    ' Kalabalık şirkette sendika baskısı birikir ve zam talebi gelir: kabul et, uzlaş ya da reddet — ret grev getirebilir.',
  'panels.help.step.ipo.title': 'Halka arz bir kontrol aracı.',
  'panels.help.step.ipo.body':
    ' Yeni hisse nakit getirir ve baskıncının payını sulandırır; bedeli, şirketin büyümesinden yatırımcılara giden kalıcı pay. Borsa panelinden.',
  'panels.help.step.takeover.title': 'Devralma bir emir, tek tık değil.',
  'panels.help.step.takeover.body':
    " Rakip hissesinden günde en fazla %3,5 alabilirsin, rakipler de seninkinden öyle. Emir her gün alır; hedef %30'u görünce hisselerini toplamaya başlar ve dolaşım yetmezse emir düşer.",
  'panels.help.controls':
    'Kontroller: sürükle = kaydır · sağ tık sürükle = döndür · tekerlek = yakınlaş · WASD = kaydır · Boşluk = duraklat',
} as const;
