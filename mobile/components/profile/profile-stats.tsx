import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';

export type ProfileStat = {
  label: string;
  value: number;
  onPress?: () => void;
};

type ProfileStatsProps = {
  stats: ProfileStat[];
};

export function ProfileStats({ stats }: ProfileStatsProps) {
  return (
    <View style={styles.container}>
      {stats.map((stat) =>
        stat.onPress ? (
          <Pressable
            key={stat.label}
            onPress={stat.onPress}
            style={styles.item}
            accessibilityRole="button"
            accessibilityLabel={stat.label}
          >
            <Text style={styles.value}>{stat.value}</Text>
            <Text style={styles.label}>{stat.label}</Text>
          </Pressable>
        ) : (
          <View key={stat.label} style={styles.item}>
            <Text style={styles.value}>{stat.value}</Text>
            <Text style={styles.label}>{stat.label}</Text>
          </View>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    paddingVertical: Spacing.md,
  },
  item: {
    flex: 1,
    alignItems: 'center',
  },
  value: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.title,
    fontWeight: '700',
  },
  label: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: 2,
    textAlign: 'center',
  },
});
