/**
 * The Octonote mark — lucide's "focus" glyph on a rounded tile, same as the
 * web logo — drawn with plain Views so it can animate without an SVG lib.
 * Geometry is in the glyph's 24-unit viewBox, scaled to the tile.
 */
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { usePalette } from "@/lib/theme";

/** Glyph size relative to the tile (web: size-5 icon in a size-9 tile). */
const GLYPH = 0.56;
const STROKE = 2.25;

export function LogoMark({
  size,
  spread,
  ring,
  colors,
}: {
  size: number;
  /** Override the theme (the splash is always white-on-black). */
  colors?: { tile: string; glyph: string };
  /** 0 = at rest; 1 = corner brackets pushed outward (the "focus" pulse). */
  spread?: SharedValue<number>;
  /** Scale of the centre ring (0–1). */
  ring?: SharedValue<number>;
}) {
  const c = usePalette();
  const tile = colors?.tile ?? c.tint;
  const ink = colors?.glyph ?? c.onTint;
  const u = (size * GLYPH) / 24;
  const sw = STROKE * u;
  const glyph = size * GLYPH;

  // Each bracket: a box whose two outer edges are the stroke, corner radius 2u.
  const arm = 4 * u + sw;
  const bracket = { width: arm, height: arm, borderColor: ink, position: "absolute" as const };
  const at = 3 * u - sw / 2;
  const far = 21 * u + sw / 2 - arm;
  const radius = 2 * u + sw / 2;

  const push = 1.6 * u;
  const tl = useAnimatedStyle(() => {
    const d = (spread?.value ?? 0) * push;
    return { transform: [{ translateX: -d }, { translateY: -d }] };
  });
  const tr = useAnimatedStyle(() => {
    const d = (spread?.value ?? 0) * push;
    return { transform: [{ translateX: d }, { translateY: -d }] };
  });
  const br = useAnimatedStyle(() => {
    const d = (spread?.value ?? 0) * push;
    return { transform: [{ translateX: d }, { translateY: d }] };
  });
  const bl = useAnimatedStyle(() => {
    const d = (spread?.value ?? 0) * push;
    return { transform: [{ translateX: -d }, { translateY: d }] };
  });
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ring?.value ?? 1 }],
    opacity: ring ? Math.min(1, ring.value * 1.5) : 1,
  }));

  const ringSize = 6 * u + sw;

  return (
    <View
      style={[styles.tile, { width: size, height: size, borderRadius: size * 0.223, backgroundColor: tile }]}
      accessibilityRole="image"
      accessibilityLabel="Octonote"
    >
      <View style={{ width: glyph, height: glyph }}>
        <Animated.View
          style={[bracket, { left: at, top: at, borderTopWidth: sw, borderLeftWidth: sw, borderTopLeftRadius: radius }, tl]}
        />
        <Animated.View
          style={[bracket, { left: far, top: at, borderTopWidth: sw, borderRightWidth: sw, borderTopRightRadius: radius }, tr]}
        />
        <Animated.View
          style={[
            bracket,
            { left: far, top: far, borderBottomWidth: sw, borderRightWidth: sw, borderBottomRightRadius: radius },
            br,
          ]}
        />
        <Animated.View
          style={[bracket, { left: at, top: far, borderBottomWidth: sw, borderLeftWidth: sw, borderBottomLeftRadius: radius }, bl]}
        />
        <Animated.View
          style={[
            {
              position: "absolute",
              left: 12 * u - ringSize / 2,
              top: 12 * u - ringSize / 2,
              width: ringSize,
              height: ringSize,
              borderRadius: ringSize / 2,
              borderWidth: sw,
              borderColor: ink,
            },
            ringStyle,
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: "center", justifyContent: "center" },
});
