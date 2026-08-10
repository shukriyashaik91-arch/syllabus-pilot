import { Suspense, lazy } from "react";
import { cn } from "@/lib/utils";
import { useCanRender3D } from "@/hooks/use-motion-prefs";
import type { SceneVariant } from "./scene-content";

const SceneContent = lazy(() => import("./scene-content"));

interface Scene3DProps {
  variant: SceneVariant;
  className?: string;
  /** Static gradient shown when WebGL is unavailable or motion is reduced. */
  fallbackClassName?: string;
  /** Extra animation state (e.g. a PDF being ingested). */
  active?: boolean;
}

/**
 * Shared entry point for every 3D visual in the app. Lazy-loads three.js,
 * skips WebGL entirely for reduced-motion / unsupported devices, and renders a
 * calm gradient fallback instead.
 */
export function Scene3D({ variant, className, fallbackClassName, active }: Scene3DProps) {
  const { enabled, lite } = useCanRender3D();

  const fallback = (
    <div
      aria-hidden
      className={cn(
        "size-full rounded-[inherit] bg-[radial-gradient(circle_at_35%_30%,color-mix(in_oklab,var(--color-accent)_38%,transparent),transparent_60%),radial-gradient(circle_at_70%_70%,color-mix(in_oklab,var(--color-primary)_28%,transparent),transparent_55%)]",
        fallbackClassName,
      )}
    />
  );

  return (
    <div aria-hidden className={cn("pointer-events-none select-none", className)}>
      {enabled ? (
        <Suspense fallback={fallback}>
          <SceneContent variant={variant} lite={lite} active={active ?? false} />
        </Suspense>
      ) : (
        fallback
      )}
    </div>
  );
}
