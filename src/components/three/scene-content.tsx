import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

export type SceneVariant = "hero" | "particles" | "loader" | "orb";

const ACCENT = "#2fa37a";
const INK = "#0f3d2e";
const SAND = "#e7e0cf";

/** Slow pointer-follow parallax applied to the whole scene group. */
function ParallaxGroup({
  children,
  strength = 0.25,
}: {
  children: React.ReactNode;
  strength?: number;
}) {
  const ref = useRef<THREE.Group>(null);
  const { pointer } = useThree();

  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const k = Math.min(1, delta * 3);
    g.rotation.y += (pointer.x * strength - g.rotation.y) * k;
    g.rotation.x += (-pointer.y * strength * 0.6 - g.rotation.x) * k;
  });

  return <group ref={ref}>{children}</group>;
}

/** A single floating "book": a thin rounded box with a spine-coloured edge. */
function Book({
  position,
  color,
  scale = 1,
  speed = 1,
  phase = 0,
}: {
  position: [number, number, number];
  color: string;
  scale?: number;
  speed?: number;
  phase?: number;
}) {
  const ref = useRef<THREE.Group>(null);

  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime * speed + phase;
    g.position.y = position[1] + Math.sin(t) * 0.18;
    g.rotation.z = Math.sin(t * 0.6) * 0.18;
    g.rotation.y = t * 0.25;
  });

  return (
    <group ref={ref} position={position} scale={scale}>
      <mesh castShadow>
        <boxGeometry args={[0.9, 1.2, 0.16]} />
        <meshStandardMaterial color={color} roughness={0.45} metalness={0.12} />
      </mesh>
      <mesh position={[-0.47, 0, 0]}>
        <boxGeometry args={[0.06, 1.22, 0.18]} />
        <meshStandardMaterial color={INK} roughness={0.6} />
      </mesh>
    </group>
  );
}

/** Central knot representing the adaptive loop of study → revision → practice. */
function StudyCore({ lite }: { lite: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.25;
      ref.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.35) * 0.2;
    }
    if (ring.current) ring.current.rotation.z += delta * 0.4;
  });

  return (
    <group>
      <mesh ref={ref} castShadow>
        <torusKnotGeometry args={[0.95, 0.3, lite ? 90 : 180, lite ? 14 : 28]} />
        <meshStandardMaterial color={ACCENT} roughness={0.25} metalness={0.35} />
      </mesh>
      <mesh ref={ring} rotation={[Math.PI / 2.2, 0, 0]}>
        <torusGeometry args={[1.9, 0.02, 8, 96]} />
        <meshStandardMaterial color={INK} roughness={0.6} />
      </mesh>
    </group>
  );
}

/** Drifting particle field used behind the auth screen. */
function Particles({ count }: { count: number }) {
  const ref = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      arr[i * 3] = (Math.random() - 0.5) * 12;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 8;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    return arr;
  }, [count]);

  useFrame((state, delta) => {
    if (!ref.current) return;
    ref.current.rotation.y += delta * 0.05;
    ref.current.position.y = Math.sin(state.clock.elapsedTime * 0.2) * 0.2;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={ACCENT} size={0.06} sizeAttenuation transparent opacity={0.7} />
    </points>
  );
}

/** Compact spinner used while the syllabus is being parsed. */
function LoaderShape() {
  const ref = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (!ref.current) return;
    ref.current.rotation.y += delta * 1.4;
    ref.current.rotation.x = Math.sin(state.clock.elapsedTime) * 0.4;
  });
  return (
    <group ref={ref}>
      <mesh>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={ACCENT} roughness={0.3} metalness={0.3} flatShading />
      </mesh>
      <mesh scale={1.35}>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={INK} wireframe transparent opacity={0.25} />
      </mesh>
    </group>
  );
}

/** Slow rotating open document/book used beside the PDF upload zone. */
function DocumentShape({ active }: { active: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    g.rotation.y += delta * (active ? 1.1 : 0.3);
    g.position.y = Math.sin(t * 0.9) * 0.12;
    const target = active ? 0.78 : 1;
    g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, target, Math.min(1, delta * 3)));
    g.position.z = THREE.MathUtils.lerp(g.position.z, active ? -1.2 : 0, Math.min(1, delta * 2));
  });

  return (
    <group ref={ref} rotation={[0.35, 0.5, 0]}>
      <mesh rotation={[0, -0.35, 0]} position={[-0.45, 0, 0]}>
        <boxGeometry args={[0.9, 1.15, 0.04]} />
        <meshStandardMaterial color={SAND} roughness={0.8} />
      </mesh>
      <mesh rotation={[0, 0.35, 0]} position={[0.45, 0, 0]}>
        <boxGeometry args={[0.9, 1.15, 0.04]} />
        <meshStandardMaterial color={SAND} roughness={0.8} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.12, 1.2, 0.16]} />
        <meshStandardMaterial color={ACCENT} roughness={0.4} metalness={0.2} />
      </mesh>
    </group>
  );
}

function SceneBody({ variant, lite, active }: { variant: SceneVariant; lite: boolean; active: boolean }) {
  if (variant === "particles") return <Particles count={lite ? 120 : 320} />;
  if (variant === "loader") return <LoaderShape />;
  if (variant === "orb") return <DocumentShape active={active} />;

  return (
    <ParallaxGroup strength={lite ? 0.12 : 0.3}>
      <StudyCore lite={lite} />
      <Book position={[-2.3, 0.6, -0.6]} color={ACCENT} scale={0.85} speed={0.7} />
      <Book position={[2.3, -0.3, -0.4]} color={SAND} scale={0.75} speed={0.55} phase={1.5} />
      {!lite && <Book position={[1.6, 1.3, -1.4]} color={INK} scale={0.6} speed={0.9} phase={2.6} />}
      {!lite && <Book position={[-1.7, -1.2, -1.1]} color={SAND} scale={0.55} speed={0.8} phase={3.4} />}
    </ParallaxGroup>
  );
}

/**
 * Client-only WebGL scene. Rendered lazily so three.js never enters the
 * initial bundle or the SSR pass.
 */
export default function SceneContent({
  variant,
  lite = false,
  active = false,
}: {
  variant: SceneVariant;
  lite?: boolean;
  active?: boolean;
}) {
  return (
    <Canvas
      dpr={lite ? 1 : [1, 1.6]}
      camera={{ position: [0, 0, variant === "hero" ? 6 : 4.2], fov: 45 }}
      gl={{ antialias: !lite, alpha: true, powerPreference: "high-performance" }}
      frameloop="always"
    >
      <ambientLight intensity={0.85} />
      <directionalLight position={[3, 4, 5]} intensity={1.1} />
      <directionalLight position={[-4, -2, -3]} intensity={0.35} color={ACCENT} />
      <SceneBody variant={variant} lite={lite} active={active} />
    </Canvas>
  );
}
