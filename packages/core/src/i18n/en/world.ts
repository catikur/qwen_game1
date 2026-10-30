import type { world as trWorld } from '../tr/world';

/** English — core 'world' group (Tur 23). */
export const world: Record<keyof typeof trWorld, string> = {
  // league.ts — end of the league run
  'core.league.lostTitle': 'League run over: you were taken over',
  'core.league.lostBody': 'This run scores zero. A new run starts over in the same city.',
  'core.league.finishedTitle': 'League run over: {score}',
  'core.league.finishedBody': '{days|# day is|# days are} up. Your score is {score} — share the run code or submit it to the leaderboard.',

  // scenario.ts, systems/scenario.ts — scenario mode (Round 39)
  'core.scenario.startTitle': 'Scenario: {title}',
  'core.scenario.rescueRaidTitle': '{name} is buying up your shares: {percent}%',
  'core.scenario.rescueRaidBody':
    'If the stake passes 50% the company is gone. Buy back your own shares or bring in investors with a share issue (stock exchange panel); a raider only goes after companies clearly smaller than itself.',
  'core.scenario.wonTitle': '{title} complete: {stars|# star|# stars}',
  'core.scenario.wonBody': 'Result: {score}. The city is now open for free play; you can also replay the scenario from the start.',
  'core.scenario.lostTitle': '{title}: not this time',
  'core.scenario.lostTakeover': 'The company was taken over. The scenario can start again in the same city.',
  'core.scenario.lostTime': "Time ran out before the goal was reached. The scenario can start again in the same city; the city is also open for free play.",
  'core.scenario.scoreDays': '{days|# day|# days}',
  'core.scenario.scoreLead': '×{ratio}',
  'core.scenario.progressMoney': '{value} / {target}',
  'core.scenario.progressAhead': 'ahead ×{ratio}',
  'core.scenario.progressBehind': '{percent}% of the leader',
  'core.scenario.progressVictory': '{value} / {target}',
  'core.scenario.progressVictoryRank': '{value} / {target} · ranked {rank}',
  'core.scenario.progressChain': 'share {share}%/{target}% · chain {links}/3',
  'core.scenario.progressChainCost': 'share {share}%/{target}% · chain {links}/3 · cost not below market',
  'core.scenario.progressSponsor': 'sponsor {done}/{total} · ranked {rank}',
  'core.scenario.progressSponsorOut': 'sponsor {done}/{total} · ranked {rank}: {days|# day|# days} to get back into the top {max}',
  'core.scenario.outOfRankTitle': 'You fell out of the top {max}',
  'core.scenario.outOfRankBody': 'The company ranks {rank} in the city. Get back into the top {max} within {days|# day|# days} or the scenario ends.',
  'core.scenario.lostRank': 'The company fell out of the top {rank} and did not get back within {days|# day|# days}.',
  'core.scenario.lostProject': 'A rival took the sponsorship of the project.',
  'core.scenario.lostCity': "One of the holding's remote cities was lost.",
  'core.scenario.progressMonopoly': 'taken over {taken}/{total} · {left|# rival|# rivals} left',
  'core.scenario.progressHolding': 'victory in {won}/{total|# city|# cities} · this city {value} / {target}',
  'core.scenario.progressHoldingWon': 'victory in {won}/{total|# city|# cities} · this city has won',
  'core.scenario.progressFreight': 'rivals {served}/{rivals} · stores hauled {outlets}/{target}',
  'core.scenario.progressPower': '{value} / {target} of power sold to rivals',
  'core.scenario.progressTrade': '{value} / {target} profit from trade lines',
  'core.scenario.progressRental': '{occupied} / {target} occupied units · renewal {renewals}/{renewalTarget}',
  'core.scenario.progressRentalBuilding': '{occupied} / {target} occupied units · renewal {renewals}/{renewalTarget} · {building} units under construction',
};
