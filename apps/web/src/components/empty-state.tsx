/**
 * Small black-and-white illustrations for the library pages' empty tables —
 * one per kind of item. Drawn with design tokens so they follow light/dark mode.
 */
import type { ReactNode } from "react";

export type EmptyKind = "page" | "canvas" | "project" | "notebook" | "shared";

/**
 * What goes inside an empty library table: the picture, the message's first
 * sentence as a bold title, the rest as help text, then the create button.
 */
export function EmptyTableState({
  kind,
  message,
  action,
}: {
  kind: EmptyKind;
  message: string;
  action?: ReactNode;
}) {
  const split = message.indexOf(". ");
  const title = split === -1 ? message : message.slice(0, split + 1);
  const body = split === -1 ? "" : message.slice(split + 2);
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center whitespace-normal md:py-16">
      <EmptyIllustration kind={kind} className="h-32 w-44" />
      <h2 className="text-foreground-strong mt-6 text-lg font-semibold tracking-tight">
        {title}
      </h2>
      {body ? (
        <p className="text-muted-foreground mt-1.5 max-w-sm text-sm leading-relaxed">
          {body}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

const S = "var(--foreground-strong)";
const SUBTLE = "var(--foreground-subtle)";
const CARD = "var(--card)";
const FILL = "var(--muted)";

/** A document card at (x, y) with text lines. */
function Doc({
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
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={7}
        fill={CARD}
        stroke={S}
        strokeWidth={1.5}
      />
      <rect x={x + 9} y={y + 11} width={w * 0.5} height={5} rx={2.5} fill={S} />
      {Array.from({ length: lines }, (_, i) => (
        <rect
          key={i}
          x={x + 9}
          y={y + 24 + i * 9}
          width={(w - 18) * [1, 0.85, 0.95, 0.6][i % 4]!}
          height={3.5}
          rx={1.75}
          fill={SUBTLE}
        />
      ))}
    </g>
  );
}

export function EmptyIllustration({
  kind,
  className,
}: {
  kind: EmptyKind;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 176 128"
      className={className}
      aria-hidden
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx={88} cy={66} rx={70} ry={54} fill={FILL} />
      {kind === "page" ? (
        <>
          <Doc x={60} y={24} w={58} h={80} lines={4} />
          <rect
            x={69}
            y={86}
            width={8}
            height={8}
            rx={2}
            stroke={S}
            strokeWidth={1.5}
            fill={CARD}
          />
          <path d="M71 90l1.6 1.6 3-3.4" stroke={S} strokeWidth={1.4} />
          <rect
            x={81}
            y={88.5}
            width={26}
            height={3.5}
            rx={1.75}
            fill={SUBTLE}
          />
        </>
      ) : kind === "canvas" ? (
        <>
          <rect
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
              <circle
                key={`${cx}-${cy}`}
                cx={cx}
                cy={cy}
                r={0.9}
                fill={SUBTLE}
              />
            )),
          )}
          <rect
            x={48}
            y={44}
            width={30}
            height={20}
            rx={5}
            fill={CARD}
            stroke={S}
            strokeWidth={1.5}
          />
          <ellipse
            cx={116}
            cy={54}
            rx={16}
            ry={10}
            fill={CARD}
            stroke={S}
            strokeWidth={1.5}
          />
          <path d="M78 54h20m-4-3.5 4 3.5-4 3.5" stroke={S} strokeWidth={1.5} />
          <path
            d="M116 64v14m-3.5-4 3.5 4 3.5-4"
            stroke={S}
            strokeWidth={1.5}
          />
          <rect
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
        </>
      ) : kind === "project" ? (
        <>
          <Doc x={34} y={28} w={50} h={72} lines={4} />
          <rect
            x={92}
            y={28}
            width={50}
            height={72}
            rx={7}
            fill={CARD}
            stroke={S}
            strokeWidth={1.5}
          />
          <rect
            x={101}
            y={40}
            width={20}
            height={14}
            rx={4}
            stroke={S}
            strokeWidth={1.5}
          />
          <circle cx={125} cy={74} r={9} stroke={S} strokeWidth={1.5} />
          <path d="M111 54v12l6 4" stroke={S} strokeWidth={1.5} />
        </>
      ) : kind === "notebook" ? (
        <>
          <rect
            x={48}
            y={22}
            width={80}
            height={86}
            rx={8}
            fill={CARD}
            stroke={S}
            strokeWidth={1.5}
          />
          <path d="M60 22v86" stroke={S} strokeWidth={1.5} />
          {[38, 56, 74].map((y, i) => (
            <g key={y}>
              <rect
                x={70}
                y={y}
                width={10}
                height={10}
                rx={2.5}
                stroke={S}
                strokeWidth={1.3}
                fill={i === 1 ? FILL : CARD}
              />
              <rect
                x={86}
                y={y + 3.2}
                width={[30, 24, 28][i]!}
                height={3.5}
                rx={1.75}
                fill={SUBTLE}
              />
            </g>
          ))}
          <rect x={70} y={92} width={30} height={3.5} rx={1.75} fill={SUBTLE} />
        </>
      ) : (
        <>
          <Doc x={46} y={22} w={58} h={78} lines={4} />
          <circle cx={112} cy={88} r={13} fill={S} />
          <circle cx={112} cy={84.5} r={4} fill={CARD} />
          <path
            d="M104.5 95.5c1.8-3.6 4.4-5.2 7.5-5.2s5.7 1.6 7.5 5.2"
            stroke={CARD}
            strokeWidth={2}
          />
          <circle
            cx={131}
            cy={80}
            r={11}
            fill={CARD}
            stroke={S}
            strokeWidth={1.5}
          />
          <circle cx={131} cy={77} r={3.4} stroke={S} strokeWidth={1.4} />
          <path
            d="M124.8 86.4c1.5-2.9 3.6-4.2 6.2-4.2s4.7 1.3 6.2 4.2"
            stroke={S}
            strokeWidth={1.4}
          />
        </>
      )}
    </svg>
  );
}
