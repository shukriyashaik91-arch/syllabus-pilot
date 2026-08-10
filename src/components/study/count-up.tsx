import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/use-motion-prefs";

/** Animates a number towards its new value whenever the statistic changes. */
export function CountUp({
  value,
  decimals = 0,
  duration = 700,
  suffix = "",
}: {
  value: number;
  decimals?: number;
  duration?: number;
  suffix?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    if (from === value) return;
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduced]);

  useEffect(() => {
    fromRef.current = value;
  }, [value]);

  return <>{display.toFixed(decimals)}{suffix}</>;
}
