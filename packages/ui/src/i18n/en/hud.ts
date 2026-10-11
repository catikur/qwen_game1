import type { hud as trHud } from '../tr/hud';

/** English — 'hud.' keys (Tur 23). */
export const hud: Record<keyof typeof trHud, string> = {
  // Top bar — metrics
  'hud.topbar.cash': 'Cash',
  'hud.topbar.dailyProfit': 'Daily profit',
  'hud.topbar.netWorth': 'Company value',
  'hud.topbar.debt': 'Debt',
  'hud.topbar.rank': 'Rank',
  'hud.topbar.rankValue': '#{rank}',

  // Top bar — speed and sound
  'hud.speed.group': 'Game speed',
  'hud.speed.pause': 'Pause (Space)',
  'hud.speed.rate': '{speed}× speed',
  'hud.sound.unmute': 'Unmute',
  'hud.sound.mute': 'Mute',

  // Dock tabs
  'hud.dock.label': 'Panels',
  'hud.dock.chain.label': 'Chain',
  'hud.dock.chain.title': 'Supply chain',
  'hud.dock.rivalry.label': 'Competition',
  'hud.dock.rivalry.title': 'Competition card',
  'hud.dock.bourse.label': 'Market',
  'hud.dock.bourse.title': 'Stock market',
  'hud.dock.council.label': 'Council',
  'hud.dock.council.title': 'City council',
  'hud.dock.company.label': 'Company',
  'hud.dock.company.title': 'Company',
  'hud.dock.rivals.label': 'Rivals',
  'hud.dock.rivals.title': 'Rivals',
  'hud.dock.saves.label': 'Saves',
  'hud.dock.saves.title': 'Saves',
  'hud.dock.help.label': 'Help',
  'hud.dock.help.title': 'How to play',

  // Lens bar
  'hud.lens.title': 'Map: {name}',
  'hud.lens.none': 'City',

  // Game over
  'hud.gameOver.label': 'Game over',
  'hud.gameOver.title': 'The empire changed hands',
  'hud.gameOver.body': "Day {day}: {raider}{raiderCeo} bought up more than half of {player}'s shares.",
  'hud.gameOver.someRival': 'A rival',
  'hud.gameOver.raiderCeo': ' — led by {ceo} —',
  'hud.gameOver.note': "The city stays as it is; you can check its final state in the panels. The calendar won't move again.",
  'hud.gameOver.newEmpire': 'Start a new empire',

  // News feed
  'hud.news.label': 'News feed',
  'hud.news.title': 'City News',
  'hud.news.day': 'Day {day}',
  'hud.news.tone.good': 'Opportunity',
  'hud.news.tone.bad': 'Risk',
  'hud.news.tone.rival': 'Rival',
  'hud.news.tone.neutral': 'News',
  'hud.news.gotoTitle': 'Go to where it happened',
  'hud.news.goto': 'Go',

  // Contract chip
  'hud.contract.offerTitle': 'Reward {reward} · exit penalty {penalty} · {days} days',
  'hud.contract.offer': 'Offer',
  'hud.contract.accept': 'Accept',
  'hud.contract.decline': 'Pass',
  'hud.contract.activeTitle': 'Reward {reward} · exit penalty {penalty}',
  'hud.contract.active': 'Contract',

  // Agenda strip
  'hud.agenda.label': 'Agenda',
  'hud.agenda.daysShort': '{days}d',
  'hud.agenda.eventDays': '{days} days',
  'hud.agenda.raidTitle': 'Share raid — you can buy back shares on the stock market',
  'hud.agenda.raid': 'Raid',
  'hud.agenda.orderTitle': 'Takeover order — progress and cancel on the stock market',
  'hud.agenda.order': 'Takeover',
  'hud.agenda.unionTitle': 'Workforce — respond in the Company panel',
  'hud.agenda.bankTitle': 'Bank — in the Company panel',
  'hud.agenda.union': 'Union',
  'hud.agenda.bank': 'Bank',
  'hud.agenda.unlockTitle': 'Go to district',
  'hud.agenda.councilTitle': 'City council — motions and lobbying',
  'hud.agenda.leagueTitle': 'Seed League — standings and ghost',
  'hud.agenda.league': 'League',
  'hud.agenda.ghostGap': '{amount} vs ghost',
  'hud.agenda.goalTitle': 'Goal ladder',
  'hud.agenda.goal': 'Goal',
  'hud.agenda.collapse': 'Collapse',

  // Opening screen
  'hud.newGame.defaultName': 'New Venture',
  'hud.newGame.eyebrow': 'New city, new company',
  'hud.newGame.title': 'CapitalForge',
  'hud.newGame.lead':
    "Most of the city is already built. You'll find the empty plots and grow — or buy someone else's business.",
  'hud.newGame.nameLabel': 'Company name',
  'hud.newGame.namePlaceholder': 'e.g. Karaca Holding',
  'hud.newGame.ceoQuestion': 'Who runs the company?',
  'hud.ceo.strength': 'Strength',
  'hud.ceo.weakness': 'Weakness',
  'hud.newGame.modeQuestion': 'How will you play?',
  'hud.newGame.modeGroup': 'Game mode',
  'hud.newGame.modeFree': 'Free play',
  'hud.newGame.modeLeague': 'Seed League · {week}',
  'hud.newGame.leagueBlurb':
    "This week's city is the same for everyone. You play 360 days; your score is your company value on day 360. Every move is recorded — your score is verified by everyone replaying your run in their own browser.",
  'hud.newGame.leagueFactRules': 'Balanced difficulty, fixed rules',
  'hud.newGame.leagueFactGhost': 'The best run races alongside you as a "ghost"',
  'hud.newGame.difficultyQuestion': 'How ruthless is the city?',
  'hud.newGame.difficultyGroup': 'Difficulty',
  'hud.newGame.sizeQuestion': 'How big is the city?',
  'hud.newGame.sizeGroup': 'City size',
  'hud.newGame.cancel': 'Cancel',
  'hud.newGame.start': 'Found the company',

  // Goal ladder
  'hud.goals.summary':
    '{difficulty} city · {done} / {total} steps. Victory: {target} company value and the #1 spot — or take over every rival.',
  'hud.goals.completedDay': 'Day {day}',

  // Victory screen
  'hud.victory.label': 'Victory',
  'hud.victory.titleMonopoly': 'Monopoly achieved',
  'hud.victory.titleNetWorth': 'Owner of the city',
  'hud.victory.summary': 'Day {day}, {difficulty} city: {player} is worth {worth} with {buildings} buildings, {outcome}',
  'hud.victory.runnerUp': 'ahead of closest rival {rival} ({rivalWorth}).',
  'hud.victory.alone': 'alone in the city.',
  'hud.victory.note': 'If you continue, the calendar runs and the city keeps growing; the victory stays on your record.',
  'hud.victory.continue': 'Continue in free play',
  'hud.victory.newEmpire': 'Start a new empire',
  'hud.victory.openCity': 'Expand to a new city',
  'hud.gameOver.otherCity': 'Switch to {city}',
  'hud.gameOver.holdingNote': 'The holding stands: your other cities are waiting.',

  // Holding — multiple cities (Tur 22)
  'hud.holding.chipTitle': 'Holding: cities, treasury and new city',
  'hud.holding.blurb':
    "One city is played at a time; the others wait: their calendars, rivals and growth freeze. {share}% of a waiting city's daily profit trend flows into the holding treasury every day.",
  'hud.holding.stat.total': 'Holding value',
  'hud.holding.stat.treasury': 'Holding treasury',
  'hud.holding.stat.remote': 'Daily flow to treasury',
  'hud.holding.current': 'Current city',
  'hud.holding.waiting': 'Waiting',
  'hud.holding.lost': 'Lost',
  'hud.holding.cityLine': 'Day {day} · company value {worth}',
  'hud.holding.createdLine': 'value created in the city {value}',
  'hud.holding.flowLine': '{flow} a day to treasury',
  'hud.holding.switch': 'Switch to this city',
  'hud.holding.transfer.title': 'Between treasury and city',
  'hud.holding.transfer.blurb':
    "Money you transfer is added to this city's victory target: victory is measured by the value you create in the city, not the money you bring in.",
  'hud.holding.transfer.amount': 'Amount',
  'hud.holding.transfer.toCity': 'Transfer to city',
  'hud.holding.transfer.toHolding': 'Transfer to treasury',
  'hud.holding.open.title': 'New city: {name}',
  'hud.holding.open.blurb':
    "The capital comes out of this city's cash and is added to the new city's victory target. Half your brand awareness and your CEO come with you; the rival lineup is different. This city waits.",
  'hud.holding.open.size': 'City size',
  'hud.holding.open.capital': 'Capital',
  'hud.holding.open.terms': 'Brand awareness carried over {brand}% · cash left in this city {left}',
  'hud.holding.open.go': 'Found {name}',
  'hud.holding.open.done': '{name}: the holding is in a new city.',
  'hud.holding.switched': 'Switched to {name}.',
  'hud.holding.goalsCta': 'You reached victory in this city: the holding can expand to a new city.',
};
