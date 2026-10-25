import type { markets as trMarkets } from '../tr/markets';

/** Deutsch — core 'markets' group (Tur 69). */
export const markets: Record<keyof typeof trMarkets, string> = {
  // credit.ts — bank: quote conditions, loans, rating, warning, foreclosure
  'core.credit.bankClosed': 'Bankprodukte sind deaktiviert.',
  'core.credit.companyNotFound': 'Unternehmen nicht gefunden.',
  'core.credit.invalidTerm': 'Ungültige Laufzeit.',
  'core.credit.ratingD': 'Bonität D: Die Bank vergibt keine neuen Kredite.',
  'core.credit.bondRating': 'Für Anleihen brauchst du mindestens Bonität B.',
  'core.credit.inArrears': 'Solange eine Bankmahnung läuft, gibt es keine neuen Kredite.',
  'core.credit.cooldown': 'Warte noch {days|# Tag|# Tage} bis zum nächsten Antrag.',
  'core.credit.noCollateral': 'Du hast nicht genug freie Grundstücke als Sicherheit.',
  'core.credit.bondTooSmall': 'Anleihen gibt es ab {min}; dein Unternehmen ist für diese Emission nicht groß genug.',
  'core.credit.limitFull': 'Dein Kreditlimit ist ausgeschöpft.',
  'core.credit.minAmount': 'Der Mindestbetrag ist {amount}.',
  'core.credit.maxAmount': 'Mit diesem Kredit kannst du höchstens {amount} aufnehmen.',
  'core.credit.loanNotFound': 'Kredit nicht gefunden.',
  'core.credit.repayCash': 'Für die Tilgung brauchst du {amount} Bargeld.',
  'core.credit.bondDueTitle': 'Anleihe wird fällig',
  'core.credit.bondDuePaid': 'Der Nennwert von {amount} wurde aus deinem Bargeld beglichen.',
  'core.credit.bondDueShort': 'Vom Nennwert über {amount} fehlten dir {short} an Bargeld; dieser Teil ging in den Dispokredit.',
  'core.credit.bondWarnTitle': 'Anleihe bald fällig',
  'core.credit.bondWarnBody':
    'In {days|# Tag|# Tagen} wird der Nennwert von {amount} auf einen Schlag fällig. Fehlt das Bargeld, geht die Lücke in den Dispokredit.',
  'core.credit.legacyLimitTitle': 'Kreditlimit überschritten',
  'core.credit.legacyLimitBody':
    'Deine Vermögenswerte tragen deine Schulden nicht mehr. Überleg dir, verlustreiche Gebäude zu schließen oder Grundstücke zu verkaufen.',
  'core.credit.ratingDown': 'Deine Bonität sinkt auf {rating}',
  'core.credit.ratingUp': 'Deine Bonität steigt auf {rating}',
  'core.credit.ratingBody': '{blurb} Zinsaufschlag für neue Kredite: {spread}\u00a0%.',
  'core.credit.calledTitle': 'Bank stellt deine Kredite fällig',
  'core.credit.calledRivalTitle': 'Kredite von {name} fällig gestellt',
  'core.credit.calledBody': 'Bonität D: Die Restschuld von {amount} wandert in den Dispokredit ({rate}\u00a0% pro Jahr).',
  'core.credit.arrearsTitle': 'Bank schickt eine Mahnung',
  'core.credit.arrearsBody':
    'Dispokredit {exposed}, Limit {limit}. Liegt er nicht binnen {days|# Tag|# Tagen} unter dem Limit, beginnt die Pfändung: Zuerst werden leere Grundstücke verkauft, dann verlustreiche Gebäude.',
  'core.credit.seizeTitle': 'Pfändung',
  'core.credit.seizeRivalTitle': 'Pfändung bei {name}',
  'core.credit.seizeBody':
    'Die Bank hat {sold|# Vermögenswert|# Vermögenswerte} verkauft und {proceeds} mit den Schulden verrechnet. Die Bonität bleibt {days|# Tag|# Tage} lang bei D.',
  'core.credit.rivalLoanTitle': '{name} leiht sich {amount} bei der Bank',
  'core.credit.rivalLoanBody': 'Laufzeit {days|# Tag|# Tage}, {rate}\u00a0% pro Jahr. Das Expansionsbudget ist gewachsen.',
  'core.credit.rivalLoanSecuredBody':
    'Laufzeit {days|# Tag|# Tage}, {rate}\u00a0% pro Jahr, besichert mit eigenen Grundstücken. Das Expansionsbudget ist gewachsen.',

  // council.ts — city council: motion effects, vote news, lobbying
  'core.council.defaultDistrict': 'Stadt',
  'core.council.defaultCategory': 'Einzelhandel',
  'core.council.policyDays': 'Gilt {days|# Tag|# Tage} lang.',
  'core.council.permitEffect': 'Bauen ist {days|# Tag|# Tage} lang {discount}\u00a0% günstiger.',
  'core.council.infrastructureEffect': 'Grundstücke im Viertel {district} haben {boost}\u00a0% an Wert gewonnen.',
  'core.council.alreadyOpen': 'Das Viertel ist bereits erschlossen.',
  'core.council.zoningEffect':
    'Bebauungsplan verkündet: Viertel {district} wird in {days|# Tag|# Tagen} erschlossen — an dem Tag beginnt der Ansturm auf die Grundstücke.',
  'core.council.someCompany': 'Ein Unternehmen',
  'core.council.lobbyFor': '{name} +{points} Pkt. ({spent})',
  'core.council.lobbyAgainst': '{name} −{points} Pkt. ({spent})',
  'core.council.explain': '{support}\u00a0% Zustimmung — Tendenz des Stadtrats {base}\u00a0%; {lobby}.',
  'core.council.explainNoLobby': '{support}\u00a0% Zustimmung — Tendenz des Stadtrats {base}\u00a0%; niemand hat Lobbyarbeit gemacht.',
  'core.council.expiredTitle': 'Ratsbeschluss läuft aus',
  'core.council.expiredBody': 'Ein befristeter Beschluss zu Steuern/Förderung/Genehmigungen ist ausgelaufen.',
  'core.council.passedTitle': 'Stadtrat beschließt: {title}',
  'core.council.rejectedTitle': 'Stadtrat lehnt ab: {title}',
  'core.council.sessionTitle': 'Stadtrat tritt zusammen',
  'core.council.sessionBody': 'Abstimmung in {days|# Tag|# Tagen}: {motions}. Lobbyspenden sind öffentlich.',
  'core.council.notInSession': 'Der Stadtrat tagt gerade nicht.',
  'core.council.motionNotFound': 'Dieser Antrag steht nicht auf der Tagesordnung.',
  'core.council.sideLocked': 'Du hast bei diesem Antrag schon für die Gegenseite gespendet — die Seite lässt sich nicht wechseln.',
  'core.council.unknownCompany': 'Unbekanntes Unternehmen.',
  'core.council.amountPositive': 'Die Spende muss größer als null sein.',
  'core.council.noCash': 'Für diese Spende reicht dein Bargeld nicht.',

  // auction.ts — plot auction: bidding rules, opening and closing news
  'core.auction.noAuction': 'Es läuft keine Auktion.',
  'core.auction.unknownCompany': 'Unbekanntes Unternehmen.',
  'core.auction.alreadyLeading': 'Du hast bereits das höchste Gebot.',
  'core.auction.minBid': 'Du musst mindestens {amount} ₺ bieten.',
  'core.auction.noCash': 'Nicht genug Bargeld.',
  'core.auction.inCity': 'Stadt',
  'core.auction.city': 'Stadt',
  'core.auction.structure': 'Bauwerk',
  'core.auction.aStructure': 'ein Bauwerk',
  'core.auction.noBidTitle': 'Auktion ohne Sieger',
  'core.auction.noBidRenewalBody':
    'Für das Stadterneuerungsgrundstück im Viertel {district} hat niemand den Mindestpreis geboten; das Bauwerk bleibt stehen.',
  'core.auction.noBidBody':
    'Für das Grundstück im Viertel {district} hat niemand den Mindestpreis geboten; es ist wieder regulär zu kaufen.',
  'core.auction.failedTitle': 'Auktion geplatzt',
  'core.auction.failedBody':
    'Der Höchstbietende für das Grundstück im Viertel {district} konnte nicht zahlen; es ist wieder regulär zu kaufen.',
  'core.auction.wonTitle': 'Du gewinnst die Auktion',
  'core.auction.wonRivalTitle': '{name} gewinnt die Auktion',
  'core.auction.wonBody': 'Nach {rounds|# Gebot|# Geboten} gehört dir das Grundstück im Viertel {district} für {price} ₺.',
  'core.auction.wonRivalBody':
    'Nach {rounds|# Gebot|# Geboten} wechselt das Grundstück im Viertel {district} für {price} ₺ den Besitzer.',
  'core.auction.razed': 'Die bisherige Bebauung ({structure}) wird abgerissen.',
  'core.auction.openedRenewalTitle': 'Stadt startet Auktion zur Stadterneuerung',
  'core.auction.openedTitle': 'Stadt startet Grundstücksauktion',
  'core.auction.openedRenewalBody':
    'Ein bebautes Grundstück im Viertel {district} ({structure}) wird {days|# Tag|# Tage} lang versteigert; wer gewinnt, lässt das Bauwerk abreißen und erhält das Grundstück. Mindestpreis {price} ₺.',
  'core.auction.openedBody': 'Ein Grundstück im Viertel {district} wird {days|# Tag|# Tage} lang versteigert. Mindestpreis {price} ₺.',
  'core.auction.hint': 'Dein bester Zug hier ist {building} — das bringt {profit} ₺ pro Tag.',

  // orders.ts — daily buying cap and takeover order
  'core.orders.capReached':
    'Das heutige Kauflimit ist erreicht ({cap|# Aktie|# Aktien} pro Tag). Morgen kannst du weitermachen.',
  'core.orders.capRemaining': 'Heute kannst du höchstens noch {remaining|# Aktie|# Aktien} kaufen ({cap} pro Tag).',
  'core.orders.unknownCompany': 'Unbekanntes Unternehmen.',
  'core.orders.selfOrder':
    'Für dein eigenes Unternehmen kannst du keinen Übernahmeauftrag erteilen; nutze einen Aktienrückkauf.',
  'core.orders.duplicate': 'Du hast bereits einen Auftrag für {name}.',
  'core.orders.founderLock': '{name} unterliegt der Gründersperre — die Aktien kommen in {days|# Tag|# Tagen} an den Markt.',
  'core.orders.noPrice': 'Kein Aktienkurs.',
  'core.orders.alreadyControlled': '{name} steht bereits unter deiner Kontrolle.',
  'core.orders.floatShort': '{float|# Aktie|# Aktien} im Streubesitz; für die Kontrolle braucht es {need}.',
  'core.orders.noOrder': 'Es gibt keinen aktiven Auftrag.',
  'core.orders.waitingTitle': 'Dein Auftrag für {name} wartet auf Bargeld',
  'core.orders.waitingBody':
    'Über die Betriebskosten weniger Tage hinaus hast du kein Bargeld mehr. Sobald Geld hereinkommt, läuft der Auftrag von selbst weiter.',
  'core.orders.defendedTitle': '{name} wehrt die Übernahme ab',
  'core.orders.defendedBody':
    'Im Streubesitz {float|war nur noch # Aktie|waren nur noch # Aktien}; für die Kontrolle wären {need} nötig gewesen. Der Auftrag ist geschlossen; dein Anteil von {pct}\u00a0% bringt weiter Dividende, und du kannst ihn verkaufen, wenn du willst.',

  // labor.ts — union demand, strike, wage policy
  'core.labor.strikeTitle': 'Streik beginnt',
  'core.labor.strikeBody':
    '{days|# Tag|# Tage} lang laufen deine Läden und Fabriken mit {capacity} Kapazität. Nach dem Streik wird ein Tarifvertrag mit {raise} Lohnerhöhung unterzeichnet.',
  'core.labor.rivalStrikeTitle': 'Streik bei {name}',
  'core.labor.rivalStrikeBody':
    'Die Gewerkschaft hat die Arbeit niedergelegt: Läden und Fabriken des Rivalen laufen {days|# Tag|# Tage} lang mit {capacity} Kapazität. In seinen Regalen wird es Lücken geben.',
  'core.labor.acceptedTitle': 'Tarifvertrag unterzeichnet',
  'core.labor.acceptedBody': 'Die Löhne steigen um {raise}. Der Gewerkschaftsdruck ist wieder bei null.',
  'core.labor.compromiseTitle': 'Kompromiss steht',
  'core.labor.compromiseBody': 'Die Gewerkschaft akzeptiert {offered} Lohnerhöhung (gefordert waren {raise}).',
  'core.labor.compromiseRejectedTitle': 'Gewerkschaft lehnt Kompromiss ab',
  'core.labor.compromiseRejectedBody': 'Dein Angebot von {offered} ist vom Tisch.',
  'core.labor.backedDownTitle': 'Gewerkschaft lenkt ein',
  'core.labor.backedDownBody': 'Kein Streik, aber der Druck startet bei der Hälfte neu — die Forderung kommt wieder.',
  'core.labor.demandTitle': 'Gewerkschaft fordert {raise} mehr Lohn',
  'core.labor.demandBody':
    'Antworte innerhalb von {days|# Tag|# Tagen}. Annehmen: Die Löhne steigen um {raise}. Kompromiss: Biete {offer}, mit {odds} Chance, dass er hält. Ablehnen: {strike} Streikrisiko. Keine Antwort gilt als Ablehnen.',
  'core.labor.strikeEndedTitle': 'Streik beendet',
  'core.labor.strikeEndedBody': 'Tarifvertrag mit {raise} Lohnerhöhung unterzeichnet; die Kapazität ist wieder voll.',
  'core.labor.organizingTitle': 'Gewerkschaft organisiert sich',
  'core.labor.organizingBody': 'Druck {pressure}. Ist er voll, landet eine Lohnforderung auf dem Tisch.',
  'core.labor.disabled': 'Das Personalsystem ist deaktiviert.',
  'core.labor.companyNotFound': 'Unternehmen nicht gefunden.',
  'core.labor.unknownPolicy': 'Unbekannte Lohnpolitik.',
  'core.labor.samePolicy': 'Diese Lohnpolitik gilt bereits.',
  'core.labor.policyCooldown': 'Die Lohnpolitik lässt sich in {days|# Tag|# Tagen} wieder ändern.',
  'core.labor.noDemand': 'Es liegt keine Gewerkschaftsforderung auf dem Tisch.',
  'core.labor.unknownResponse': 'Unbekannte Antwort.',

  // equity.ts — share buying/selling and takeover news
  'core.equity.unknownCompany': 'Unbekanntes Unternehmen.',
  'core.equity.invalidCount': 'Ungültige Anzahl.',
  'core.equity.founderLock': '{name} unterliegt der Gründersperre — die Aktien kommen in {days|# Tag|# Tagen} an den Markt.',
  'core.equity.floatShort': 'Am Markt {available|ist nur # Aktie|sind nur # Aktien} verfügbar.',
  'core.equity.noCash': 'Nicht genug Bargeld.',
  'core.equity.notEnoughHeld': 'Du hältst nur {held|# Aktie|# Aktien}.',
  'core.equity.playerTakenTitle': '{name} übernimmt dein Unternehmen',
  'core.equity.playerTakenBody': 'Mehr als die Hälfte deiner Aktien hat den Besitzer gewechselt. Das Imperium ist jetzt in fremder Hand.',
  'core.equity.takeoverTitle': '{acquirer} übernimmt {target}',
  'core.equity.takeoverBody':
    'Mehr als die Hälfte der Aktien von {target} hat den Besitzer gewechselt. {buildings|# Gebäude|# Gebäude} und alle Grundstücke gehen an {acquirer}; Minderheitsaktionäre wurden ausbezahlt.',
};
