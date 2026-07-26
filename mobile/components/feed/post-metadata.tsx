import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import type { FeedPost } from '@/data/feed-posts';

type PostMetadataProps = {
  post: FeedPost;
  variant?: 'compact' | 'detail';
};

export function PostMetadata({ post, variant = 'compact' }: PostMetadataProps) {
  if (post.category === 'Fahrt' && post.tripDetails) {
    const details = [
      { label: 'Abfahrtsort', value: post.tripDetails.departure },
      { label: 'Ziel', value: post.tripDetails.destination },
      { label: 'Abfahrtszeit', value: post.tripDetails.departureTime },
      { label: 'Freie Plätze', value: String(post.tripDetails.freeSeats) },
    ];

    return (
      <View style={[styles.container, variant === 'detail' ? styles.containerDetail : styles.containerCompact]}>
        {details.map((detail) => (
          <View key={detail.label} style={styles.item}>
            <Text style={styles.label}>{detail.label}</Text>
            <Text style={styles.value}>{detail.value}</Text>
          </View>
        ))}
      </View>
    );
  }

  if (post.category === 'Gesuch' && post.requestDetails) {
    return (
      <View style={[styles.container, variant === 'detail' ? styles.containerDetail : styles.containerCompact]}>
        <View style={styles.item}>
          <Text style={styles.label}>Gesuchte Leistung</Text>
          <Text style={styles.value}>{post.requestDetails.requestedService}</Text>
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: FeedColors.imagePlaceholder,
    borderRadius: Radii.md,
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  containerCompact: {
    marginBottom: Spacing.sm,
  },
  containerDetail: {
    marginTop: Spacing.sm,
  },
  item: {
    gap: 2,
  },
  label: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  value: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
});
