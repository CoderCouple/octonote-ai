/**
 * Picks up exactly where the native splash (app.json) leaves off — same tile,
 * same size, same spot — then plays a short "focus" beat and fades away.
 * The native splash stays up until `ready`, so nothing flashes underneath.
 */
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { LogoMark } from "@/components/logo-mark";
import { themes } from "@octonote/design-tokens";

void SplashScreen.preventAutoHideAsync().catch(() => {});

/** Always black, in both themes — must match expo-splash-screen in app.json. */
const BG = themes.dark.background;
const TILE_COLORS = { tile: themes.dark.primary, glyph: themes.dark["primary-foreground"] };
const WORD = themes.dark["foreground-strong"];

/** Must match `imageWidth` of expo-splash-screen in app.json. */
const TILE = 96;
const out = Easing.bezier(0.3, 0, 0, 1);

/** Dev: replay the splash on demand (Account → Replay splash). */
const replayListeners = new Set<() => void>();
export function replaySplash() {
  replayListeners.forEach((fn) => fn());
}

/** Remounts the splash whenever `replaySplash()` is called. */
export function useSplashReplays() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const fn = () => setCount((n) => n + 1);
    replayListeners.add(fn);
    return () => void replayListeners.delete(fn);
  }, []);
  return count;
}

export function AnimatedSplash({ ready }: { ready: boolean }) {
  const reduceMotion = useReducedMotion();
  const [done, setDone] = useState(false);

  const spread = useSharedValue(0);
  const ring = useSharedValue(1);
  const word = useSharedValue(0);
  const exit = useSharedValue(0);

  useEffect(() => {
    if (!ready) return;
    void SplashScreen.hideAsync().catch(() => {});

    if (reduceMotion) {
      exit.value = withTiming(1, { duration: 200, reduceMotion: ReduceMotion.Never });
      const t = setTimeout(() => setDone(true), 220);
      return () => clearTimeout(t);
    }

    spread.value = withDelay(
      150,
      withSequence(withTiming(1, { duration: 320, easing: out }), withTiming(0, { duration: 520, easing: out })),
    );
    ring.value = withDelay(
      150,
      withSequence(withTiming(0.5, { duration: 260, easing: out }), withTiming(1, { duration: 600, easing: out })),
    );
    word.value = withDelay(500, withTiming(1, { duration: 600, easing: out }));
    exit.value = withDelay(1850, withTiming(1, { duration: 420, easing: out }));
    const t = setTimeout(() => setDone(true), 2300);
    return () => clearTimeout(t);
  }, [ready, reduceMotion, spread, ring, word, exit]);

  const container = useAnimatedStyle(() => ({ opacity: 1 - exit.value }));
  const tile = useAnimatedStyle(() => ({ transform: [{ scale: 1 + exit.value * 0.08 }] }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: word.value,
    transform: [{ translateY: (1 - word.value) * 10 }],
  }));

  if (done) return null;

  return (
    <Animated.View
      pointerEvents={ready ? "none" : "auto"}
      style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: BG }, container]}
    >
      <View style={styles.anchor}>
        <Animated.View style={tile}>
          <LogoMark size={TILE} spread={spread} ring={ring} colors={TILE_COLORS} />
        </Animated.View>
        <Animated.Text style={[styles.word, { color: WORD }, wordStyle]}>Octonote AI</Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", zIndex: 100 },
  anchor: { width: TILE, height: TILE, alignItems: "center" },
  word: {
    position: "absolute",
    top: TILE + 22,
    width: 240,
    textAlign: "center",
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.6,
  },
});
