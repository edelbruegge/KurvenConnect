import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useActiveClub } from '@/context/active-club-context';
import { useGames } from '@/context/games-context';
import type { Game } from '@/data/database-games';
import { formatSeasonLabel } from '@/lib/map-supabase-game';
import { filterGamesForTeam, groupGamesByMatchday, sortByKickoffAscending, sortByKickoffDescending } from '@/lib/team-games';

type GameSelectorProps = {
  selectedGameId: string | null;
  onChange: (gameId: string | null, gameLabel: string | null) => void;
  label?: string;
};

// "Bevorstehend" -> "Nächsten" (singular-focused: shows only the one next game, not a list -- see
// "Nächsten" tab logic below). "Alle" stays the default so a user can reach a past matchday for a
// retroactive post just as easily as an upcoming one.
type GameTab = 'all' | 'next' | 'past';

function matchesSearch(game: Game, query: string): boolean {
  if (!query) return true;
  const haystack = [game.homeTeam, game.awayTeam, game.stadiumName, game.stadiumCity].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(query.toLowerCase());
}

/**
 * Shared line-by-line summary for both a list row and the "selected" card — every line is
 * conditional on the field actually being present, never a placeholder/invented value.
 */
function GameSummaryLines({ game }: { game: Game }) {
  const hasScore = game.homeScore != null && game.awayScore != null;
  const metaLine = [game.competition, game.matchday].filter(Boolean).join(' · ');
  const stadiumLine = game.stadiumName ? [game.stadiumName, game.stadiumCity].filter(Boolean).join(' · ') : undefined;

  return (
    <>
      {hasScore ? (
        <Text style={styles.rowMeta}>
          {game.homeScore} : {game.awayScore}
        </Text>
      ) : null}
      {game.kickoffAt ? <Text style={styles.rowMeta}>{game.kickoffAt}</Text> : null}
      {metaLine ? <Text style={styles.rowMeta}>{metaLine}</Text> : null}
      {stadiumLine ? <Text style={styles.rowMeta}>{stadiumLine}</Text> : null}
    </>
  );
}

/**
 * The single, shared "select a matchday" control used by every content type in the central create
 * flow (app/create-post.tsx) — never duplicated per form. Selection is always optional from this
 * component's own point of view; a caller that requires it (Treffpunkt) enforces that itself at
 * submit time, exactly as before.
 *
 * Data comes from GamesContext (public.games, now a full real season per league -- 994 rows as of
 * this step), filtered down to the currently active club (context/active-club-context.tsx,
 * matched by the stable OpenLigaDB team id via filterGamesForTeam -- lib/team-games.ts) before
 * anything else -- a normal user is never shown the entire season of every league at once, and a
 * post/trip/meetup/wanted entry's matchday picker always reflects the same club its team_id will
 * be stamped with (Vorgabe 1/42: one central club selection, not a second independent one here).
 */
export function GameSelector({ selectedGameId, onChange, label = 'Spieltag' }: GameSelectorProps) {
  const { games, getGameById } = useGames();
  const { activeTeamId, activeTeam } = useActiveClub();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<GameTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const selectedGame = selectedGameId ? getGameById(selectedGameId) : undefined;

  const clubGames = useMemo(() => filterGamesForTeam(games, activeTeamId), [games, activeTeamId]);

  const { clubUpcomingGames, clubPastGames } = useMemo(() => {
    const now = Date.now();
    const upcoming: Game[] = [];
    const past: Game[] = [];

    for (const game of clubGames) {
      const kickoffMs = game.kickoffAtIso ? new Date(game.kickoffAtIso).getTime() : null;
      if (kickoffMs != null && kickoffMs < now) {
        past.push(game);
      } else {
        upcoming.push(game);
      }
    }

    return {
      clubUpcomingGames: sortByKickoffAscending(upcoming),
      clubPastGames: sortByKickoffDescending(past),
    };
  }, [clubGames]);

  const visibleGames = useMemo(() => {
    const source = activeTab === 'all' ? clubGames : activeTab === 'next' ? clubUpcomingGames.slice(0, 1) : clubPastGames;
    return source.filter((game) => matchesSearch(game, searchQuery.trim()));
  }, [activeTab, clubGames, clubUpcomingGames, clubPastGames, searchQuery]);

  const groupedGames = useMemo(() => groupGamesByMatchday(visibleGames), [visibleGames]);

  const seasonLabel = useMemo(() => {
    const season = clubGames.find((game) => game.season)?.season;
    return season ? formatSeasonLabel(season) : undefined;
  }, [clubGames]);

  const handlePick = (game: Game) => {
    setIsPickerOpen(false);
    onChange(game.id, `${game.homeTeam} – ${game.awayTeam}`);
  };

  const handleRemove = () => {
    onChange(null, null);
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{label}</Text>

      {!selectedGame ? (
        <Pressable
          onPress={() => setIsPickerOpen((current) => !current)}
          style={styles.emptyRow}
          accessibilityRole="button"
          accessibilityLabel="Spieltag auswählen"
        >
          <Text style={styles.emptyRowText}>Kein Spiel ausgewählt</Text>
          <Text style={styles.chevron}>{isPickerOpen ? '︿' : '﹀'}</Text>
        </Pressable>
      ) : (
        <View style={styles.selectedCard}>
          <Text style={styles.selectedTeams}>
            {selectedGame.homeTeam} – {selectedGame.awayTeam}
          </Text>
          <GameSummaryLines game={selectedGame} />
          <View style={styles.selectedActions}>
            <Pressable
              onPress={() => setIsPickerOpen((current) => !current)}
              style={styles.actionButton}
              accessibilityRole="button"
              accessibilityLabel="Spieltag ändern"
            >
              <Text style={styles.actionButtonText}>Ändern</Text>
            </Pressable>
            <Pressable onPress={handleRemove} style={styles.actionButton} accessibilityRole="button" accessibilityLabel="Spieltag entfernen">
              <Text style={styles.actionButtonText}>Entfernen</Text>
            </Pressable>
          </View>
        </View>
      )}

      {isPickerOpen ? (
        !activeTeamId ? (
          <View style={styles.noClubBanner}>
            <Text style={styles.noClubText}>Wähle zuerst einen Verein aus, um Spieltage anzuzeigen.</Text>
          </View>
        ) : (
          <View style={styles.picker}>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Verein, Stadion oder Stadt suchen"
              placeholderTextColor={FeedColors.textSecondary}
              style={styles.searchInput}
            />

            <View style={styles.tabRow}>
              <Pressable
                onPress={() => setActiveTab('all')}
                style={[styles.tabButton, activeTab === 'all' && styles.tabButtonActive]}
                accessibilityRole="button"
                accessibilityLabel="Alle Spiele anzeigen"
              >
                <Text style={[styles.tabButtonText, activeTab === 'all' && styles.tabButtonTextActive]}>Alle</Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveTab('next')}
                style={[styles.tabButton, activeTab === 'next' && styles.tabButtonActive]}
                accessibilityRole="button"
                accessibilityLabel="Nächstes Spiel anzeigen"
              >
                <Text style={[styles.tabButtonText, activeTab === 'next' && styles.tabButtonTextActive]}>Nächsten</Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveTab('past')}
                style={[styles.tabButton, activeTab === 'past' && styles.tabButtonActive]}
                accessibilityRole="button"
                accessibilityLabel="Vergangene Spiele anzeigen"
              >
                <Text style={[styles.tabButtonText, activeTab === 'past' && styles.tabButtonTextActive]}>Vergangen</Text>
              </Pressable>
            </View>

            <Text style={styles.seasonLabel}>
              {activeTeam?.teamName ?? ''}
              {seasonLabel ? ` · Saison ${seasonLabel}` : ''}
            </Text>

            <ScrollView style={styles.pickerList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {visibleGames.length === 0 ? (
                <Text style={styles.emptyResultsText}>Keine Spiele gefunden.</Text>
              ) : (
                groupedGames.map((group) => (
                  <View key={group.matchday ?? '__none__'}>
                    {groupedGames.length > 1 || group.matchday ? (
                      <Text style={styles.matchdayHeading}>{group.matchday ? `Spieltag ${group.matchday}` : 'Weitere Spiele'}</Text>
                    ) : null}
                    {group.games.map((game) => (
                      <Pressable
                        key={game.id}
                        onPress={() => handlePick(game)}
                        style={[styles.pickerRow, game.id === selectedGameId && styles.pickerRowActive]}
                        accessibilityRole="button"
                        accessibilityLabel={`Spiel auswählen: ${game.homeTeam} – ${game.awayTeam}`}
                      >
                        <Text style={[styles.pickerRowTeams, game.id === selectedGameId && styles.pickerRowTextActive]}>
                          {game.homeTeam} – {game.awayTeam}
                        </Text>
                        <GameSummaryLines game={game} />
                      </Pressable>
                    ))}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  emptyRowText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
  },
  chevron: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
  },
  selectedCard: {
    borderWidth: 1,
    borderColor: ClubColors.border,
    backgroundColor: ClubColors.surface,
    borderRadius: Radii.md,
    padding: Spacing.sm,
  },
  selectedTeams: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  selectedActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  actionButton: {
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  actionButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
  rowMeta: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: 2,
  },
  noClubBanner: {
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.md,
    padding: Spacing.sm,
  },
  noClubText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    lineHeight: 20,
  },
  picker: {
    marginTop: Spacing.sm,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.md,
    color: FeedColors.textPrimary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  tabRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  tabButton: {
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  tabButtonActive: {
    backgroundColor: ClubColors.surface,
    borderColor: ClubColors.border,
  },
  tabButtonText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  tabButtonTextActive: {
    color: FeedColors.textPrimary,
    fontWeight: '600',
  },
  seasonLabel: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  matchdayHeading: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '700',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  pickerList: {
    maxHeight: 320,
  },
  emptyResultsText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    paddingVertical: Spacing.sm,
  },
  pickerRow: {
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  pickerRowActive: {
    backgroundColor: ClubColors.surface,
    borderColor: ClubColors.border,
  },
  pickerRowTeams: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  pickerRowTextActive: {
    color: FeedColors.textPrimary,
  },
});
