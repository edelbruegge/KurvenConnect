import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import type { Matchday } from '@/data/stadiums';

type MatchdayCardProps = {
  matchday: Matchday;
  onPress: () => void;
  onStadiumPress: () => void;
  // The stadium detail page lists its own matchdays — showing "SchücoArena · Bielefeld" as a
  // second, self-navigating tap target there would be pointless, so it can be hidden there.
  showStadiumLine?: boolean;
};

/**
 * Deliberately two sibling Pressables inside a plain View, never one nested inside the other —
 * see lib/stadium-navigation.ts's header comment. Tapping the main body opens the matchday detail;
 * tapping the "Stadionname · Stadt" line opens the stadium detail. No nested Pressables means no
 * risk of a single tap firing both navigations (an issue nested Pressables can have on web, where
 * click events bubble through the DOM).
 */
export function MatchdayCard({ matchday, onPress, onStadiumPress, showStadiumLine = true }: MatchdayCardProps) {
  const hasScore = matchday.homeScore != null && matchday.awayScore != null;

  return (
    <View style={styles.card}>
      <Pressable
        onPress={onPress}
        style={styles.cardBody}
        accessibilityRole="button"
        accessibilityLabel={`Spieltag ${matchday.homeTeam} gegen ${matchday.awayTeam} öffnen`}
      >
        <View style={styles.teamsRow}>
          <Text style={styles.teamText} numberOfLines={1}>
            {matchday.homeTeam}
          </Text>
          <Text style={styles.scoreText}>{hasScore ? `${matchday.homeScore} : ${matchday.awayScore}` : 'vs.'}</Text>
          <Text style={[styles.teamText, styles.awayTeamText]} numberOfLines={1}>
            {matchday.awayTeam}
          </Text>
        </View>

        {!hasScore ? <Text style={styles.metaText}>Ergebnis noch nicht verfügbar</Text> : null}
        {matchday.kickoffAt ? <Text style={styles.metaText}>{matchday.kickoffAt}</Text> : null}

        {matchday.attendance != null ? (
          <Text style={styles.metaText}>{matchday.attendance.toLocaleString('de-DE')} Zuschauer</Text>
        ) : null}

        <Text style={styles.contentCountText}>
          {matchday.ownContentCount} {matchday.ownContentCount === 1 ? 'eigener Beitrag' : 'eigene Beiträge'}
        </Text>
      </Pressable>

      {showStadiumLine ? (
        <Pressable
          onPress={onStadiumPress}
          style={styles.stadiumLine}
          accessibilityRole="button"
          accessibilityLabel={`${matchday.stadiumName}, ${matchday.city} öffnen`}
          hitSlop={4}
        >
          <Text style={styles.stadiumLineText}>
            {matchday.stadiumName} · {matchday.city}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  cardBody: {
    padding: Spacing.md,
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  teamText: {
    flex: 1,
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  awayTeamText: {
    textAlign: 'right',
  },
  scoreText: {
    color: ClubColors.text,
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  metaText: {
    marginTop: 4,
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  contentCountText: {
    marginTop: Spacing.xs,
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
  stadiumLine: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: FeedColors.cardBorder,
  },
  stadiumLineText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
});
