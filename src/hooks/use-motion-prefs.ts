import { useEffect, useState } from "react";

/** True once the component has hydrated on the client. */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

/** Respects the user's prefers-reduced-motion setting. */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return reduced;
}

/**
 * Decides whether a WebGL scene should render at all: needs a client, WebGL
 * support and no reduced-motion preference. Mobile gets a lighter scene.
 */
export function useCanRender3D() {
  const hydrated = useHydrated();
  const reduced = usePrefersReducedMotion();
  const [supported, setSupported] = useState(false);
  const [lite, setLite] = useState(false);

  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      setSupported(Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl")));
    } catch {
      setSupported(false);
    }
    setLite(window.matchMedia("(max-width: 768px)").matches);
  }, []);

  return { enabled: hydrated && supported && !reduced, lite, reduced, hydrated };
}
