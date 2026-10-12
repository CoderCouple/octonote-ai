/**
 * The same black-and-white empty-state pictures as the web app
 * (apps/web/src/components/empty-state.tsx), drawn with react-native-svg in
 * palette colors so they follow light/dark mode.
 */
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";
import { usePalette } from "@/lib/theme";

export type EmptyKind = "page" | "canvas" | "project" | "notebook" | "shared";

export function EmptyIllustration({
  kind,
  width = 176,
}: {
  kind: EmptyKind;
  width?: number;
}) {
  const c = usePalette();
  const S = c.textStrong;
  const SUBTLE = c.textSubtle;
  const CARD = c.card;
  const FILL = c.fill;

  /** A document card at (x, y) with a title bar and text lines. */
  const Doc = ({
    x,
    y,
    w = 56,
    h = 72,
    lines = 4,
  }: {
    x: number;
    y: number;
    w?: number;
    h?: number;
    lines?: number;
  }) => (
    <G>
      <Rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={7}
        fill={CARD}
        stroke={S}
        strokeWidth={1.5}
      />
      <Rect x={x + 9} y={y + 11} width={w * 0.5} height={5} rx={2.5} fill={S} />
      {Array.from({ length: lines }, (_, i) => (
        <Rect
          key={i}
          x={x + 9}
          y={y + 24 + i * 9}
          width={(w - 18) * [1, 0.85, 0.95, 0.6][i % 4]!}
          height={3.5}
          rx={1.75}
          fill={SUBTLE}
        />
      ))}
    </G>
  );

  return (
    <Svg
      width={width}
      height={(width * 128) / 176}
      viewBox="0 0 176 128"
      fill="none"
    >
      <Ellipse cx={88} cy={66} rx={70} ry={54} fill={FILL} />
      {kind === "page" ? (
        <G>
          <Doc x={60} y={24} w={58} h={80} lines={4} />
          <Rect
            x={69}
            y={86}
            width={8}
            height={8}
            rx={2}
            stroke={S}
            strokeWidth={1.5}
            fill={CARD}
          />
          <Path
            d="M71 90l1.6 1.6 3-3.4"
            stroke={S}
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Rect
            x={81}
            y={88.5}
            width={26}
            height={3.5}
            rx={1.75}
            fill={SUBTLE}
          />
        </G>
      ) : kind === "canvas" ? (
        <G>
          <Rect
            x={34}
            y={26}
            width={108}
            height={76}
            rx={9}
            fill={CARD}
            stroke={S}
            strokeWidth={1.5}
          />
          {[46, 58, 70, 82, 94].flatMap((cy) =>
            [46, 60, 74, 88, 102, 116, 130].map((cx) => (
              <Circle
                key={`${cx}-${cy}`}
                cx={cx}
                cy={cy}
                r={0.9}
                fill={SUBTLE}
              />
            )),
          )}
          <Rect
            x={48}
            y={44}
            width={30}
            height={20}
            rx={5}
            fill={CARD}
            stroke={S}
            strokeWidth={1.5}
          />
          <Ellipse
            cx={116}
            cy={54}
            rx={16}
            ry={10}
            fill={CARD}
            stroke={S}
            strokeWidth={1.5}
          />
          <Path
            d="M78 54h20m-4-3.5 4 3.5-4 3.5"
            stroke={S}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M116 64v14m-3.5-4 3.5 4 3.5-4"
            stroke={S}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Rect
            x={101}
            y={80}
            width={30}
            height={14}
            rx={5}
            stroke={S}
            strokeWidth={1.5}
            strokeDasharray="3 3"
            fill={CARD}
          />
        </G>
      ) : kind === "project" ? (
        <G>
          <Doc x={34} y={28} w={50} h={72} lines={4} />
          <Rect
            x={92}
            y={28}
            width={50}
            height={72}
            rx={7}
            fill={CARD}
            stroke={S}
            strokeWidth={1.5}
          />
          <Rect
            x={101}
            y={40}
            width={20}
            height={14}
            rx={4}
            stroke={S}
            strokeWidth={1.5}
          />
          <Circle cx={125} cy={74} r={9} stroke={S} strokeWidth={1.5} />
          <Path
            d="M111 54v12l6 4"
            stroke={S}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </G>
      ) : kind === "notebook" ? (
        <G>
          <Rect
            x={48}
            y={22}
            width={80}
            height={86}
            rx={8}
            fill={CARD}
            stroke={S}
            strokeWidth={1.5}
          />
          <Path d="M60 22v86" stroke={S} strokeWidth={1.5} />
          {[38, 56, 74].map((y, i) => (
            <G key={y}>
              <Rect
                x={70}
                y={y}
                width={10}
                height={10}
                rx={2.5}
                stroke={S}
                strokeWidth={1.3}
                fill={i === 1 ? FILL : CARD}
              />
              <Rect
                x={86}
                y={y + 3.2}
                width={[30, 24, 28][i]!}
                height={3.5}
                rx={1.75}
                fill={SUBTLE}
              />
            </G>
          ))}
          <Rect x={70} y={92} width={30} height={3.5} rx={1.75} fill={SUBTLE} />
        </G>
      ) : (
        <G>
          <Doc x={46} y={22} w={58} h={78} lines={4} />
          <Circle cx={112} cy={88} r={13} fill={S} />
          <Circle cx={112} cy={84.5} r={4} fill={CARD} />
          <Path
            d="M104.5 95.5c1.8-3.6 4.4-5.2 7.5-5.2s5.7 1.6 7.5 5.2"
            stroke={CARD}
            strokeWidth={2}
            strokeLinecap="round"
          />
          <Circle
            cx={131}
            cy={80}
            r={11}
            fill={CARD}
            stroke={S}
            strokeWidth={1.5}
          />
          <Circle cx={131} cy={77} r={3.4} stroke={S} strokeWidth={1.4} />
          <Path
            d="M124.8 86.4c1.5-2.9 3.6-4.2 6.2-4.2s4.7 1.3 6.2 4.2"
            stroke={S}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </G>
      )}
    </Svg>
  );
}
