import { Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { FeedColors } from '@/constants/theme';
import { useSafeBack } from '@/hooks/use-safe-back';

const BUTTON_SIZE = 44;
const ICON_SIZE = 24;
// (BUTTON_SIZE - ICON_SIZE) / 2 -- see the `icon` style comment below.
const ICON_OFFSET = (BUTTON_SIZE - ICON_SIZE) / 2;

// Hand-drawn instead of IconSymbol's font-glyph "chevron.left" -- MaterialIcons' chevron-left
// glyph (Android/web) sits visibly off-center within its own bounding box, and a manual nudge to
// compensate was guesswork that didn't hold up. This path is centered by construction: the vertex
// sits at x=9 and both open ends at x=15, symmetric around the 24-wide viewBox's center (12), and
// the same for y (6/18 around 12).
function BackChevron({ color }: { color: string }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" style={styles.icon}>
      <Path d="M15 6L9 12L15 18" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function HeaderBackButton() {
  const goBack = useSafeBack();

  return (
    <Pressable onPress={goBack} style={styles.button} hitSlop={8} accessibilityRole="button" accessibilityLabel="Zurück">
      <BackChevron color={FeedColors.textPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    marginLeft: -10,
  },
  // react-native-svg's <Svg> doesn't reliably report its own 24x24 size to the flexbox layout
  // engine on every platform -- alignItems/justifyContent: 'center' on `button` centered a
  // collapsed (near-zero-size) box instead of the actual rendered icon, leaving it anchored near
  // one corner instead of truly centered. Absolute positioning with a fixed pixel offset sidesteps
  // that entirely: the icon is placed at the exact center of `button` by coordinates alone,
  // independent of how react-native-svg reports its intrinsic size.
  icon: {
    position: 'absolute',
    top: ICON_OFFSET,
    left: ICON_OFFSET,
  },
});
