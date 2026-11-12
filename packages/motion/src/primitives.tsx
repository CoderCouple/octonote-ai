import { Children, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject, type SVGProps } from "react";

export const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/** True when the viewer asked the system for less motion. */
export function useReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => typeof matchMedia === "function" && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const list = matchMedia(query);
    const update = () => setReduced(list.matches);
    list.addEventListener?.("change", update);
    return () => list.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

/** True once the element has scrolled into view (or right away where that can't be observed). */
export function useInView(ref: RefObject<Element | null>, { once = true, margin = "0px 0px -10% 0px" } = {}): boolean {
  const [inView, setInView] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) setInView(false);
      },
      { rootMargin: margin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, once, margin]);
  return inView;
}

interface RevealProps {
  children: ReactNode;
  /** Milliseconds before it starts. */
  delay?: number;
  duration?: number;
  /** Start playing now instead of when scrolled into view. */
  immediate?: boolean;
  className?: string;
}

const offsets = { up: "0, 16px", down: "0, -16px", left: "16px, 0", right: "-16px, 0", none: "0, 0" } as const;

/** Fades in, optionally sliding from a direction, when it comes into view. */
export function FadeIn({ children, delay = 0, duration = 500, from = "up", immediate, className }: RevealProps & { from?: keyof typeof offsets }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  const reduced = useReducedMotion();
  const shown = immediate || seen || reduced;
  const style: CSSProperties = {
    opacity: shown ? 1 : 0,
    transform: shown ? "none" : `translate(${offsets[from]})`,
    transition: reduced ? "none" : `opacity ${duration}ms var(--mo-ease) ${delay}ms, transform ${duration}ms var(--mo-ease) ${delay}ms`,
  };
  return (
    <div ref={ref} className={cx("mo-reveal", className)} style={style}>
      {children}
    </div>
  );
}

/** Slides in from a side; a shorthand for FadeIn with a direction. */
export function SlideIn({ from = "left", ...props }: RevealProps & { from?: "up" | "down" | "left" | "right" }) {
  return <FadeIn from={from} {...props} />;
}

/** Scales up from slightly smaller. */
export function ScaleIn({ children, delay = 0, duration = 420, immediate, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  const reduced = useReducedMotion();
  const shown = immediate || seen || reduced;
  return (
    <div
      ref={ref}
      className={cx("mo-reveal", className)}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "scale(0.92)",
        transition: reduced ? "none" : `opacity ${duration}ms var(--mo-ease) ${delay}ms, transform ${duration}ms var(--mo-spring) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/** Reveals its children one after another. */
export function Stagger({ children, interval = 90, delay = 0, from = "up", immediate, className }: Omit<RevealProps, "duration"> & { interval?: number; from?: keyof typeof offsets }) {
  return (
    <div className={className}>
      {Children.toArray(children).map((child, i) => (
        <FadeIn key={i} delay={delay + i * interval} from={from} immediate={immediate}>
          {child}
        </FadeIn>
      ))}
    </div>
  );
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** A number that eases to `to` whenever it changes. Jumps straight there with reduced motion. */
export function useCountUp(to: number, duration = 1200, from?: number): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(from ?? to);
  const current = useRef(value);
  useEffect(() => {
    const start = current.current;
    if (reduced || start === to || typeof requestAnimationFrame !== "function") {
      current.current = to;
      setValue(to);
      return;
    }
    const began = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - began) / duration);
      const next = start + (to - start) * easeOutCubic(t);
      current.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [to, duration, reduced]);
  return value;
}

/** Animates a number from `from` (or its last value) to `to`. Screen readers get the final value. */
export function CountUp({
  to,
  from,
  duration = 1200,
  format = (n: number) => Math.round(n).toLocaleString(),
  className,
}: {
  to: number;
  from?: number;
  duration?: number;
  format?: (value: number) => string;
  className?: string;
}) {
  const value = useCountUp(to, duration, from);
  return (
    <span className={className} aria-label={format(to)}>
      <span aria-hidden="true">{format(value)}</span>
    </span>
  );
}

/** Draws an SVG path as if by pen. Put it inside an <svg>. */
export function DrawPath({ d, duration = 900, delay = 0, drawn = true, className, ...rest }: { d: string; duration?: number; delay?: number; drawn?: boolean; className?: string } & SVGProps<SVGPathElement>) {
  const reduced = useReducedMotion();
  return (
    <path
      d={d}
      pathLength={1}
      className={cx("mo-draw", className)}
      style={{ strokeDasharray: 1, strokeDashoffset: drawn ? 0 : 1, transition: reduced ? "none" : `stroke-dashoffset ${duration}ms var(--mo-ease) ${delay}ms` }}
      {...rest}
    />
  );
}

/** Types text out letter by letter. Screen readers get the whole text at once. */
export function Typewriter({ text, speed = 28, delay = 0, className }: { text: string; speed?: number; delay?: number; className?: string }) {
  const reduced = useReducedMotion();
  const [count, setCount] = useState(reduced ? text.length : 0);
  useEffect(() => {
    if (reduced) return setCount(text.length);
    setCount(0);
    let timer: ReturnType<typeof setTimeout>;
    const start = setTimeout(function next() {
      setCount((c) => {
        if (c < text.length) timer = setTimeout(next, speed);
        return Math.min(c + 1, text.length);
      });
    }, delay);
    return () => {
      clearTimeout(start);
      clearTimeout(timer);
    };
  }, [text, speed, delay, reduced]);
  return (
    <span className={cx("mo-typewriter", className)} aria-label={text}>
      <span aria-hidden="true">{text.slice(0, count)}</span>
      {count < text.length ? <span className="mo-caret" aria-hidden="true" /> : null}
    </span>
  );
}

/** Pulses a soft ring around its child while `active`. */
export function Highlight({ active = true, children, className }: { active?: boolean; children: ReactNode; className?: string }) {
  return <span className={cx("mo-highlight", active && "mo-highlight--active", className)}>{children}</span>;
}
