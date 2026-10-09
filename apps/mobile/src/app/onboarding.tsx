/**
 * First-launch intro: three swipeable slides, each a looping animation of a
 * real feature. Shown once per device (see providers/onboarding), then sign-in.
 */
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useRef, useState, type ComponentType } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CanvasIllustration,
  NotebookIllustration,
  NotesIllustration,
  ShareIllustration,
  type IllustrationProps,
} from "@/components/onboarding/illustrations";
import { usePalette } from "@/lib/theme";
import { useOnboarding } from "@/providers/onboarding";

const SLIDES: {
  title: string;
  body: string;
  Illustration: ComponentType<IllustrationProps>;
}[] = [
  {
    title: "Write without friction.",
    body: "A clean block editor for headings, lists, to-dos and code. Everything saves as you type.",
    Illustration: NotesIllustration,
  },
  {
    title: "Sketch rough.\nGet it clean.",
    body: "An infinite canvas for flows, maps and diagrams — right next to your notes.",
    Illustration: CanvasIllustration,
  },
  {
    title: "Share like a doc.\nPublish like a site.",
    body: "Invite people as editors or viewers, or publish a clean public page in one tap.",
    Illustration: ShareIllustration,
  },
  {
    title: "Group it.\nShare it all at once.",
    body: "Collect notes, canvases and projects in a notebook. Share or publish it once and everything inside follows.",
    Illustration: NotebookIllustration,
  },
];

const GUTTER = 24;

export default function Onboarding() {
  const c = usePalette();
  const router = useRouter();
  const { markSeen } = useOnboarding();
  const { width, height } = useWindowDimensions();
  const scroll = useRef<Animated.ScrollView>(null);
  const x = useSharedValue(0);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;

  const cardW = width - GUTTER * 2;
  const cardH = Math.min(cardW * 1.02, height * 0.44);

  const onScroll = useAnimatedScrollHandler((e) => {
    x.value = e.contentOffset.x;
  });

  const finish = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
      () => {},
    );
    markSeen();
    router.replace("/sign-in");
  };

  const next = () => {
    if (last) return finish();
    void Haptics.selectionAsync().catch(() => {});
    scroll.current?.scrollTo({ x: (index + 1) * width, animated: true });
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: c.background }]}>
      <View style={styles.top}>
        <Pressable
          onPress={finish}
          hitSlop={16}
          style={{ opacity: last ? 0 : 1 }}
          disabled={last}
        >
          <Text style={[styles.skip, { color: c.textSecondary }]}>Skip</Text>
        </Pressable>
      </View>

      <Animated.ScrollView
        ref={scroll}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          if (i !== index) {
            setIndex(i);
            void Haptics.selectionAsync().catch(() => {});
          }
        }}
        style={styles.fill}
      >
        {SLIDES.map((slide, i) => (
          <Slide
            key={slide.title}
            i={i}
            x={x}
            width={width}
            cardW={cardW}
            cardH={cardH}
            active={i === index}
            {...slide}
          />
        ))}
      </Animated.ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <Dot key={s.title} i={i} x={x} width={width} />
          ))}
        </View>
        <Pressable
          onPress={next}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: c.tint,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { color: c.onTint }]}>
            {last ? "Get started" : "Continue"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Slide({
  i,
  x,
  width,
  cardW,
  cardH,
  active,
  title,
  body,
  Illustration,
}: {
  i: number;
  x: SharedValue<number>;
  width: number;
  cardW: number;
  cardH: number;
  active: boolean;
  title: string;
  body: string;
  Illustration: ComponentType<IllustrationProps>;
}) {
  const c = usePalette();
  const range = [(i - 1) * width, i * width, (i + 1) * width];

  // The card drifts slower than the page (parallax); the copy fades with distance.
  const card = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(x.value, range, [
          width * 0.35,
          0,
          -width * 0.35,
        ]),
      },
      { scale: interpolate(x.value, range, [0.94, 1, 0.94]) },
    ],
  }));
  const copy = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, range, [0, 1, 0]),
    transform: [
      {
        translateX: interpolate(x.value, range, [
          width * 0.12,
          0,
          -width * 0.12,
        ]),
      },
    ],
  }));

  return (
    <View style={{ width, paddingHorizontal: GUTTER }}>
      <Animated.View
        style={[
          styles.card,
          {
            width: cardW,
            height: cardH,
            backgroundColor: c.card,
            borderColor: c.separator,
          },
          card,
        ]}
      >
        <Illustration active={active} width={cardW} height={cardH} />
      </Animated.View>
      <Animated.View style={[styles.copy, copy]}>
        <Text style={[styles.title, { color: c.textStrong }]}>{title}</Text>
        <Text style={[styles.body, { color: c.textSecondary }]}>{body}</Text>
      </Animated.View>
    </View>
  );
}

function Dot({
  i,
  x,
  width,
}: {
  i: number;
  x: SharedValue<number>;
  width: number;
}) {
  const c = usePalette();
  const style = useAnimatedStyle(() => {
    const d = Math.min(1, Math.abs(x.value / width - i));
    return { width: 24 - 18 * d, opacity: 1 - 0.75 * d };
  });
  return (
    <Animated.View
      style={[styles.dot, { backgroundColor: c.textStrong }, style]}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: {
    height: 44,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: GUTTER,
  },
  skip: { fontSize: 16, fontWeight: "500" },
  card: {
    marginTop: 12,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  copy: { marginTop: 36 },
  title: {
    fontSize: 34,
    lineHeight: 39,
    fontWeight: "700",
    letterSpacing: -1.1,
  },
  body: { fontSize: 17, lineHeight: 25, marginTop: 14, maxWidth: 360 },
  footer: { paddingHorizontal: GUTTER, paddingBottom: 12, gap: 24 },
  dots: { flexDirection: "row", gap: 6 },
  dot: { height: 6, borderRadius: 3 },
  button: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontSize: 17, fontWeight: "600", letterSpacing: -0.2 },
});
