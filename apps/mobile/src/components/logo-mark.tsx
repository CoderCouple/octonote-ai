/**
 * The Octonote AI octopus (packages/shared/src/octopus.ts), same as the web
 * logo: black in light mode, white in dark, its face cut out in the surface
 * colour. With `colors` it sits on a rounded tile (the splash).
 */
import {
  OCTOPUS_BODY,
  OCTOPUS_FACES,
  OCTOPUS_VIEWBOX,
  type OctopusMood,
} from "@octonote/shared";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { usePalette } from "@/lib/theme";

/** Octopus size relative to its tile. */
const ON_TILE = 0.72;

export function LogoMark({
  size,
  mood = "happy",
  colors,
  bounce,
}: {
  size: number;
  mood?: OctopusMood;
  /** Draw it on a tile in these colours (the splash is fixed, not themed). */
  colors?: { tile: string; glyph: string };
  /** 0 = at rest; 1 = hopped up a little (the splash's hello). */
  bounce?: SharedValue<number>;
}) {
  const c = usePalette();
  const ink = colors?.glyph ?? c.textStrong;
  const paper = colors?.tile ?? c.background;
  const mark = colors ? size * ON_TILE : size;

  const hop = useAnimatedStyle(() => {
    const b = bounce?.value ?? 0;
    return { transform: [{ translateY: -b * mark * 0.08 }, { scale: 1 + b * 0.04 }] };
  });

  return (
    <View
      style={[
        styles.box,
        { width: size, height: size },
        colors && { borderRadius: size * 0.223, backgroundColor: colors.tile },
      ]}
      accessibilityRole="image"
      accessibilityLabel="Octonote AI"
    >
      <Animated.View style={hop}>
        <Svg width={mark} height={mark} viewBox={OCTOPUS_VIEWBOX}>
          <Path d={OCTOPUS_BODY} fill={ink} />
          {OCTOPUS_FACES[mood].map((p, i) =>
            p.kind === "rect" ? (
              <Rect key={i} x={p.x} y={p.y} width={p.width} height={p.height} rx={p.rx} fill={paper} />
            ) : p.kind === "circle" ? (
              <Circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={paper} />
            ) : (
              <Path key={i} d={p.d} fill="none" stroke={paper} strokeWidth={p.width} strokeLinecap="round" strokeLinejoin="round" />
            ),
          )}
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: "center", justifyContent: "center" },
});
