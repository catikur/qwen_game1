import type { trade as tr } from '../tr/trade';

/** English — 'trade.' keys: lines between cities (Turn 77). */
export const trade: Record<keyof typeof tr, string> = {
  'trade.lines.title': 'Lines between cities',
  'trade.lines.count': '{count} / {max} lines',
  'trade.lines.blurb':
    "Connect two cities' freight terminals with one good: whatever the origin city doesn't need goes into the other city's pool, where plants and stores use it instead of buying from the market. The origin sells the goods at its surplus price; the destination pays for the goods and the freight. A truck carries {units} units a day and costs {cost} a day for every day of the route; trucks come from the origin terminal's fleet, and an empty truck costs the same.",
  'trade.lines.empty': 'No lines yet. A line needs a freight terminal in both cities.',
  'trade.lines.route': '{from} → {to}',
  'trade.lines.spec': '{trucks|# truck|# trucks} · {capacity} units a day · {days|# day|# days} on the road · {cost} a day',
  'trade.lines.waiting': 'The first shipment leaves tomorrow morning.',
  'trade.lines.today': 'Loaded {units} units today: goods {goods}, freight {freight}.',
  'trade.lines.shortSurplus': 'The origin had less surplus than capacity; some trucks ran empty.',
  'trade.lines.shortCash': "The destination's cash only covered this much.",
  'trade.lines.idle': 'No load today: the origin city had no surplus left; the trucks still cost {freight}.',
  'trade.lines.noCash': "No shipment today: the destination's cash didn't cover the trucks ({freight}).",
  'trade.lines.onRoad': '{units} units on the road, {shipments|# shipment|# shipments} · {value} on the balance sheet',
  'trade.lines.noRoad': 'Nothing on the road.',
  'trade.lines.arrived': '{units} units arrived today',
  'trade.lines.total': '{units} units carried since it opened · paid {paid}',
  'trade.lines.fewer': '−1 truck',
  'trade.lines.more': '+1 truck',
  'trade.lines.close': 'Close line',
  'trade.lines.closed': 'Line closed; the goods on the road still arrive.',
  'trade.lines.open.title': 'New line',
  'trade.lines.open.from': 'From',
  'trade.lines.open.to': 'To',
  'trade.lines.open.good': 'Good',
  'trade.lines.open.trucks': 'Trucks',
  'trade.lines.open.quote': "Left over at the origin today: {surplus} units · not covered by the destination's own production: {need} units",
  'trade.lines.open.terms':
    'The line carries {capacity} units a day · {days|# day|# days} on the road · {cost} a day · unit price {price} (the origin surplus price; market at the destination {spot})',
  'trade.lines.open.go': 'Open line',
  'trade.lines.open.done': 'Line opened: {from} → {to}, {good}.',
  'trade.freightDesk': '{trucks|# truck|# trucks} of the fleet run lines between cities (Cities panel).',
};
