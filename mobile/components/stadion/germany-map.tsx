import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ClubColors, FeedColors, FontSizes } from '@/constants/theme';
import type { Stadium } from '@/data/stadiums';
import { buildGermanyOutlinePath, projectStadiumToGermanyMap } from '@/lib/germany-map-projection';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ZoomableMap } from '@/components/stadion/zoomable-map';

const MARKER_SIZE = 20;

// A small, self-built bounding-box collision check for marker labels -- not a clustering library.
// Each candidate offset (in percent units, relative to the pin) is tried in this order; the first
// one whose label box doesn't overlap any already-placed label box wins. Divided by the current
// zoom `scale` before use, same as the box half-extents below: since the outline and every marker
// transform together as one rigid unit (see ZoomableMap), a percent distance divided by scale is
// exactly the real on-screen distance -- zooming in spreads candidate positions apart on screen
// exactly like it spreads the markers themselves, so more labels naturally find a free slot.
const LABEL_OFFSET_CANDIDATES: { dx: number; dy: number }[] = [
  { dx: 0, dy: 6 }, // below the pin (previous default)
  { dx: 9, dy: 0 }, // right
  { dx: -9, dy: 0 }, // left
  { dx: 0, dy: -6 }, // above
  { dx: 9, dy: -6 }, // above-right
  { dx: -9, dy: -6 }, // above-left
];
const LABEL_HALF_WIDTH_PERCENT = 6;
const LABEL_HALF_HEIGHT_PERCENT = 2.2;

const GERMANY_OUTLINE_PATH = buildGermanyOutlinePath();

type Point = { xPercent: number; yPercent: number };
type Box = { xMin: number; xMax: number; yMin: number; yMax: number };

function boxAt(point: Point, offset: { dx: number; dy: number }, scale: number): Box {
  const cx = point.xPercent + offset.dx / scale;
  const cy = point.yPercent + offset.dy / scale;
  const halfW = LABEL_HALF_WIDTH_PERCENT / scale;
  const halfH = LABEL_HALF_HEIGHT_PERCENT / scale;
  return { xMin: cx - halfW, xMax: cx + halfW, yMin: cy - halfH, yMax: cy + halfH };
}

function boxesOverlap(a: Box, b: Box): boolean {
  return !(a.xMax < b.xMin || a.xMin > b.xMax || a.yMax < b.yMin || a.yMin > b.yMax);
}

type GermanyMapProps = {
  stadiums: Stadium[];
  onStadiumPress: (stadiumId: string) => void;
};

export function GermanyMap({ stadiums, onStadiumPress }: GermanyMapProps) {
  const [scale, setScale] = useState(1);
  // The last marker the user pressed (set on press-in, just before the info card it opens) always
  // keeps its label visible, even if another marker's label would otherwise win the slot.
  const [priorityStadiumId, setPriorityStadiumId] = useState<string | null>(null);

  const projectedByStadiumId = new Map<string, Point>();
  for (const stadium of stadiums) {
    const point = projectStadiumToGermanyMap(stadium.latitude, stadium.longitude);
    if (point) {
      projectedByStadiumId.set(stadium.id, point);
    }
  }

  // Priority marker is placed first so every other marker's collision check correctly accounts
  // for it; the priority marker itself always gets its first-choice (bottom) position.
  const orderedForPlacement = priorityStadiumId
    ? [...stadiums].sort((a, b) => (a.id === priorityStadiumId ? -1 : b.id === priorityStadiumId ? 1 : 0))
    : stadiums;

  const placedBoxes: Box[] = [];
  const labelOffsetByStadiumId = new Map<string, { dx: number; dy: number } | null>();

  for (const stadium of orderedForPlacement) {
    const point = projectedByStadiumId.get(stadium.id);
    if (!point) continue;

    const isPriority = stadium.id === priorityStadiumId;
    let chosen: { dx: number; dy: number } | null = null;

    for (const candidate of LABEL_OFFSET_CANDIDATES) {
      const box = boxAt(point, candidate, scale);
      const collides = placedBoxes.some((placed) => boxesOverlap(box, placed));
      if (isPriority || !collides) {
        chosen = candidate;
        placedBoxes.push(box);
        break;
      }
    }

    labelOffsetByStadiumId.set(stadium.id, chosen);
  }

  return (
    <View style={styles.mapArea} accessibilityLabel="Deutschlandkarte mit besuchten Stadien">
      <ZoomableMap onScaleChange={setScale}>
        {/* preserveAspectRatio="none": the viewBox stretches to exactly fill the content area,
            matching the plain percentage-based left/top used for markers below -- both must scale
            identically or the outline and markers drift apart. mapArea's own aspectRatio is what
            keeps the result geographically proportional (see lib/germany-map-projection.ts). */}
        <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none">
          <Path d={GERMANY_OUTLINE_PATH} fill="none" stroke={FeedColors.textSecondary} strokeWidth={0.35} strokeLinejoin="round" />
        </Svg>

        {stadiums.map((stadium) => {
          const point = projectedByStadiumId.get(stadium.id);
          if (!point) return null;

          const offset = labelOffsetByStadiumId.get(stadium.id);

          return (
            <Fragment key={stadium.id}>
              {/* The pin sits exactly on the geographic point and never moves for label-collision
                  purposes -- only the label block below (a sibling, not a child) is ever
                  repositioned or hidden. */}
              <Pressable
                onPressIn={() => setPriorityStadiumId(stadium.id)}
                onPress={() => onStadiumPress(stadium.id)}
                style={[styles.pin, { left: `${point.xPercent}%`, top: `${point.yPercent}%` }]}
                accessibilityRole="button"
                accessibilityLabel={`${stadium.name}, ${stadium.city} öffnen`}
                hitSlop={10}
              >
                <View style={styles.markerPinRow}>
                  <IconSymbol size={MARKER_SIZE} name="mappin.and.ellipse" color={ClubColors.primary} />
                  {stadium.visitedGamesCount > 1 ? (
                    <View style={styles.markerBadge}>
                      <Text style={styles.markerBadgeText}>{stadium.visitedGamesCount}</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>

              {/* Never truncated/ellipsized -- if no candidate position is collision-free at the
                  current zoom, the label is hidden entirely (pin above stays visible) rather than
                  ever overlapping another label or getting cut off. */}
              {offset ? (
                <Pressable
                  onPressIn={() => setPriorityStadiumId(stadium.id)}
                  onPress={() => onStadiumPress(stadium.id)}
                  style={[styles.label, { left: `${point.xPercent + offset.dx / scale}%`, top: `${point.yPercent + offset.dy / scale}%` }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${stadium.name}, ${stadium.city} öffnen`}
                  hitSlop={6}
                >
                  <Text style={styles.markerLabel} numberOfLines={2}>
                    {stadium.name}
                  </Text>
                  <Text style={styles.markerSublabel} numberOfLines={1}>
                    {stadium.city}
                  </Text>
                </Pressable>
              ) : null}
            </Fragment>
          );
        })}
      </ZoomableMap>
    </View>
  );
}

const styles = StyleSheet.create({
  // No background/border/radius here on purpose: the outline itself (drawn transparent, only a
  // thin stroke) is meant to stand directly on the screen's own background, not inside a boxed
  // card -- matching the reference silhouette rather than the previous filled-rectangle look.
  mapArea: {
    width: '100%',
    aspectRatio: 0.72,
  },
  pin: {
    position: 'absolute',
    alignItems: 'center',
    marginLeft: -MARKER_SIZE,
    marginTop: -MARKER_SIZE,
    width: MARKER_SIZE * 2,
  },
  label: {
    position: 'absolute',
    alignItems: 'center',
    marginLeft: -70,
    marginTop: -8,
    width: 140,
  },
  markerPinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  markerBadge: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: ClubColors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerBadgeText: {
    color: ClubColors.primary,
    fontSize: 10,
    fontWeight: '700',
  },
  markerLabel: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.badge,
    fontWeight: '700',
    textAlign: 'center',
  },
  markerSublabel: {
    color: FeedColors.textSecondary,
    fontSize: 10,
    textAlign: 'center',
  },
});
