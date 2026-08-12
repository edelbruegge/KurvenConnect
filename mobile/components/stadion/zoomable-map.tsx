import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const MIN_SCALE = 1;
const MAX_SCALE = 5;

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

type ZoomableMapProps = {
  children: React.ReactNode;
  // Mirrors the current scale out to the parent (rounded, throttled) so label-collision
  // avoidance (see germany-map.tsx) can shrink its effective threshold as the user zooms in --
  // markers spread apart on screen exactly proportionally to `scale` since they transform as one
  // unit with the outline (see the transform applied below).
  onScaleChange?: (scale: number) => void;
};

/**
 * A lightweight, dependency-free (react-native-gesture-handler + react-native-reanimated were
 * already installed but unused elsewhere in this app) pinch/pan/wheel-zoom wrapper. `children`
 * (the Germany outline + every stadium marker, see germany-map.tsx) is rendered once inside a
 * single Animated.View and transformed as one rigid unit -- translateX/Y/scale always apply
 * identically to the outline and every marker, so a pin can never drift off its stadium while
 * zooming or panning.
 *
 * Purely gesture-driven, no visible controls: native pinch-to-zoom + drag-to-pan
 * (react-native-gesture-handler), and on web a plain DOM `wheel` listener (only wheel events with
 * `ctrlKey`/`metaKey` zoom -- that's how trackpad pinch-to-zoom arrives in every major browser; a
 * plain mouse-wheel scroll is left untouched so it scrolls the surrounding page normally even
 * with the cursor over the map) plus `pointerdown/move/up` for click-drag panning, active only
 * once actually zoomed in. Both only take effect while the pointer/wheel event originates inside
 * this component's own surface, so the rest of the page keeps scrolling normally. On native, the
 * pan gesture is likewise only enabled once zoomed in (see `isPanEnabled` below) so a plain
 * vertical drag at scale 1 falls through to the surrounding ScrollView instead of being claimed
 * by the map. Zooming out fully (scale back down to MIN_SCALE) is how the user returns to the
 * complete Germany view -- the translation clamp below forces translate to 0 once scale is back
 * at 1, so this always recentres without needing a separate reset control.
 *
 * Both the pinch and wheel handlers zoom around the actual finger/cursor focal point rather than
 * the map's centre (see the two `zoomAroundFocalPoint`-style calculations below) -- for the
 * transform order used here (`[translateX, translateY, scale]`, which composes as `screenPos =
 * scale * localPos + translate`), keeping a screen point `(fx, fy)` (relative to the map's own
 * centre) fixed while scale changes from `oldScale` to `newScale` requires:
 *   translate' = fx * (1 - newScale / oldScale) + translate * (newScale / oldScale)
 * (identically for y). This lets a user pinch or scroll directly onto e.g. the Ruhrgebiet instead
 * of always zooming toward the map's centre first.
 */
export function ZoomableMap({ children, onScaleChange }: ZoomableMapProps) {
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const gestureFocalX = useSharedValue(0);
  const gestureFocalY = useSharedValue(0);
  const containerWidth = useSharedValue(0);
  const containerHeight = useSharedValue(0);

  const [jsScale, setJsScale] = useState(1);
  const surfaceRef = useRef<View>(null);

  const clampTranslation = () => {
    'worklet';
    const maxOffsetX = (containerWidth.value * (scale.value - 1)) / 2;
    const maxOffsetY = (containerHeight.value * (scale.value - 1)) / 2;
    translateX.value = withTiming(clamp(translateX.value, -maxOffsetX, maxOffsetX), { duration: 150 });
    translateY.value = withTiming(clamp(translateY.value, -maxOffsetY, maxOffsetY), { duration: 150 });
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    containerWidth.value = event.nativeEvent.layout.width;
    containerHeight.value = event.nativeEvent.layout.height;
  };

  useAnimatedReaction(
    () => Math.round(scale.value * 10) / 10,
    (current, previous) => {
      if (current !== previous) {
        runOnJS(setJsScale)(current);
      }
    },
  );

  useEffect(() => {
    onScaleChange?.(jsScale);
  }, [jsScale, onScaleChange]);

  const pinchGesture = Gesture.Pinch()
    .onStart((event) => {
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
      // event.focalX/focalY are relative to the gesture view's top-left corner; converted here to
      // be relative to the map's own centre, matching the coordinate space translateX/Y use.
      gestureFocalX.value = event.focalX - containerWidth.value / 2;
      gestureFocalY.value = event.focalY - containerHeight.value / 2;
    })
    .onUpdate((event) => {
      const newScale = clamp(savedScale.value * event.scale, MIN_SCALE, MAX_SCALE);
      const ratio = newScale / savedScale.value;
      translateX.value = gestureFocalX.value * (1 - ratio) + savedTranslateX.value * ratio;
      translateY.value = gestureFocalY.value * (1 - ratio) + savedTranslateY.value * ratio;
      scale.value = newScale;
    })
    .onEnd(() => {
      clampTranslation();
    });

  // Whether a single-finger drag on the map should pan it at all. At scale 1 there is nothing to
  // pan (the full outline already fills the view), and -- more importantly -- the map sits inside
  // a plain ScrollView (app/stadion/karte.tsx): if this Pan gesture merely no-opted in onUpdate
  // (as it used to) it would still *claim* every single-finger touch that starts over the map,
  // since a GestureDetector-attached gesture competes with the ancestor ScrollView's own pan
  // responder for the same touch. That swallowed ordinary vertical page scrolls whenever they
  // happened to start on the map area, even though nothing visible happened. `.enabled(false)`
  // (set below) makes RNGH not attempt to claim the touch at all when this is false, so the touch
  // falls through to the ScrollView exactly as if the GestureDetector weren't there. `> 1.01`
  // (not `> 1`) gives a small float tolerance, matching jsScale's own 1-decimal rounding.
  const isPanEnabled = jsScale > 1.01;

  const panGesture = Gesture.Pan()
    // Without this, RNGH's default (minPointers 1, no max) means a two-finger pinch touch also
    // satisfies Pan's own activation criteria -- since both gestures run concurrently under
    // Gesture.Simultaneous below, Pan's onUpdate then fires every frame *alongside* Pinch's,
    // each writing translateX/Y from its own independently-captured onStart baseline. The two
    // writes fight every frame, producing an erratic, usually far-off-center final translation
    // once the gesture ends and clampTranslation() snaps it into (the wrong) bounds -- this was
    // the actual cause of "only the bottom of Germany reachable after zooming in": not a bounds
    // bug (the bounds math itself is correct), but Pan and Pinch clobbering the same shared
    // values. Restricting Pan to exactly one pointer means it simply never activates during a
    // pinch, so only Pinch's own onUpdate (with its correct focal-point math) drives the
    // transform during a two-finger gesture.
    .minPointers(1)
    .maxPointers(1)
    .enabled(isPanEnabled)
    .onStart(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((event) => {
      if (scale.value <= 1) return;
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      clampTranslation();
    });

  const nativeGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  // Web: no GestureDetector here -- plain DOM listeners on the underlying node instead (see the
  // component doc comment for why). React Native Web forwards a View's ref to its DOM node.
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const node = surfaceRef.current as unknown as HTMLElement | null;
    if (!node) return;

    const handleWheel = (event: WheelEvent) => {
      // Trackpad pinch-to-zoom arrives as a wheel event with ctrlKey (or, on some browsers/OSes,
      // metaKey) automatically set -- that is the only wheel input treated as a zoom gesture.
      // A plain mouse-wheel scroll (no modifier) is left completely alone (no preventDefault, no
      // zoom) so the surrounding page scrolls normally even while the cursor happens to be over
      // the map -- previously *every* wheel event zoomed the map, which hijacked ordinary page
      // scrolling whenever the pointer was over the map area.
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const focalX = event.clientX - rect.left - rect.width / 2;
      const focalY = event.clientY - rect.top - rect.height / 2;

      const oldScale = scale.value;
      const zoomFactor = Math.exp(-event.deltaY * 0.0015);
      const newScale = clamp(oldScale * zoomFactor, MIN_SCALE, MAX_SCALE);
      const ratio = newScale / oldScale;

      translateX.value = focalX * (1 - ratio) + translateX.value * ratio;
      translateY.value = focalY * (1 - ratio) + translateY.value * ratio;
      scale.value = newScale;
      clampTranslation();
    };

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startTranslateX = 0;
    let startTranslateY = 0;

    const handlePointerDown = (event: PointerEvent) => {
      if (scale.value <= 1) return;
      isDragging = true;
      startX = event.clientX;
      startY = event.clientY;
      startTranslateX = translateX.value;
      startTranslateY = translateY.value;
      node.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!isDragging) return;
      translateX.value = startTranslateX + (event.clientX - startX);
      translateY.value = startTranslateY + (event.clientY - startY);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!isDragging) return;
      isDragging = false;
      node.releasePointerCapture(event.pointerId);
      clampTranslation();
    };

    node.addEventListener('wheel', handleWheel, { passive: false });
    node.addEventListener('pointerdown', handlePointerDown);
    node.addEventListener('pointermove', handlePointerMove);
    node.addEventListener('pointerup', handlePointerUp);
    node.style.cursor = 'grab';

    return () => {
      node.removeEventListener('wheel', handleWheel);
      node.removeEventListener('pointerdown', handlePointerDown);
      node.removeEventListener('pointermove', handlePointerMove);
      node.removeEventListener('pointerup', handlePointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CSS touch-action, kept reactive to scale (unlike the listeners above, which are attached once):
  // 'none' at scale 1 would permanently block the browser's own native touch-scrolling over the
  // map on touch-capable web devices, even though nothing here has any use for that at scale 1 --
  // 'pan-y' lets a normal vertical touch-drag over the map scroll the page like anywhere else.
  // Only once actually zoomed in does the custom pointerdown/move/up pan logic above need
  // exclusive control of touch gestures within the map surface.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = surfaceRef.current as unknown as HTMLElement | null;
    if (!node) return;
    node.style.touchAction = jsScale > 1.01 ? 'none' : 'pan-y';
  }, [jsScale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));

  const content = (
    <Animated.View nativeID="zoomable-map-content" style={[styles.content, animatedStyle]}>
      {children}
    </Animated.View>
  );

  return (
    <View ref={surfaceRef} style={styles.surface} onLayout={handleLayout}>
      {Platform.OS === 'web' ? content : <GestureDetector gesture={nativeGesture}>{content}</GestureDetector>}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  content: {
    width: '100%',
    height: '100%',
  },
});
