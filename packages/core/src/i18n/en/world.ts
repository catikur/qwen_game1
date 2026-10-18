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
  'core.npc.expandDigestTitle': 'Rivals expanding · {count} new sites this week',
  'core.npc.expandDigestBody': '{list}. Latest, {name}: {latest}',
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

  // scenario.ts, systems/scenario.ts — scenario mode (Round 39)
  'core.scenario.startTitle': 'Scenario: {title}',
  'core.scenario.rescueRaidTitle': '{name} is buying up your shares: {percent}%',
  'core.scenario.rescueRaidBody':
    'If the stake passes 50% the company is gone. Buy back your own shares or bring in investors with a share issue (stock exchange panel); a raider only goes after companies clearly smaller than itself.',
  'core.scenario.wonTitle': '{title} complete: {stars} stars',
  'core.scenario.wonBody': 'Result: {score}. The city is now open for free play; you can also replay the scenario from the start.',
  'core.scenario.lostTitle': '{title}: not this time',
  'core.scenario.lostTakeover': 'The company was taken over. The scenario can start again in the same city.',
  'core.scenario.lostTime': "Time ran out before the goal was reached. The scenario can start again in the same city; the city is also open for free play.",
  'core.scenario.scoreDays': '{days} days',
  'core.scenario.scoreLead': '×{ratio}',
  'core.scenario.progressMoney': '{value} / {target}',
  'core.scenario.progressAhead': 'ahead ×{ratio}',
  'core.scenario.progressBehind': '{percent}% of the leader',
  'core.scenario.progressVictory': '{value} / {target}',
  'core.scenario.progressVictoryRank': '{value} / {target} · ranked {rank}',
  'core.scenario.progressChain': 'share {share}%/{target}% · chain {links}/3',
  'core.scenario.progressChainCost': 'share {share}%/{target}% · chain {links}/3 · cost not below market',
  'core.scenario.progressSponsor': 'sponsor {done}/{total} · ranked {rank}',
  'core.scenario.progressSponsorOut': 'sponsor {done}/{total} · ranked {rank}: {days} days to get back into the top {max}',
  'core.scenario.outOfRankTitle': 'You fell out of the top {max}',
  'core.scenario.outOfRankBody': 'The company ranks {rank} in the city. Get back into the top {max} within {days} days or the scenario ends.',
  'core.scenario.lostRank': 'The company fell out of the top {rank} and did not get back within {days} days.',
  'core.scenario.lostProject': 'A rival took the sponsorship of the project.',

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
  'core.bubbles.parcelGone': 'A structure went up on the plot in the meantime; the discount no longer applies.',
  'core.bubbles.anchorGone': 'The building this opportunity was tied to is no longer yours; the chance is gone.',
  'core.quests.doneTitle': 'Quest complete: {title}',
  'core.quests.doneBody': 'Your reward ({amount}) is waiting on the quest board; claim it before the month ends.',
  'core.quests.none': 'There is no such quest on the board.',
  'core.quests.notDone': 'This quest is not complete yet.',
  'core.quests.claimed': 'This reward has already been claimed.',
  'core.living.seasonTitle': 'Season: {season}',
  'core.living.fadTitle': '{good} craze',
  'core.living.fadBody': 'For {days} days everyone wants {good}: stores that stock {good} take a bigger share of the category.',
  'core.living.trendUpTitle': '{category} is on the rise',
  'core.living.trendDownTitle': '{category} is slowing down',
  'core.living.trendBody': 'Analysts expect this {category} demand trend to last {days} days. The rivalry panel shows its direction and target.',
  'core.projects.none': 'There is no city project to contribute to right now.',
  'core.projects.closed': 'The contribution window is closed; the project is under construction.',
  'core.projects.tooSmall': 'The smallest contribution is {amount}.',
  'core.projects.noCash': 'This contribution needs {amount} in cash.',
  'core.projects.youLeadTitle': '{project}: you lead the contributions',
  'core.projects.youLeadBody': 'Stay ahead until the window closes and {project} will carry your name.',
  'core.projects.rivalLeadTitle': '{name} took the lead on {project}',
  'core.projects.rivalLeadBody': 'If it stays ahead until the window closes, {project} will carry its name and its stores in the district will grow stronger.',
  'core.consortium.formedTitle': 'Consortium led by {leader}: you are the target',
  'core.consortium.formedBody':
    '{members} have joined forces. Idle cash in your treasury ({share} of net worth) and investment that has stood still for {idle} days are making shareholders restless. In {days} days they start buying your shares together. Defence: go back to investing ({builds} new buildings), buy back shares or bring in investors with a share issue.',
  'core.consortium.buyingTitle': 'The consortium is buying your shares',
  'core.consortium.buyingBody':
    '{leader} and partners buy {cap} of your shares every day. If they pass half of control, the company is theirs.',
  'core.consortium.dissolvedTitle': 'Consortium dissolved',
  'core.consortium.dissolvedWorked': 'The money went to work: cash is down to {share} of net worth. The shares they gathered stay with the leader.',
  'core.consortium.dissolvedInvested': 'You went back to investing: new buildings are going up. The shares they gathered stay with the leader.',
  'core.consortium.dissolvedVictory': 'Victory: you are the city\'s number one and the partners backed off. The shares they gathered stay with the leader.',
  'core.consortium.dissolvedLead': 'You are no longer that far ahead; the partners split up. The shares they gathered stay with the leader.',
  'core.consortium.dissolvedLocked': 'Control is locked: even buying every remaining share, they cannot pass half.',
  'core.consortium.dissolvedMembers': 'A partner left the game; the consortium dissolved.',
  'core.projects.openTitle': 'City project: {project} · {district}',
  'core.projects.openBody': '{pitch} The contribution window is {days} days.',
  'core.projects.sponsorTitle': '{project}: sponsored by {sponsor}',
  'core.projects.sponsorBody': 'The biggest contribution came from {sponsor} ({amount}). The site is set up; construction takes {days} days.',
  'core.projects.citySponsorBody': 'Nobody contributed; the council funds the project alone. Construction takes {days} days.',
  'core.projects.city': 'City council',
  'core.projects.doneTitle': '{name} opened',
  'core.projects.doneBody': 'Demand in {district} and its neighbours rose for good, and land values went up.',
  'core.projects.named': '{project} · {sponsor}',
};
