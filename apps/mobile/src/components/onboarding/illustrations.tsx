/**
 * Onboarding illustrations: tiny, looping animations of the real features.
 * Each one is driven by a single 0→1 clock (`useLoop`); elements read their
 * own slice of it with `seg`, so the whole scene stays in sync and can be
 * frozen on its final frame for reduced motion.
 */
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { easeOut, usePalette } from "@/lib/theme";

/** Point in the loop where everything is fully drawn (shown for reduced motion). */
const REST = 0.85;

function useLoop(active: boolean, duration: number) {
  const reduceMotion = useReducedMotion();
  const p = useSharedValue(reduceMotion ? REST : 0);
  useEffect(() => {
    cancelAnimation(p);
    if (reduceMotion) {
      p.value = REST;
      return;
    }
    p.value = 0;
    if (active)
      p.value = withRepeat(
        withTiming(1, { duration, easing: Easing.linear }),
        -1,
        false,
      );
  }, [active, duration, reduceMotion, p]);
  return p;
}

/** Eased progress of `p` through [a, b]. */
function seg(p: number, a: number, b: number) {
  "worklet";
  return easeOut(Math.min(1, Math.max(0, (p - a) / (b - a))));
}

/** Everything fades out at the very end of the loop so it restarts cleanly. */
function useSceneStyle(p: SharedValue<number>) {
  return useAnimatedStyle(() => ({ opacity: 1 - seg(p.value, 0.94, 1) }));
}

/** Grows a bar's width from 0 to `max` px over [a, a + 0.14]. */
function useGrow(p: SharedValue<number>, a: number, max: number) {
  return useAnimatedStyle(() => ({ width: seg(p.value, a, a + 0.14) * max }));
}

/** Fades in and scales up from 70%. */
function usePop(p: SharedValue<number>, a: number) {
  return useAnimatedStyle(() => ({
    opacity: seg(p.value, a, a + 0.06),
    transform: [{ scale: 0.7 + 0.3 * seg(p.value, a, a + 0.14) }],
  }));
}

/** Fades in while sliding in from the right. */
function useEnter(p: SharedValue<number>, a: number) {
  return useAnimatedStyle(() => ({
    opacity: seg(p.value, a, a + 0.1),
    transform: [{ translateX: (1 - seg(p.value, a, a + 0.14)) * 24 }],
  }));
}

/** Fades in over [a, a + 0.06]. */
function useFadeIn(p: SharedValue<number>, a: number) {
  return useAnimatedStyle(() => ({ opacity: seg(p.value, a, a + 0.06) }));
}

export interface IllustrationProps {
  active: boolean;
  width: number;
  height: number;
}

/* ───────────────────────── Notes ───────────────────────── */

export function NotesIllustration({ active, width }: IllustrationProps) {
  const c = usePalette();
  const p = useLoop(active, 5200);
  const scene = useSceneStyle(p);
  const inner = width - 56;

  const title = useAnimatedStyle(() => ({
    width: seg(p.value, 0.02, 0.16) * inner * 0.62,
  }));
  const l1 = useGrow(p, 0.16, inner * 0.94);
  const l2 = useGrow(p, 0.24, inner * 0.82);
  const l3 = useGrow(p, 0.32, inner * 0.58);
  const todos = useAnimatedStyle(() => ({
    opacity: seg(p.value, 0.42, 0.5),
    transform: [{ translateY: (1 - seg(p.value, 0.42, 0.5)) * 8 }],
  }));
  const check = useAnimatedStyle(() => ({
    opacity: seg(p.value, 0.58, 0.62),
    transform: [{ scale: 0.6 + 0.4 * seg(p.value, 0.58, 0.66) }],
  }));
  const strike = useGrow(p, 0.62, inner * 0.5);
  const caret = useAnimatedStyle(() => ({
    opacity: p.value < 0.4 ? (Math.floor(p.value * 40) % 2 ? 1 : 0.15) : 0,
  }));

  return (
    <Animated.View style={[styles.pad, scene]}>
      <Text style={[styles.kicker, { color: c.textSubtle }]}>Note</Text>
      <View style={styles.row}>
        <Animated.View style={[styles.clip, title]}>
          <Text
            numberOfLines={1}
            style={[styles.noteTitle, { color: c.textStrong, width: inner }]}
          >
            Launch plan
          </Text>
        </Animated.View>
        <Animated.View
          style={[styles.caret, { backgroundColor: c.textStrong }, caret]}
        />
      </View>
      <View style={styles.lines}>
        {[l1, l2, l3].map((s, i) => (
          <Animated.View
            key={i}
            style={[styles.bar, { backgroundColor: c.fill }, s]}
          />
        ))}
      </View>
      <Animated.View style={[styles.todos, todos]}>
        <View style={styles.todo}>
          <View style={[styles.box, { borderColor: c.textStrong }]}>
            <Animated.View
              style={[styles.boxFill, { backgroundColor: c.textStrong }, check]}
            >
              <Text style={[styles.tick, { color: c.onTint }]}>✓</Text>
            </Animated.View>
          </View>
          <View>
            <View
              style={[
                styles.todoBar,
                { backgroundColor: c.fill, width: inner * 0.5 },
              ]}
            />
            <Animated.View
              style={[styles.strike, { backgroundColor: c.textSubtle }, strike]}
            />
          </View>
        </View>
        <View style={styles.todo}>
          <View style={[styles.box, { borderColor: c.textStrong }]} />
          <View
            style={[
              styles.todoBar,
              { backgroundColor: c.fill, width: inner * 0.38 },
            ]}
          />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

/* ───────────────────────── Canvas ───────────────────────── */

export function CanvasIllustration({
  active,
  width,
  height,
}: IllustrationProps) {
  const c = usePalette();
  const p = useLoop(active, 5600);
  const scene = useSceneStyle(p);

  const boxW = width * 0.3;
  const boxH = height * 0.2;
  const left = width * 0.1;
  const top = height * 0.26;
  const ellW = width * 0.32;
  const ellLeft = width - left - ellW;
  const gap = ellLeft - (left + boxW);
  const arrowY = top + boxH / 2;
  const shipTop = height * 0.64;
  const downX = ellLeft + ellW / 2;
  const downLen = shipTop - (top + boxH) - 8;

  const box = usePop(p, 0.04);
  const ell = usePop(p, 0.36);
  const ship = usePop(p, 0.62);
  const across = useAnimatedStyle(() => ({
    width: seg(p.value, 0.2, 0.34) * (gap - 16),
  }));
  const acrossHead = useAnimatedStyle(() => ({
    opacity: seg(p.value, 0.32, 0.36),
  }));
  const down = useAnimatedStyle(() => ({
    height: seg(p.value, 0.5, 0.62) * downLen,
  }));
  const downHead = useAnimatedStyle(() => ({
    opacity: seg(p.value, 0.6, 0.64),
  }));
  const cursor = useAnimatedStyle(() => {
    const a = seg(p.value, 0.0, 0.2);
    const b = seg(p.value, 0.24, 0.4);
    const d = seg(p.value, 0.46, 0.66);
    const x =
      left +
      boxW * 0.8 +
      (ellLeft + ellW * 0.7 - (left + boxW * 0.8)) * b +
      (downX + 30 - (ellLeft + ellW * 0.7)) * d;
    const y = top + boxH * 0.9 + (shipTop + 34 - (top + boxH * 0.9)) * d;
    return { opacity: a, transform: [{ translateX: x }, { translateY: y }] };
  });

  const dots = [];
  for (let y = 18; y < height; y += 22)
    for (let x = 18; x < width; x += 22) dots.push({ x, y });

  return (
    <View style={StyleSheet.absoluteFill}>
      {dots.map((d, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            { left: d.x, top: d.y, backgroundColor: c.separator },
          ]}
        />
      ))}
      <Animated.View style={[StyleSheet.absoluteFill, scene]}>
        <Animated.View
          style={[
            styles.shape,
            {
              left,
              top,
              width: boxW,
              height: boxH,
              borderRadius: 12,
              borderColor: c.textStrong,
            },
            box,
          ]}
        >
          <Text style={[styles.shapeLabel, { color: c.textStrong }]}>Idea</Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.hLine,
            {
              left: left + boxW + 8,
              top: arrowY - 1,
              backgroundColor: c.textStrong,
            },
            across,
          ]}
        />
        <Animated.View
          style={[
            styles.headRight,
            {
              left: ellLeft - 14,
              top: arrowY - 5,
              borderLeftColor: c.textStrong,
            },
            acrossHead,
          ]}
        />

        <Animated.View
          style={[
            styles.shape,
            {
              left: ellLeft,
              top: top - 4,
              width: ellW,
              height: boxH + 8,
              borderRadius: 999,
              borderColor: c.textStrong,
            },
            ell,
          ]}
        >
          <Text style={[styles.shapeLabel, { color: c.textStrong }]}>Plan</Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.vLine,
            {
              left: downX - 1,
              top: top + boxH + 4,
              backgroundColor: c.textStrong,
            },
            down,
          ]}
        />
        <Animated.View
          style={[
            styles.headDown,
            {
              left: downX - 5,
              top: shipTop - 12,
              borderTopColor: c.textStrong,
            },
            downHead,
          ]}
        />

        <Animated.View
          style={[
            styles.shape,
            styles.dashed,
            {
              left: downX - boxW / 2,
              top: shipTop,
              width: boxW,
              height: boxH,
              borderRadius: 12,
              borderColor: c.textStrong,
            },
            ship,
          ]}
        >
          <Text style={[styles.shapeLabel, { color: c.textStrong }]}>Ship</Text>
        </Animated.View>

        <Animated.View style={[styles.cursor, cursor]}>
          <View
            style={[styles.cursorTip, { borderBottomColor: c.textStrong }]}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/* ───────────────────────── Share ───────────────────────── */

export function ShareIllustration({ active }: IllustrationProps) {
  const c = usePalette();
  const p = useLoop(active, 5600);
  const scene = useSceneStyle(p);

  const maya = useEnter(p, 0.08);
  const sam = useEnter(p, 0.2);
  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      seg(p.value, 0.42, 0.5),
      [0, 1],
      [c.fill, c.tint],
    ),
  }));
  const knob = useAnimatedStyle(() => ({
    transform: [{ translateX: seg(p.value, 0.42, 0.52) * 18 }],
  }));
  const link = useAnimatedStyle(() => ({
    opacity: seg(p.value, 0.54, 0.62),
    transform: [{ translateY: (1 - seg(p.value, 0.54, 0.66)) * 10 }],
  }));
  const status = useAnimatedStyle(() => ({ opacity: seg(p.value, 0.5, 0.56) }));

  return (
    <Animated.View style={[styles.pad, scene]}>
      <Text style={[styles.kicker, { color: c.textSubtle }]}>
        Share “Field guide”
      </Text>
      <View style={styles.people}>
        <Person initial="Y" name="You" role="Owner" />
        <Animated.View style={maya}>
          <Person initial="M" name="Maya" role="Editor" />
        </Animated.View>
        <Animated.View style={sam}>
          <Person initial="S" name="Sam" role="Viewer" />
        </Animated.View>
      </View>
      <View style={[styles.divider, { backgroundColor: c.separator }]} />
      <View style={styles.publish}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.personName, { color: c.textStrong }]}>
            Publish to web
          </Text>
          <Animated.Text
            style={[styles.meta, { color: c.textSecondary }, status]}
          >
            Live · anyone can read
          </Animated.Text>
        </View>
        <Animated.View style={[styles.track, track]}>
          <Animated.View
            style={[styles.knob, { backgroundColor: c.background }, knob]}
          />
        </Animated.View>
      </View>
      <Animated.View style={[styles.link, { backgroundColor: c.fill }, link]}>
        <Text numberOfLines={1} style={[styles.linkText, { color: c.text }]}>
          octonote.ai/pub/field-guide
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

/* ───────────────────────── Notebooks ───────────────────────── */

const NOTEBOOK_ITEMS = [
  { title: "Roadmap", kind: "Note" },
  { title: "Launch flow", kind: "Canvas" },
  { title: "Onboarding", kind: "Project" },
];

export function NotebookIllustration({ active }: IllustrationProps) {
  const c = usePalette();
  const p = useLoop(active, 5600);
  const scene = useSceneStyle(p);
  const rows = [useEnter(p, 0.06), useEnter(p, 0.16), useEnter(p, 0.26)];
  const badge = [useFadeIn(p, 0.5), useFadeIn(p, 0.54), useFadeIn(p, 0.58)];
  const pill = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      seg(p.value, 0.42, 0.48),
      [0, 1],
      [c.background, c.tint],
    ),
    borderColor: interpolateColor(
      seg(p.value, 0.42, 0.48),
      [0, 1],
      [c.separator, c.tint],
    ),
  }));
  const privateText = useAnimatedStyle(() => ({
    opacity: 1 - seg(p.value, 0.42, 0.46),
  }));
  const publishedText = useAnimatedStyle(() => ({
    opacity: seg(p.value, 0.44, 0.48),
  }));

  return (
    <Animated.View style={[styles.pad, scene]}>
      <View style={styles.nbHeader}>
        <View
          style={[
            styles.nbTile,
            { backgroundColor: c.fill, borderColor: c.separator },
          ]}
        >
          <View style={[styles.nbSpine, { backgroundColor: c.textStrong }]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.nbTitle, { color: c.textStrong }]}>
            Field guide
          </Text>
          <Text style={[styles.meta, { color: c.textSecondary }]}>3 items</Text>
        </View>
        <Animated.View style={[styles.pill, pill]}>
          <Animated.Text
            style={[styles.pillText, { color: c.textSecondary }, privateText]}
          >
            Private
          </Animated.Text>
          <Animated.Text
            style={[
              styles.pillText,
              styles.pillOver,
              { color: c.onTint },
              publishedText,
            ]}
          >
            Published
          </Animated.Text>
        </Animated.View>
      </View>
      <View style={[styles.nbList, { borderColor: c.separator }]}>
        {NOTEBOOK_ITEMS.map((item, i) => (
          <Animated.View
            key={item.title}
            style={[
              styles.nbRow,
              i > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderColor: c.separator,
              },
              rows[i],
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.personName, { color: c.textStrong }]}>
                {item.title}
              </Text>
              <Animated.Text
                style={[styles.nbBadge, { color: c.textSecondary }, badge[i]]}
              >
                Public via Field guide
              </Animated.Text>
            </View>
            <Text style={[styles.meta, { color: c.textSubtle }]}>
              {item.kind}
            </Text>
          </Animated.View>
        ))}
      </View>
    </Animated.View>
  );
}

function Person({
  initial,
  name,
  role,
}: {
  initial: string;
  name: string;
  role: string;
}) {
  const c = usePalette();
  return (
    <View style={styles.person}>
      <View style={[styles.avatar, { backgroundColor: c.tint }]}>
        <Text style={[styles.avatarText, { color: c.onTint }]}>{initial}</Text>
      </View>
      <Text style={[styles.personName, { color: c.textStrong, flex: 1 }]}>
        {name}
      </Text>
      <Text style={[styles.meta, { color: c.textSecondary }]}>{role}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { flex: 1, padding: 28, justifyContent: "center" },
  kicker: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    height: 34,
  },
  clip: { overflow: "hidden" },
  noteTitle: { fontSize: 28, fontWeight: "700", letterSpacing: -0.8 },
  caret: { width: 2, height: 26, marginLeft: 2 },
  lines: { gap: 12, marginTop: 20 },
  bar: { height: 9, borderRadius: 5 },
  todos: { gap: 14, marginTop: 28 },
  todo: { flexDirection: "row", alignItems: "center", gap: 12 },
  box: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.75,
    overflow: "hidden",
  },
  boxFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  tick: { fontSize: 13, fontWeight: "800", marginTop: -1 },
  todoBar: { height: 9, borderRadius: 5 },
  strike: { position: "absolute", top: 4, height: 1.5 },

  dot: { position: "absolute", width: 2, height: 2, borderRadius: 1 },
  shape: {
    position: "absolute",
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  dashed: { borderStyle: "dashed" },
  shapeLabel: { fontSize: 15, fontWeight: "600" },
  hLine: { position: "absolute", height: 2 },
  vLine: { position: "absolute", width: 2 },
  headRight: {
    position: "absolute",
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 9,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
  },
  headDown: {
    position: "absolute",
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 9,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  cursor: { position: "absolute", left: 0, top: 0 },
  cursorTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 18,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    transform: [{ rotate: "-28deg" }],
  },

  people: { gap: 12, marginTop: 18 },
  nbHeader: { flexDirection: "row", alignItems: "center", gap: 14 },
  nbTile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  nbSpine: { width: 16, height: 20, borderRadius: 3 },
  nbTitle: { fontSize: 20, fontWeight: "700", letterSpacing: -0.4 },
  pill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  pillText: { fontSize: 13, fontWeight: "600" },
  pillOver: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 5,
    textAlign: "center",
  },
  nbList: {
    marginTop: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
  },
  nbRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  nbBadge: { fontSize: 12, marginTop: 2 },
  person: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 14, fontWeight: "700" },
  personName: { fontSize: 16, fontWeight: "600" },
  meta: { fontSize: 14 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 18 },
  publish: { flexDirection: "row", alignItems: "center" },
  track: { width: 44, height: 26, borderRadius: 13, padding: 3 },
  knob: { width: 20, height: 20, borderRadius: 10 },
  link: {
    marginTop: 16,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  linkText: { fontSize: 14, fontFamily: "monospace" },
});
