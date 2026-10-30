import type { world as trWorld } from '../tr/world';

/** Deutsch — core 'world' group (Tur 69). */
export const world: Record<keyof typeof trWorld, string> = {
  // league.ts — end of the league run
  'core.league.lostTitle': 'Ligapartie vorbei: Du wurdest übernommen',
  'core.league.lostBody': 'Diese Partie zählt null Punkte. Eine neue Partie beginnt von vorn in derselben Stadt.',
  'core.league.finishedTitle': 'Ligapartie vorbei: {score}',
  'core.league.finishedBody': '{days|# Tag ist|# Tage sind} um. Dein Ergebnis: {score} — teile den Partiecode oder reiche ihn bei der Bestenliste ein.',

  // scenario.ts, systems/scenario.ts — scenario mode (Round 39)
  'core.scenario.startTitle': 'Szenario: {title}',
  'core.scenario.rescueRaidTitle': '{name} kauft deine Aktien auf: {percent}\u00a0%',
  'core.scenario.rescueRaidBody':
    'Steigt der Anteil über 50\u00a0%, ist das Unternehmen weg. Kauf eigene Aktien zurück oder hol mit einer Kapitalerhöhung Investoren herein (Börsen-Panel); ein Angreifer nimmt sich nur Unternehmen vor, die deutlich kleiner sind als er selbst.',
  'core.scenario.wonTitle': '{title} geschafft: {stars|# Stern|# Sterne}',
  'core.scenario.wonBody': 'Ergebnis: {score}. Die Stadt steht jetzt fürs Freie Spiel offen; du kannst das Szenario auch von vorn spielen.',
  'core.scenario.lostTitle': '{title}: diesmal nicht',
  'core.scenario.lostTakeover': 'Das Unternehmen wurde übernommen. Das Szenario kann in derselben Stadt neu beginnen.',
  'core.scenario.lostTime': 'Die Zeit lief ab, bevor das Ziel erreicht war. Das Szenario kann in derselben Stadt neu beginnen; die Stadt steht auch fürs Freie Spiel offen.',
  'core.scenario.scoreDays': '{days|# Tag|# Tage}',
  'core.scenario.scoreLead': '×{ratio}',
  'core.scenario.progressMoney': '{value} / {target}',
  'core.scenario.progressAhead': 'vorn ×{ratio}',
  'core.scenario.progressBehind': '{percent}\u00a0% des Spitzenreiters',
  'core.scenario.progressVictory': '{value} / {target}',
  'core.scenario.progressVictoryRank': '{value} / {target} · Rang {rank}',
  'core.scenario.progressChain': 'Anteil {share}\u00a0%/{target}\u00a0% · Kette {links}/3',
  'core.scenario.progressChainCost': 'Anteil {share}\u00a0%/{target}\u00a0% · Kette {links}/3 · Kosten nicht unter Markt',
  'core.scenario.progressSponsor': 'Sponsor {done}/{total} · Rang {rank}',
  'core.scenario.progressSponsorOut': 'Sponsor {done}/{total} · Rang {rank}: {days|# Tag|# Tage}, um zurück in die Top {max} zu kommen',
  'core.scenario.outOfRankTitle': 'Du bist aus den Top {max} gefallen',
  'core.scenario.outOfRankBody': 'Das Unternehmen steht auf Rang {rank} in der Stadt. Kehr innerhalb von {days|# Tag|# Tagen} in die Top {max} zurück, sonst endet das Szenario.',
  'core.scenario.lostRank': 'Das Unternehmen fiel aus den Top {rank} und kam innerhalb von {days|# Tag|# Tagen} nicht zurück.',
  'core.scenario.lostProject': 'Ein Rivale hat sich das Sponsoring des Projekts geschnappt.',
  'core.scenario.lostCity': 'Eine der entfernten Städte der Holding ging verloren.',
  'core.scenario.progressMonopoly': 'übernommen {taken}/{total} · {left|# Rivale|# Rivalen} übrig',
  'core.scenario.progressHolding': 'Sieg in {won}/{total|# Stadt|# Städten} · diese Stadt {value} / {target}',
  'core.scenario.progressHoldingWon': 'Sieg in {won}/{total|# Stadt|# Städten} · diese Stadt ist gewonnen',
  'core.scenario.progressFreight': 'Rivalen {served}/{rivals} · belieferte Läden {outlets}/{target}',
  'core.scenario.progressPower': '{value} / {target} Strom an Rivalen verkauft',
  'core.scenario.progressTrade': '{value} / {target} Gewinn aus Handelslinien',
  'core.scenario.progressRental': '{occupied} / {target} belegte Einheiten · Erneuerung {renewals}/{renewalTarget}',
  'core.scenario.progressRentalBuilding': '{occupied} / {target} belegte Einheiten · Erneuerung {renewals}/{renewalTarget} · {building|# Einheit|# Einheiten} im Bau',
};
