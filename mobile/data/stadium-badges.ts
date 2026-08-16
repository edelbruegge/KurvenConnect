import type { IconSymbolName } from '@/components/ui/icon-symbol';
import type { StadiumStats } from '@/data/stadium-stats';

// Single, central badge-rule definition (Vorgabe 17) -- every screen that shows a badge (compact
// profile section, a future full "Alle Abzeichen" overview) reads from this same array instead of
// re-declaring thresholds/copy in the UI. Badges are pure functions of the already-computed,
// server-derived StadiumStats -- there is no separate badge table and no client-writable "badge
// unlocked" flag anywhere (Vorgabe 23).
export type StadiumStatMetric = 'totalGames' | 'awayGames' | 'stadiumsVisited';

export type BadgeDefinition = {
  id: string;
  title: string;
  description: string;
  metric: StadiumStatMetric;
  threshold: number;
  icon: IconSymbolName;
};

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  { id: 'first-game', title: 'Erstes Mal dabei', description: '1 Spiel besucht', metric: 'totalGames', threshold: 1, icon: 'sportscourt.fill' },
  { id: 'stammgast', title: 'Stammgast', description: '10 Spiele besucht', metric: 'totalGames', threshold: 10, icon: 'sportscourt.fill' },
  {
    id: 'dauerkarten-mentalitaet',
    title: 'Dauerkarten-Mentalität',
    description: '50 Spiele besucht',
    metric: 'totalGames',
    threshold: 50,
    icon: 'sportscourt.fill',
  },
  { id: 'hundert-spiele', title: '100 Spiele', description: '100 Spiele besucht', metric: 'totalGames', threshold: 100, icon: 'sportscourt.fill' },

  { id: 'auswaertsfahrer', title: 'Auswärtsfahrer', description: '10 Auswärtsspiele', metric: 'awayGames', threshold: 10, icon: 'car.fill' },
  { id: 'kilometerfresser', title: 'Kilometerfresser', description: '50 Auswärtsspiele', metric: 'awayGames', threshold: 50, icon: 'car.fill' },
  // Fest definiert: Stadionkrieger = 100 Auswärtsspiele (Vorgabe 16, ausdrücklich fixiert).
  { id: 'stadionkrieger', title: 'Stadionkrieger', description: '100 Auswärtsspiele', metric: 'awayGames', threshold: 100, icon: 'shield.fill' },

  {
    id: 'groundhopper',
    title: 'Groundhopper',
    description: '10 verschiedene Stadien',
    metric: 'stadiumsVisited',
    threshold: 10,
    icon: 'mappin.and.ellipse',
  },
  {
    id: 'stadionjaeger',
    title: 'Stadionjäger',
    description: '25 verschiedene Stadien',
    metric: 'stadiumsVisited',
    threshold: 25,
    icon: 'mappin.and.ellipse',
  },
  {
    id: 'deutschlandtour',
    title: 'Deutschlandtour',
    description: '50 verschiedene Stadien',
    metric: 'stadiumsVisited',
    threshold: 50,
    icon: 'mappin.and.ellipse',
  },
];

export type BadgeProgress = {
  definition: BadgeDefinition;
  current: number;
  achieved: boolean;
  // min(current / threshold, 1) -- Vorgabe 20. Always defined, even for an achieved badge (=== 1).
  progress: number;
};

function getMetricValue(stats: StadiumStats, metric: StadiumStatMetric): number {
  if (metric === 'totalGames') return stats.totalGames;
  if (metric === 'awayGames') return stats.awayGames;
  return stats.stadiumsVisited;
}

export function getBadgeProgress(stats: StadiumStats): BadgeProgress[] {
  return BADGE_DEFINITIONS.map((definition) => {
    const current = getMetricValue(stats, definition.metric);
    return {
      definition,
      current,
      achieved: current >= definition.threshold,
      progress: Math.min(current / definition.threshold, 1),
    };
  });
}

// One entry per metric, keeping only the highest-threshold achieved badge for that metric (Vorgabe
// 22: "bei 103 Auswärtsspielen -> Stadionkrieger prominent", not Auswärtsfahrer/Kilometerfresser
// too). BADGE_DEFINITIONS is already ordered ascending by threshold per metric, so the last
// achieved entry per metric is the highest one.
export function getHighestAchievedBadgePerMetric(stats: StadiumStats): BadgeProgress[] {
  const all = getBadgeProgress(stats);
  const highestByMetric = new Map<StadiumStatMetric, BadgeProgress>();

  for (const entry of all) {
    if (!entry.achieved) continue;
    highestByMetric.set(entry.definition.metric, entry);
  }

  return Array.from(highestByMetric.values());
}

// The next not-yet-achieved badge per metric, lowest threshold first overall -- used to show "next
// up" progress (Vorgabe 19/21) without listing every remaining badge.
export function getNextAchievableBadgePerMetric(stats: StadiumStats): BadgeProgress[] {
  const all = getBadgeProgress(stats);
  const nextByMetric = new Map<StadiumStatMetric, BadgeProgress>();

  for (const entry of all) {
    if (entry.achieved) continue;
    if (!nextByMetric.has(entry.definition.metric)) {
      nextByMetric.set(entry.definition.metric, entry);
    }
  }

  return Array.from(nextByMetric.values());
}
