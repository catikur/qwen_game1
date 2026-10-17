import type { world as trWorld } from '../tr/world';

/** English — core 'world' group (Tur 23). */
export const world: Record<keyof typeof trWorld, string> = {
  // npc.ts — news about rival moves
  'core.npc.chainTitle': '{name} moves into vertical integration',
  'core.npc.chainBody': 'Built a new {building} in {district} — taking its {good} costs into its own hands.',
  'core.npc.researchTitle': '{name} invests in quality',
  'core.npc.marketingTitle': '{name} grows its brand',
  'core.npc.armBody': 'Opened a new {building} in {district}, aimed at the {category} category.',
  'core.npc.pruneTitle': '{name} closes a branch',
  'core.npc.pruneCity': 'the city',
  'core.npc.pruneBodyKeep':
    'Its {building} in {district} was losing ~{loss} a month. The building was demolished; it keeps the lot.',
  'core.npc.pruneBodySell': 'Its {building} in {district} was losing ~{loss} a month. The plot is up for sale again.',
  'core.npc.expandTitle': '{name} expands',
  'core.npc.expandCity': 'the city',
  'core.npc.expandBuyoutBody': 'Bought out a plot in {district} and opened a new {building} there.',
  'core.npc.expandBody': 'Opened a new {building} in {district}.',
  'core.npc.buybackTitle': '{name} buys back its own shares',
  'core.npc.buybackBody':
    'Your stake has reached {percent}%, so {name} is pulling its shares into its treasury. If too few shares remain in circulation to gain control, your takeover order falls through.',

  // issuance.ts — issuance conditions and news
  'core.issuance.disabled': 'Share issues are disabled.',
  'core.issuance.noCompany': 'Company not found.',
  'core.issuance.minBook': 'An IPO requires a company value of at least {amount}.',
  'core.issuance.cooldown': 'Days until the next issue: {days}.',
  'core.issuance.founderFloor': "Founder stake can't drop below {percent}%.",
  'core.issuance.noPrice': 'No share price.',
  'core.issuance.minShares': 'At least {count} shares.',
  'core.issuance.maxShares': 'At most {count} shares in this issue.',
  'core.issuance.ipoDone': 'IPO complete',
  'core.issuance.raiseDone': 'Share issue complete',
  'core.issuance.playerBody':
    "{shares} new shares issued, {raised} added to cash. Investors now hold {share}% — that much of the company's growth is theirs now.",
  'core.issuance.rivalIpo': '{name} goes public',
  'core.issuance.rivalRaise': '{name} issues new shares',
  'core.issuance.rivalBody':
    '{shares} new shares went to institutional investors, adding {raised} to its cash. The control threshold rose: 50% now takes {control} shares.',

  // goals.ts — goal details, goal and victory news
  'core.goals.outletsDetail': '{count} / {target} stores',
  'core.goals.unitsDetail': '{count} / {target} production units',
  'core.goals.moneyDetail': '{value} / {target}',
  'core.goals.rankAhead': "you're number one",
  'core.goals.rankBehind': '{percent}% of the leader',
  'core.goals.stakeDetail': 'largest stake: {percent}%',
  'core.goals.acquisitionsDetail': '{count} / {target} takeovers',
  'core.goals.victory': 'victory',
  'core.goals.victoryNotFirst': "{value} / {target} · you're not number one yet",
  'core.goals.completed': 'completed',
  'core.goals.doneTitle': 'Goal complete: {title}',
  'core.goals.doneNext': 'Next step: {title} — {hint}',
  'core.goals.doneLast': 'The top of the ladder is in sight.',
  'core.goals.monopolyTitle': 'Monopoly: no rivals left in the city',
  'core.goals.monopolyBody': "The last rival is yours too. All of the city's trade is in one hand.",
  'core.goals.tycoonTitle': 'You own the city',
  'core.goals.tycoonBody': "You've passed the {target} goal and you're ahead of every rival.",

  // contracts.ts — contract refusal reasons, titles and news
  'core.contracts.noOffer': 'No offer on the table.',
  'core.contracts.alreadyActive': 'You already have an active contract.',
  'core.contracts.deliveredTitle': 'Contract delivered',
  'core.contracts.deliveredBody': '{title} — the city paid {reward}.',
  'core.contracts.expiredTitle': 'Contract expired',
  'core.contracts.expiredBody': '{title} was not delivered. Exit penalty: {penalty}.',
  'core.contracts.offerTitle': 'Contract offer from the city',
  'core.contracts.offerBody':
    '{title} — reward {reward}, term {days} days. The offer stays on the table for ~{lifetime} days.',
  'core.contracts.buildTitle': '{count} {category} businesses in {district}',
  'core.contracts.shareTitle': '{percent}% share of the {category} market',
  'core.contracts.millions': '₺{value}M',
  'core.contracts.thousands': '₺{value}K',

  // indirect.ts — why the effect is zero in an indirect building estimate
  'core.indirect.noUncovered': 'No stores without a warehouse in range.',
  'core.indirect.noOutlets': "You don't have any stores yet.",
  'core.indirect.noFocus': 'No category for it to work on.',
  'core.indirect.noSales': "You don't have any stores yet — no sales for it to work on.",
  'core.indirect.researchFull': 'R&D cap reached for this category.',
  'core.indirect.marketingFull': 'Marketing cap reached for this category.',

  // entrants.ts — new rival entry
  'core.entrants.vacancyTitle': 'A new company is coming to the city',
  'core.entrants.vacancyBody':
    'A group eyeing the vacated market will enter the city within {days} days. You can fill the gap first.',
  'core.entrants.entryTitle': 'New rival in the city: {name}',
  'core.entrants.entryBody':
    'Arrived under {ceo} with {capital} in capital. {description} Its shares are under founder lock for {lockDays} days.',

  // city.ts — zoning schedule
  'core.city.planTitle': 'Zoning plan announced: {district}',
  'core.city.planBody':
    '{district} will be zoned for development in {days} days. Land is cheap for now — the race starts on opening day.',
  'core.city.openedTitle': '{district} is now zoned',
  'core.city.openedBody':
    "New plots are for sale. The district's population will grow fast — early movers meet demand without rivals.",

  // league.ts — end of the league run
  'core.league.lostTitle': 'League run over: you were taken over',
  'core.league.lostBody': "This week's score is zero. A new run starts over in the same city.",
  'core.league.finishedTitle': 'League run over: {score}',
  'core.league.finishedBody': '{days} days are up. Your score is {score} — share the run code or submit it to the leaderboard.',

  // events.ts — event and era endings
  'core.events.endedTitle': '{title} has ended',
  'core.events.endedBody': 'The market is returning to normal.',
  'core.events.eraClosingTitle': '{title} is drawing to a close',
  'core.events.eraClosingBody': 'A new era begins in about {days} days. Plan accordingly.',

  // citygrowth.ts — first change to the skyline
  'core.citygrowth.risingTitle': '{district} is rising',
  'core.citygrowth.risingBody': 'The first {structure} has gone up in {district}. Land values will follow.',

  // cards.ts — decision cards (Tur 37b)
  'core.cards.paid': 'Cost: {amount}.',
  'core.cards.earned': 'Income: {amount}.',
  'core.cards.expired': 'Time ran out with no decision: "{choice}" was applied.',
  'core.cards.away': 'The local manager decided: "{choice}".',
  'core.cards.disabled': 'Decision cards are turned off.',
  'core.cards.none': 'There is no decision card on the table.',
  'core.cards.unknownChoice': 'This card has no such option.',

  // rivalry.ts — rival stories (Tur 37b)
  'core.rivalry.quote': '{ceo}: “{line}”',
  'core.rivalry.crisisTitle': 'Crisis statement: {name}',
  'core.rivalry.campaignTitle': '{name} goes on the attack in {category}',
  'core.rivalry.campaignBody':
    'For {days} days they will cut {category} prices. Your share today: {share}; the campaign is judged on your share when it ends.',
  'core.rivalry.campaignHeldTitle': '{name} backs down: {category} stays yours',
  'core.rivalry.campaignHeldBody': 'The campaign backfired; your {category} share went {from} → {to}. Customer loyalty strengthened your brand.',
  'core.rivalry.campaignLostTitle': '{name} wins the {category} campaign',
  'core.rivalry.campaignLostBody': 'Your {category} share fell {from} → {to}.',
  'core.rivalry.campaignRetreatTitle': '{name} pulled out of its {category} attack',
  'core.rivalry.campaignRetreatBody': 'It closed its last store in the category; the price war is over.',
  'core.bubbles.none': 'There is no opportunity to catch in the city.',
  'core.bubbles.noCash': 'The discounted plot needs {price} in cash.',
  'core.quests.doneTitle': 'Quest complete: {title}',
  'core.quests.doneBody': 'Your reward ({amount}) is waiting on the quest board; claim it before the month ends.',
  'core.quests.none': 'There is no such quest on the board.',
  'core.quests.notDone': 'This quest is not complete yet.',
  'core.quests.claimed': 'This reward has already been claimed.',
};
