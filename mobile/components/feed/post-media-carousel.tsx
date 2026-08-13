import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { ClubColors, FeedColors, Radii, Spacing } from '@/constants/theme';
import type { PostMediaItem } from '@/data/feed-posts';

type PostMediaCarouselProps = {
  media: PostMediaItem[];
  // Feed and Post Detail want different sizes -- this is the one configurable knob (see the
  // report for why a single per-post height, not a per-image one, was chosen).
  maxHeight: number;
};

const FALLBACK_ASPECT_RATIO = 1; // Used only when no image in the post reports real dimensions.
const MIN_HEIGHT = 160;
const WEB_SCROLL_SETTLE_MS = 120;

/**
 * Shared media display for 'Beitrag' posts, used identically by FeedPostCard and
 * app/post/[id].tsx (no duplicated carousel logic). Always shows the complete image
 * (contentFit="contain", never cropped) at a width measured from the actual rendered container
 * (onLayout), never a hardcoded/screen-wide value.
 *
 * 2-4 images page one-at-a-time via a plain horizontal ScrollView (no FlatList -- with at most 4
 * images, virtualization has no benefit and only adds a layer that made the nested-scroll conflict
 * with the outer vertical feed harder to reason about). A single image renders directly with no
 * ScrollView/paging machinery, so it never competes with the outer feed's own vertical gesture at
 * all.
 */
export function PostMediaCarousel({ media, maxHeight }: PostMediaCarouselProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const webSettleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    // Only ever updates state when the measured width actually changed -- not on every render.
    setContainerWidth((current) => (Math.abs(current - width) > 1 ? width : current));
  };

  // One fixed height for the whole carousel (not recomputed per slide): swiping between images of
  // different formats would otherwise resize the card mid-gesture. Derived from the first image
  // that actually reports real dimensions; contain-fit still shows every other image in full
  // regardless of its own ratio, just with more/less letterboxing.
  const aspectRatio = useMemo(() => {
    const reference = media.find((item) => item.width && item.height && item.width > 0 && item.height > 0);
    return reference && reference.width && reference.height ? reference.width / reference.height : FALLBACK_ASPECT_RATIO;
  }, [media]);

  const mediaHeight =
    containerWidth > 0 ? Math.min(maxHeight, Math.max(MIN_HEIGHT, Math.round(containerWidth / aspectRatio))) : maxHeight;

  // Keeps the currently visible image in place across width changes (web window resize, device
  // rotation) instead of leaving the scroll offset pointing at a now-wrong fraction of a page.
  // Only depends on containerWidth: scrollTo() changes content *offset*, not the wrapper's own
  // measured *size*, so this can never re-trigger handleLayout / loop back into itself.
  useEffect(() => {
    if (containerWidth > 0 && media.length > 1) {
      scrollRef.current?.scrollTo({ x: currentIndex * containerWidth, animated: false });
    }
    // Only re-sync on width changes -- re-running this on every currentIndex change would fight
    // the user's own in-progress swipe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerWidth]);

  useEffect(
    () => () => {
      if (webSettleTimeoutRef.current) {
        clearTimeout(webSettleTimeoutRef.current);
      }
    },
    [],
  );

  const commitIndexFromOffset = (offsetX: number) => {
    if (containerWidth <= 0) return;
    const rawIndex = Math.round(offsetX / containerWidth);
    const clamped = Math.max(0, Math.min(media.length - 1, rawIndex));
    setCurrentIndex((current) => (clamped === current ? current : clamped));
  };

  // Primary signal, exactly once per swipe (never per scroll frame): fires after native paging
  // has fully settled. Reliable on iOS/Android for real touch gestures, and on web for most
  // pointer-driven scrolling too.
  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    commitIndexFromOffset(event.nativeEvent.contentOffset.x);
  };

  // Supplementary web-only fallback. react-native-web's onMomentumScrollEnd is derived from
  // touch-gesture tracking and does not reliably fire for mouse-drag/trackpad/scrollbar input on
  // desktop web (verified in the previous round -- the dot indicator silently stopped updating
  // for exactly that input class). This does NOT set state on every scroll tick: each event only
  // (re)arms a single timer, and the index is committed once, ~120ms after motion actually stops
  // -- i.e. a debounced "settled" signal, not a live per-pixel tracker. Native platforms skip this
  // path entirely since onMomentumScrollEnd already covers them.
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Platform.OS !== 'web') return;
    const offsetX = event.nativeEvent.contentOffset.x;
    if (webSettleTimeoutRef.current) {
      clearTimeout(webSettleTimeoutRef.current);
    }
    webSettleTimeoutRef.current = setTimeout(() => commitIndexFromOffset(offsetX), WEB_SCROLL_SETTLE_MS);
  };

  if (media.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrapper} onLayout={handleLayout}>
      {media.length === 1 ? (
        <Image
          source={{ uri: media[0].url }}
          style={[styles.image, { width: containerWidth || undefined, height: mediaHeight }]}
          contentFit="contain"
        />
      ) : (
        <>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            // iOS: locks the gesture to whichever axis is detected first, so a swipe that starts
            // on the image but is actually vertical is released to the outer (vertical) feed
            // scroll instead of being captured horizontally.
            directionalLockEnabled
            // Android: lets this horizontal ScrollView and the outer vertical one cooperate via
            // Android's native nested-scrolling protocol instead of one unconditionally winning
            // every touch that starts on an image.
            nestedScrollEnabled
            // Caps a fast fling to at most one page forward/back instead of letting velocity
            // carry it across multiple images at once.
            disableIntervalMomentum
            onMomentumScrollEnd={handleMomentumScrollEnd}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >
            {media.map((item) => (
              <View key={item.id} style={{ width: containerWidth, height: mediaHeight }}>
                <Image source={{ uri: item.url }} style={styles.image} contentFit="contain" />
              </View>
            ))}
          </ScrollView>
          <View style={styles.dotsRow}>
            {media.map((item, index) => (
              <View key={item.id} style={[styles.dot, index === currentIndex && styles.dotActive]} />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    marginBottom: Spacing.sm,
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: Radii.md,
    backgroundColor: FeedColors.imagePlaceholder,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: FeedColors.textSecondary,
    opacity: 0.4,
  },
  dotActive: {
    backgroundColor: ClubColors.text,
    opacity: 1,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
