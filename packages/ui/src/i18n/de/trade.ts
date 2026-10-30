import type { trade as tr } from '../tr/trade';

/** Deutsch — 'trade.'-Schlüssel: Linien zwischen Städten (Runde 77). */
export const trade: Record<keyof typeof tr, string> = {
  'trade.lines.title': 'Linien zwischen Städten',
  'trade.lines.count': '{count} / {max} Linien',
  'trade.lines.blurb':
    'Verbinde die Frachtterminals zweier Städte mit einer Ware: Was die Ausgangsstadt nicht selbst braucht, kommt in den Bestand der anderen Stadt; deren Werke und Läden nutzen es, statt am Markt zu kaufen. Die Ausgangsstadt verkauft die Ware zum Überschusspreis; die Zielstadt bezahlt Ware und Fracht. Ein Lkw fährt {units} Einheiten am Tag und kostet für jeden Tag der Strecke {cost} am Tag; die Lkw kommen aus der Flotte des Ausgangsterminals, und auch ein leerer Lkw kostet.',
  'trade.lines.empty': 'Noch keine Linie. Eine Linie braucht in beiden Städten ein Frachtterminal.',
  'trade.lines.route': '{from} → {to}',
  'trade.lines.spec': '{trucks} Lkw · {capacity} Einheiten am Tag · {days|# Tag|# Tage} unterwegs · {cost} am Tag',
  'trade.lines.waiting': 'Die erste Fahrt startet morgen früh.',
  'trade.lines.today': 'Heute {units} Einheiten geladen: Ware {goods}, Fracht {freight}.',
  'trade.lines.shortSurplus': 'Die Ausgangsstadt hatte weniger Überschuss als Kapazität; ein Teil der Lkw fuhr leer.',
  'trade.lines.shortCash': 'Die Kasse der Zielstadt reichte nur für so viel.',
  'trade.lines.idle': 'Heute keine Ladung: In der Ausgangsstadt blieb kein Überschuss; die Lkw kosten trotzdem {freight}.',
  'trade.lines.noCash': 'Heute keine Fahrt: Die Kasse der Zielstadt reichte nicht für die Lkw ({freight}).',
  'trade.lines.onRoad': '{units} Einheiten unterwegs, {shipments|# Fahrt|# Fahrten} · {value} in der Bilanz',
  'trade.lines.noRoad': 'Nichts unterwegs.',
  'trade.lines.arrived': 'heute {units} Einheiten angekommen',
  'trade.lines.total': 'Seit der Eröffnung {units} Einheiten befördert · bezahlt {paid}',
  'trade.lines.fewer': '−1 Lkw',
  'trade.lines.more': '+1 Lkw',
  'trade.lines.close': 'Linie schließen',
  'trade.lines.closed': 'Linie geschlossen; die Ware unterwegs kommt trotzdem an.',
  'trade.lines.open.title': 'Neue Linie',
  'trade.lines.open.from': 'Von',
  'trade.lines.open.to': 'Nach',
  'trade.lines.open.good': 'Ware',
  'trade.lines.open.trucks': 'Lkw',
  'trade.lines.open.quote': 'Heute übrig in der Ausgangsstadt: {surplus} Einheiten · nicht durch eigene Produktion der Zielstadt gedeckt: {need} Einheiten',
  'trade.lines.open.terms':
    'Die Linie fährt {capacity} Einheiten am Tag · {days|# Tag|# Tage} unterwegs · {cost} am Tag · Stückpreis {price} (Überschusspreis am Start; Marktpreis am Ziel {spot})',
  'trade.lines.open.go': 'Linie eröffnen',
  'trade.lines.open.done': 'Linie eröffnet: {from} → {to}, {good}.',
  'trade.freightDesk': '{trucks|# Lkw der Flotte fährt|# Lkw der Flotte fahren} Linien zwischen Städten (Fenster „Städte“).',
};
