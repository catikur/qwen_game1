import type { panels as trPanels } from '../tr/panels';

/** English — 'panels.' keys (Tur 23). */
export const panels: Record<keyof typeof trPanels, string> = {
  // common
  'panels.common.close': 'Close',

  // build menu (BuildPanel)
  'panels.build.ariaLabel': 'Build menu',
  'panels.build.title': 'Investments',
  'panels.build.titleWithDistrict': 'Investments · {district}',
  'panels.build.badge.noFreePlots': 'no vacant plots',
  'panels.build.badge.freePlots': 'vacant plots: {count}',
  'panels.build.subtitle.district': '{district} · sorted by return per plot',
  'panels.build.subtitle.noSelection': 'Select a lot so the estimates are calculated for its district',
  'panels.build.scarce.none':
    "No vacant plots left in this district — you'll need to buy out an occupied plot from its owner.",
  'panels.build.scarce.count': 'Vacant plots left in this district: {count}.',
  'panels.build.toast.noCash': 'Not enough cash — {name} costs {cost}',
  'panels.build.bestPick': 'best for this plot',
  'panels.build.role.rental': ' · rental',
  'panels.build.role.logistics': ' · logistics',
  'panels.build.role.extract': ' · raw materials',
  'panels.build.role.process': ' · processing',
  'panels.build.zoned': ' · industrial/port',
  'panels.build.locked': '🔒 Requires {netWorth} company value',
  'panels.build.placing': ' — click one of your vacant lots to place it.',
  'panels.build.cancelPlacing': 'Cancel',
  'panels.build.buildOnSelected': 'Build on selected lot',

  // estimate line on the investment card (EstimateLine)
  'panels.estimate.indirectHint.logistics': 'Lowers distribution costs for your stores within its range.',
  'panels.estimate.indirectHint.research': 'Raises quality in one category; pays back as price or share.',
  'panels.estimate.indirectHint.marketing': 'Grows the brand in one category; pays back as price or share.',
  'panels.estimate.indirectHint.default': 'Indirect benefit.',
  'panels.estimate.where.covered': 'stores in range: {count}',
  'panels.estimate.where.focus': 'for {category}',
  'panels.estimate.indirectTitle':
    "In today's city, once its effect settles in. Grows as the city and unmet demand grow; while placing, you can check the 120-day projection.",
  'panels.estimate.indirectGain': '≈ +{gain}/day contribution · {where} ·',
  'panels.estimate.payback': 'pays back in {days} days',
  'panels.estimate.indirectNoPayback': "doesn't cover its costs",
  'panels.estimate.ramp': ' · settles in ~{days} days',
  'panels.estimate.directProfit': '≈ {profit}/day ·',
  'panels.estimate.loss': 'loses money',
  'panels.estimate.cannibalized': ' · takes {amount}/day from your own branches (deducted)',

  // 120-day projection (ProjectionBox)
  'panels.projection.atDay': 'On day {days} ≈',
  'panels.projection.perDay': '{amount}/day',
  'panels.projection.profitNote': "profit (contribution {gain}/day). If rivals don't move and you build nothing else.",
  'panels.projection.failed': "Couldn't run a projection for this plot.",
  'panels.projection.busy': 'Calculating…',
  'panels.projection.run': 'What will it add after {days} days?',

  // plot details (Inspector)
  'panels.inspector.emptyTitle': 'Plot Details',
  'panels.inspector.emptyHint':
    'Select a lot on the map. Use the lenses at the top left to see where demand is unmet.',
  'panels.inspector.tileLabel': 'Lot {x}-{y} · {archetype}',
  'panels.inspector.hqBadgeTitle': "Your company's oldest building — headquarters",
  'panels.inspector.hqBadge': 'Headquarters',
  'panels.inspector.stat.population': 'Population',
  'panels.inspector.stat.incomeLevel': 'Income level',
  'panels.inspector.stat.landValue': 'Land value',
  'panels.inspector.stat.openDemand': 'Unmet demand',
  'panels.inspector.stat.development': 'Development',
  'panels.inspector.demandTitle': 'District demand',
  'panels.inspector.demandUnmet': '{percent}% unmet',
  'panels.inspector.ownVacant': 'Your vacant plot. Pick an investment on the left.',
  'panels.inspector.chooseBuilding': 'What can I build here?',
  'panels.inspector.buildHere': 'Build {name}',
  'panels.inspector.sellTile': 'Sell plot ({price})',
  'panels.inspector.ownedBy': 'Owned by {owner}',

  // unowned plot state (PlotActions)
  'panels.plot.road': '🚧 Street — not for sale.',
  'panels.plot.civic': '🏛️ {name} — city property, not for sale.',
  'panels.plot.civicDefaultName': 'Public land',
  'panels.plot.lockedDistrict': '🌱 {district} is not zoned yet — opens in {days} days.',
  'panels.plot.lockedHint': 'Land is cheap here for now. The rush starts on opening day — it pays to keep cash ready.',
  'panels.plot.structure': '🏚️ On this plot: {name}.',
  'panels.plot.buyout': 'Buy out from owner · {price}',
  'panels.plot.buyoutNote':
    'Buying out demolishes the structure and the plot becomes yours. You pay {multiplier}× the price of a vacant plot.',
  'panels.plot.vacant': '✅ Vacant plot — can be bought directly.',
  'panels.plot.buy': 'Buy plot · {price}',
  'panels.plot.noCash': 'Not enough cash.',

  // building details (BuildingDetail)
  'panels.building.operatedBy': 'Operated by {owner}',
  'panels.building.ledger.upkeep': 'Upkeep',
  'panels.building.ledger.wages': 'Staff',
  'panels.building.ledger.dailyCost': 'Daily cost',
  'panels.building.ledger.revenue': 'Revenue',
  'panels.building.ledger.cogs': 'Cost of goods sold',
  'panels.building.ledger.dailyProfit': 'Daily profit',
  'panels.building.ledger.profitTrend': '30-day average',
  'panels.building.supportNote.logistics':
    "This building doesn't sell anything. Its payoff shows up in the cost of sales of your stores within its range.",
  'panels.building.supportNote.focus':
    "This building doesn't sell anything. Its payoff shows up in the quality and brand of your stores in its assigned category — you can measure it in the Competition panel.",
  'panels.building.stat.utilization': 'Utilization',
  'panels.building.stat.share': 'District share',
  'panels.building.stat.price': 'Price',
  'panels.building.autoPrice': 'Let the game set the price',
  'panels.building.priceMultiplierAria': 'Price multiplier',
  'panels.building.priceHint': 'Lowering the price grows market share but eats into margin. Raising it does the opposite.',
  'panels.building.demolish': 'Demolish (25% of the cost refunded)',

  // shelf editor (ShelfEditor)
  'panels.shelf.toast.lastItem': 'At least one product must stay on the shelf. To swap, click the other one.',
  'panels.shelf.toast.removed': '{good} was taken off the shelf.',
  'panels.shelf.someGood': 'A product',
  'panels.shelf.title': 'Shelf',
  'panels.shelf.slots': '{used}/{slots} slots · {district} demand',
  'panels.shelf.hint.single':
    "You have one slot: clicking the other product swaps the shelf, and rivals keep the share of the product you don't carry.",
  'panels.shelf.hint.multi':
    "How much of this district's demand you capture depends on your shelf. Rivals keep the share of products you don't carry.",

  // focus editor (FocusEditor)
  'panels.focus.title': 'Focus',
  'panels.focus.unassigned': 'unassigned',
  'panels.focus.arm.research': 'quality',
  'panels.focus.arm.marketing': 'brand',
  'panels.focus.summary': '{category} · {arm} lever',
  'panels.focus.toast.changed': '{name} now works on {category}.',
  'panels.focus.outletCount': 'stores: {count}',
  'panels.focus.hint.noOutlets':
    'You have no stores in this category — the lever is wasted. Assign it to a category where you have stores.',
  'panels.focus.hint.default':
    "The lever's benefit is multiplied by your store count. If you switch categories, what you built up in the old one starts to fade.",

  // modal titles (ModalHost)
  'panels.modal.title.chain': 'Supply Chain',
  'panels.modal.title.rivalry': 'Competition',
  'panels.modal.title.auction': 'Plot Auction',
  'panels.modal.title.bourse': 'Stock Market',
  'panels.modal.title.company': 'Company',
  'panels.modal.title.rivals': 'Rivals',
  'panels.modal.title.saves': 'Saves',
  'panels.modal.title.help': 'How to play',
  'panels.modal.title.goals': 'Goals',
  'panels.modal.title.council': 'City Council',
  'panels.modal.title.league': 'Seed League',
  'panels.modal.title.cities': 'Cities',

  // company panel (CompanyPanel, Sparkline)
  'panels.company.nameLabel': 'Company name',
  'panels.company.stat.cash': 'Cash',
  'panels.company.stat.debt': 'Debt',
  'panels.company.stat.netWorth': 'Company value',
  'panels.company.stat.dailyProfit': 'Daily profit',
  'panels.company.stat.overhead': 'Overhead',
  'panels.company.stat.overheadTitle': 'Past 30 buildings, each building adds 0.4% to upkeep and wages (up to 60%). A big company is expensive to run.',
  'panels.company.stat.wealthTax': 'Wealth tax/day',
  'panels.company.stat.wealthTaxTitle': 'Progressive, yearly: 1% above ₺25M, 2% above ₺100M, 3% above ₺300M. Idle cash melts away.',
  'panels.company.breakdownTitle': 'Sector breakdown',
  'panels.company.noBusinesses': 'You have no businesses yet.',
  'panels.company.col.sector': 'Sector',
  'panels.company.col.outlets': 'Stores',
  'panels.company.col.revenue': 'Revenue/day',
  'panels.company.col.profit': 'Profit/day',
  'panels.company.col.share': 'Market share',
  'panels.company.sparklineAria': 'Company value curve',
  'panels.company.sparklineCaption': 'Last {days} days · {min} → {max}',

  // rivals table (RivalsPanel)
  'panels.rivals.col.company': 'Company',
  'panels.rivals.col.value': 'Value',
  'panels.rivals.col.buildings': 'Buildings',
  'panels.rivals.col.tiles': 'Lots',
  'panels.rivals.col.strongest': 'Strongest sector',
  'panels.rivals.you': ' (you)',

  // saves (SavePanel)
  'panels.saves.newGame': 'New game',
  'panels.saves.exportJson': 'Export JSON',
  'panels.saves.manualToggle': 'Transfer as text',
  'panels.saves.importJson': 'Import JSON',
  'panels.saves.manualHint':
    'To keep your save, copy all of this text. To load another game, paste its text here and load it.',
  'panels.saves.manualAria': 'Save text',
  'panels.saves.manualLoad': 'Load this text',
  'panels.saves.manualClear': 'Clear',
  'panels.saves.autosave': 'Autosave',
  'panels.saves.slot': 'Slot {slot}',
  'panels.saves.slotMeta': '{company} · day {day} · {netWorth} ·',
  'panels.saves.empty': 'empty',
  'panels.saves.save': 'Save',
  'panels.saves.load': 'Load',

  // how to play (HelpPanel) — the bodies come right after the bold title,
  // so the leading space is part of the text.
  'panels.help.step.opportunity.title': 'Turn on the Opportunity lens.',
  'panels.help.step.opportunity.body': " Reddish districts have unmet demand — that's where the money is.",
  'panels.help.step.land.title': 'Pick a lot and buy it.',
  'panels.help.step.land.body': ' Lots near the center are expensive, but they see more customers and gain value over time.',
  'panels.help.step.invest.title': 'Pick an investment on the left.',
  'panels.help.step.invest.body':
    ' Each card shows the estimated daily profit and payback time for that district. Rivals run the same numbers.',
  'panels.help.step.losses.title': "Check the store that isn't making a profit.",
  'panels.help.step.losses.body':
    " The plot panel lists revenue, costs, staff and profit line by line — you can always see why you're losing money.",
  'panels.help.step.pricing.title': 'Leave pricing to the game, or take over.',
  'panels.help.step.pricing.body':
    ' The default auto price plays sensibly; if you want to start a price war, you take control.',
  'panels.help.step.bank.title': 'The bank is an accelerator.',
  'panels.help.step.bank.body':
    " A loan pulls growth forward, but installments don't care about revenue; if your cash goes negative, an expensive overdraft kicks in, and if you exceed the limit, foreclosure follows. In the Company panel.",
  'panels.help.step.workforce.title': 'Your employees have a voice.',
  'panels.help.step.workforce.body':
    ' In a crowded company, union pressure builds up and wage demands arrive: accept, compromise or refuse — refusing can lead to a strike.',
  'panels.help.step.ipo.title': 'An IPO is a control tool.',
  'panels.help.step.ipo.body':
    " New shares bring in cash and dilute a raider's stake; the cost is a permanent share of the company's growth going to investors. In the Stock Market panel.",
  'panels.help.step.takeover.title': 'A takeover is an order, not a single click.',
  'panels.help.step.takeover.body':
    " You can buy at most 3.5% of a rival's shares per day, and rivals can buy yours at the same pace. The order buys every day; once the target sees 30%, it starts gathering up its shares, and if there aren't enough shares in circulation, the order drops.",
  'panels.help.step.holding.title': 'Victory is a turning point: the holding.',
  'panels.help.step.holding.body':
    " Once you reach victory in a city, you can expand to a new one: your capital and half of your brand awareness come with you, and the rivals are different. One city is played at a time; the others keep living. From the Cities panel you give each remote city's local manager orders: how much of the profit flows into the holding treasury (take it all and the city runs out of cash and gets cheap), and whether to buy back shares against raids. You can send money from the treasury to any city. The goal is victory in three cities; victory in each city is measured by the value you created there.",
  'panels.help.step.late.title': 'Growing gets expensive, and crises come.',
  'panels.help.step.late.body':
    ' Past 30 buildings, each building adds a little to upkeep and wages (overhead); wealth above ₺25M is taxed progressively, so idle cash melts away. Now and then a crisis hits, announced a month ahead: in a recession demand drops but land and construction get cheaper; in a rate shock the overdraft and new loans get expensive, while term loans keep their fixed rate.',
  'panels.help.controls':
    'Controls: drag = pan · right-click drag = rotate · wheel = zoom · WASD = pan · Space = pause',
  'panels.help.language': 'Language',
  'panels.help.appearance': 'Appearance',
  'panels.help.appearance.auto': 'Auto',
  'panels.help.appearance.day': 'Day',
  'panels.help.appearance.night': 'Night',
  'panels.help.appearance.hint': 'Night glass when your device is in dark mode or when it is night in the city.',
};
