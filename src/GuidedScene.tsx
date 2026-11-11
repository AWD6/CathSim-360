import { Suspense, useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Line, OrbitControls, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { SceneKind, LearningMode } from './guided';
import { bagStatus, drainTick } from './simulation';

type V = [number, number, number];
type Props = {
  topic: SceneKind;
  visual: number;
  paused: boolean;
  speaking?: boolean;
  mode?: LearningMode;
  sex?: 'female' | 'male';
  onSexChange?: (sex: 'female' | 'male') => void;
  onOpenHandVideo?: () => void;
  onAction?: (action: string) => void;
};

const skinTone = '#eac7b2';
const siliconeMannequin = '#e5beab';
const tapeColor = '#ffffff';

function Block({
  p,
  s,
  c,
  onClick,
  opacity = 1,
  transparent = false
}: {
  p: V;
  s: V;
  c: string;
  onClick?: () => void;
  opacity?: number;
  transparent?: boolean;
}) {
  return (
    <RoundedBox
      args={s}
      position={p}
      radius={Math.min(...s) / 4}
      smoothness={3}
      castShadow
      onPointerDown={
        onClick
          ? (e) => {
              e.stopPropagation();
            }
          : undefined
      }
      onClick={
        onClick
          ? (e) => {
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
    >
      <meshStandardMaterial color={c} roughness={0.55} opacity={opacity} transparent={transparent} />
    </RoundedBox>
  );
}

function Ball({
  p,
  s = [1, 1, 1],
  c,
  onClick,
  opacity = 1,
  transparent = false
}: {
  p: V;
  s?: V;
  c: string;
  onClick?: () => void;
  opacity?: number;
  transparent?: boolean;
}) {
  return (
    <mesh
      position={p}
      scale={s}
      castShadow
      onPointerDown={
        onClick
          ? (e) => {
              e.stopPropagation();
            }
          : undefined
      }
      onClick={
        onClick
          ? (e) => {
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
    >
      <sphereGeometry args={[1, 32, 24]} />
      <meshStandardMaterial color={c} roughness={0.5} opacity={opacity} transparent={transparent} />
    </mesh>
  );
}

function ArticulatedHand({
  p,
  r = [0, 0, 0],
  scale = 1,
  isLeft = false
}: {
  p: V;
  r?: V;
  scale?: number;
  isLeft?: boolean;
}) {
  const thumbX = isLeft ? -0.16 : 0.16;
  return (
    <group position={p} rotation={r} scale={scale}>
      <Block p={[0, 0, 0]} s={[0.26, 0.32, 0.09]} c={skinTone} />
      {[-0.09, -0.03, 0.03, 0.09].map((fx, i) => (
        <Block key={fx} p={[fx, 0.24 - Math.abs(i - 1.5) * 0.02, 0]} s={[0.05, 0.22, 0.075]} c={skinTone} />
      ))}
      <Block p={[thumbX, 0.04, 0.02]} s={[0.11, 0.17, 0.08]} c={skinTone} />
      <Block p={[0, -0.24, 0]} s={[0.2, 0.2, 0.1]} c={skinTone} />
    </group>
  );
}

function Room() {
  return (
    <group>
      <Block p={[0, -0.12, 0]} s={[7.5, 0.2, 5.5]} c="#e6dfd5" />
      <Block p={[0, 2.0, -2.1]} s={[7.5, 4.2, 0.12]} c="#dceee7" />
      <Block p={[-3.6, 2.0, 0]} s={[0.12, 4.2, 5.2]} c="#e7f1eb" />
      <Block p={[-1.9, 2.4, -2.0]} s={[1.9, 1.6, 0.08]} c="#ffffff" />
      <Block p={[-1.9, 2.4, -1.94]} s={[1.7, 1.4, 0.04]} c="#bae6fd" />
      <Block p={[-1.9, 2.4, -1.9]} s={[0.05, 1.4, 0.02]} c="#ffffff" />
      <Block p={[-1.9, 2.4, -1.9]} s={[1.7, 0.05, 0.02]} c="#ffffff" />
      <Block p={[2.0, 0.45, -1.2]} s={[0.8, 0.9, 0.7]} c="#bccdc2" />
      <Block p={[2.0, 0.92, -1.2]} s={[0.9, 0.06, 0.8]} c="#ffffff" />
      <Block p={[2.0, 1.25, -1.2]} s={[0.05, 0.6, 0.05]} c="#b09b7c" />
      <mesh position={[2.0, 1.55, -1.2]}>
        <coneGeometry args={[0.32, 0.4, 32, 1, true]} />
        <meshStandardMaterial color="#fff3d1" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Patient({
  tape,
  chooseTape,
  onToggleSlack,
  activeSex = 'female',
  isSecureTopic = false
}: {
  tape: number;
  slackMode: boolean;
  chooseTape: (thigh: number) => void;
  onToggleSlack: () => void;
  activeSex?: 'female' | 'male';
  isSecureTopic?: boolean;
}) {
  return (
    <group position={[0, 0, 0]}>
      <Block p={[-0.65, 0.75, -0.35]} s={[1.45, 0.22, 2.1]} c="#8aa89c" />
      <Block p={[-0.65, 0.93, -0.35]} s={[1.4, 0.2, 2.05]} c="#ffffff" />
      {[-1.25, -0.05].map((bx) => (
        <group key={bx}>
          <Block p={[bx, 0.38, -1.25]} s={[0.08, 0.76, 0.08]} c="#6d8a7f" />
          <Block p={[bx, 0.38, 0.55]} s={[0.08, 0.76, 0.08]} c="#6d8a7f" />
        </group>
      ))}
      <Block p={[-0.65, 1.45, -1.35]} s={[1.45, 1.2, 0.12]} c="#c1d6cc" />

      <Block p={[-0.65, 1.06, -0.9]} s={[0.8, 0.14, 0.5]} c="#e2e8f0" />
      <Ball p={[-0.65, 2.45, -0.15]} s={[0.26, 0.3, 0.25]} c={skinTone} />
      <Block p={[-0.65, 1.95, -0.15]} s={[0.74, 0.72, 0.38]} c="#cfe1f3" />
      <Block p={[-0.65, 1.58, 0.02]} s={[0.76, 0.26, 0.46]} c="#b9d2e7" />

      <mesh position={[-0.65, 1.62, 0.25]}>
        <boxGeometry args={[0.78, 0.035, 0.02]} />
        <meshStandardMaterial color="#0284c7" emissive="#0284c7" emissiveIntensity={0.3} />
      </mesh>

      {/* Male Suprapubic Tape Anchor (บริเวณหัวหน่าวหรือท้องน้อย) */}
      {isSecureTopic && activeSex === 'male' && tape > 0 && (
        <group position={[-0.55, 1.74, 0.36]}>
          <Block p={[0, 0, 0]} s={[0.32, 0.04, 0.22]} c={tapeColor} onClick={onToggleSlack} />
          <Block p={[0, 0.025, 0]} s={[0.30, 0.015, 0.04]} c="#38bdf8" />
        </group>
      )}

      {[-1.0, -0.3].map((tx, idx) => {
        const thighNum = idx + 1;
        const isTaped = tape === thighNum;
        return (
          <group key={tx}>
            <Block
              p={[tx, 1.35, 0.33]}
              s={[0.32, 0.36, 0.92]}
              c={skinTone}
              onClick={() => chooseTape(thighNum)}
            />
            <Block p={[tx, 0.7, 0.7]} s={[0.26, 1.0, 0.26]} c={skinTone} />
            <Block p={[tx, 0.18, 0.84]} s={[0.28, 0.16, 0.46]} c="#cbd5e1" />

            {/* Female or General Thigh Tape (แปะหน้าขา) */}
            {isTaped && !(isSecureTopic && activeSex === 'male') && (
              <group position={[tx, 1.535, 0.44]}>
                <Block p={[0, 0, 0]} s={[0.3, 0.035, 0.22]} c={tapeColor} onClick={onToggleSlack} />
                <Block p={[0, 0.02, 0]} s={[0.28, 0.01, 0.04]} c="#38bdf8" />
              </group>
            )}
          </group>
        );
      })}

      {[-1.15, -0.15].map((ax) => (
        <Block key={ax} p={[ax, 1.82, -0.1]} s={[0.18, 0.65, 0.22]} c={skinTone} />
      ))}

      <Ball p={[-0.65, 1.48, 0.25]} s={[0.09, 0.09, 0.05]} c="#0d9488" />
    </group>
  );
}

function DrainageBag({
  h,
  fill,
  valve,
  onValve,
  onSelect,
  stowed,
  onStow,
  fluidColor = '#f59e0b',
  draggable = false
}: {
  h: number;
  fill: number;
  valve: boolean;
  onValve: () => void;
  onSelect: () => void;
  wipe?: boolean;
  stowed?: boolean;
  onWipe?: () => void;
  onStow?: () => void;
  fluidColor?: string;
  draggable?: boolean;
}) {
  return (
    <group
      position={[0.82, h, 0.58]}
      onPointerDown={
        draggable
          ? undefined
          : (e) => {
              e.stopPropagation();
            }
      }
    >
      <RoundedBox
        args={[0.66, 0.76, 0.14]}
        radius={0.08}
        onPointerDown={
          draggable
            ? undefined
            : (e) => {
                e.stopPropagation();
              }
        }
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <meshPhysicalMaterial
          color="#d5f2f0"
          transparent
          opacity={0.65}
          roughness={0.12}
          transmission={0.4}
          ior={1.3}
        />
      </RoundedBox>

      <Block p={[0, -0.32 + fill * 0.3, 0]} s={[0.55, Math.max(0.015, fill * 0.6), 0.08]} c={fluidColor} />
      <Block p={[0, 0.38, 0]} s={[0.68, 0.08, 0.15]} c="#0d9488" />
      <Block p={[0, 0.44, 0]} s={[0.12, 0.12, 0.12]} c="#14b8a6" />

      {[0, 1, 2, 3].map((gi) => (
        <Block key={gi} p={[0.16, -0.24 + gi * 0.14, 0.085]} s={[0.14, 0.014, 0.01]} c="#0f766e" />
      ))}

      <Block p={[0, -0.45, 0]} s={[0.08, 0.22, 0.08]} c="#fef08a" />

      <group rotation={[0, 0, valve ? Math.PI / 2 : 0]} position={[0, -0.55, 0]}>
        <Block p={[0, 0, 0]} s={[0.26, 0.08, 0.15]} c={valve ? '#f59e0b' : '#0d9488'} onClick={onValve} />
        <mesh
          onClick={(e) => {
            e.stopPropagation();
            onValve();
          }}
        >
          <sphereGeometry args={[0.22, 12, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>

      <group
        position={[0.24, -0.42, 0.08]}
        onClick={
          onStow
            ? (e) => {
                e.stopPropagation();
                onStow();
              }
            : undefined
        }
      >
        <Block p={[0, 0, 0]} s={[0.14, 0.12, 0.06]} c={stowed ? '#10b981' : '#94a3b8'} />
      </group>

      {stowed && <Block p={[0.24, -0.36, 0.09]} s={[0.06, 0.16, 0.06]} c="#fef08a" />}
    </group>
  );
}

// Cute Minimalist Cartoon 3D Nurse Nong Four (Requirement 5 & 6: ตาการ์ตูนน่ารักใสๆ ปากไม่แดง มัดรวบใส่เน็ต หมวกขีดเดียว ขยับปากยิ้มแย้มตอนพูด)
function NurseModel({ paused, speaking = false }: { paused: boolean; speaking?: boolean }) {
  const arm = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const mouth = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (paused) return;
    const t = clock.elapsedTime;
    if (head.current) {
      head.current.rotation.z = Math.sin(t * 1.1) * 0.035;
      head.current.position.y = 2.18 + Math.sin(t * 1.8) * 0.012;
    }
    if (arm.current) {
      arm.current.rotation.z = 0.28 + Math.sin(t * 2.0) * 0.12;
    }
    if (eyes.current) {
      const blinkCycle = t % 4.0;
      eyes.current.scale.y = blinkCycle > 3.82 && blinkCycle < 3.96 ? 0.08 : 1.0;
    }
    if (mouth.current) {
      if (speaking) {
        const talk = 0.35 + Math.abs(Math.sin(t * 11.5)) * 0.65;
        mouth.current.scale.set(0.032, 0.008 + talk * 0.014, 0.012);
        mouth.current.visible = true;
      } else {
        mouth.current.visible = false;
      }
    }
  });

  const fairSkin = '#fce8d8';
  const darkHair = '#2c221e';

  return (
    <group position={[-1.9, 0, -0.2]} scale={0.76}>
      {/* Minimalist White Collared Nurse Dress/Coat */}
      <Block p={[0, 1.42, 0]} s={[0.62, 1.16, 0.38]} c="#ffffff" />
      {/* Minimalist Lapel Collar */}
      <Block p={[-0.12, 1.94, 0.18]} s={[0.16, 0.12, 0.04]} c="#f1f7f5" />
      <Block p={[0.12, 1.94, 0.18]} s={[0.16, 0.12, 0.04]} c="#f1f7f5" />
      {/* Subtle Minimal Name Tag */}
      <Block p={[0.17, 1.72, 0.2]} s={[0.14, 0.07, 0.02]} c="#e2f1ed" />

      {/* Cute Chibi/Cartoon Head Group */}
      <group ref={head} position={[0, 2.18, 0]}>
        {/* Hair Crown */}
        <Ball p={[0, 0.05, -0.02]} s={[0.36, 0.38, 0.34]} c={darkHair} />
        {/* Neatly Tied Back Bun inside Dark Hairnet */}
        <Ball p={[0, -0.04, -0.32]} s={[0.18, 0.17, 0.16]} c="#1e1714" />
        {/* Soft Rounded Cartoon Face */}
        <Ball p={[0, -0.01, 0.08]} s={[0.32, 0.33, 0.27]} c={fairSkin} />

        {/* Cute Side-Swept Front Bangs */}
        <Ball p={[-0.14, 0.18, 0.24]} s={[0.18, 0.11, 0.1]} c={darkHair} />
        <Ball p={[0.14, 0.18, 0.24]} s={[0.18, 0.11, 0.1]} c={darkHair} />

        {/* Soft Pastel Peach Blush (แต่งหน้าบางอ่อน) */}
        <Ball p={[-0.16, -0.05, 0.31]} s={[0.055, 0.032, 0.015]} c="#f4b6ac" />
        <Ball p={[0.16, -0.05, 0.31]} s={[0.055, 0.032, 0.015]} c="#f4b6ac" />

        {/* Cute Big Sparkling Cartoon Eyes (ตาการ์ตูนน่ารักใสๆ) */}
        <group ref={eyes} position={[0, 0.03, 0.32]}>
          {/* Left Eye */}
          <Ball p={[-0.11, 0, 0]} s={[0.045, 0.058, 0.02]} c="#2b211e" />
          <Ball p={[-0.095, 0.02, 0.016]} s={[0.018, 0.02, 0.01]} c="#ffffff" />
          <Ball p={[-0.12, -0.018, 0.015]} s={[0.009, 0.01, 0.01]} c="#ffffff" />
          {/* Right Eye */}
          <Ball p={[0.11, 0, 0]} s={[0.045, 0.058, 0.02]} c="#2b211e" />
          <Ball p={[0.125, 0.02, 0.016]} s={[0.018, 0.02, 0.01]} c="#ffffff" />
          <Ball p={[0.1, -0.018, 0.015]} s={[0.009, 0.01, 0.01]} c="#ffffff" />
        </group>

        {/* Soft Natural Peach Smile - NOT RED (ปากไม่แดง ยิ้มแย้ม ขยับเบาๆ ตอนพูด) */}
        <Line
          points={[
            [-0.045, -0.1, 0.34],
            [0, -0.122, 0.348],
            [0.045, -0.1, 0.34]
          ]}
          color="#c88a7e"
          lineWidth={2.2}
        />
        <mesh ref={mouth} position={[0, -0.114, 0.345]} visible={false}>
          <sphereGeometry args={[1, 16, 12]} />
          <meshStandardMaterial color="#d8887e" roughness={0.6} />
        </mesh>

        {/* Minimalist Nurse Cap with Single Top Stripe (หมวกพยาบาลมีขีดบนเส้นเดียว) */}
        <Block p={[0, 0.37, 0.06]} s={[0.48, 0.15, 0.22]} c="#ffffff" />
        <Block p={[0, 0.41, 0.175]} s={[0.42, 0.022, 0.015]} c="#2b7569" />
      </group>

      {/* Right Arm Waving Gently */}
      <group ref={arm} position={[0.35, 1.84, 0]}>
        <Block p={[0.1, -0.16, 0.04]} s={[0.18, 0.48, 0.18]} c="#ffffff" />
        <Ball p={[0.14, -0.42, 0.04]} s={[0.09, 0.1, 0.09]} c={fairSkin} />
      </group>

      {/* Left Arm Relaxed */}
      <group position={[-0.35, 1.72, 0]}>
        <Block p={[-0.04, -0.16, 0.04]} s={[0.18, 0.48, 0.18]} c="#ffffff" />
        <Ball p={[-0.04, -0.42, 0.04]} s={[0.09, 0.1, 0.09]} c={fairSkin} />
      </group>

      {/* Legs & White Nurse Shoes */}
      {[-0.16, 0.16].map((lx) => (
        <group key={lx}>
          <Block p={[lx, 0.45, 0]} s={[0.2, 0.82, 0.22]} c="#ffffff" />
          <Block p={[lx, 0.05, 0.04]} s={[0.21, 0.1, 0.3]} c="#f1f5f9" />
        </group>
      ))}
    </group>
  );
}

// Animated Soap Bubbles & Water Rinse (Requirement 14: ขึ้นอนิเมชั่นฟองสบู่ ราดน้ำแล้วให้สบู่ไหลออก)
function HygieneSoapAndWater({
  active,
  phase,
  sex
}: {
  active: boolean;
  phase: number; // 0 = mild soap lathering, 1 = water rinsing bubbles down, 2 = dry
  sex: 'female' | 'male';
}) {
  const bubblesRef = useRef<THREE.Group>(null);
  const waterStreamRef = useRef<THREE.Mesh>(null);
  const rinseProgress = useRef(0);

  useEffect(() => {
    if (phase === 0) {
      rinseProgress.current = 0;
    }
  }, [phase, sex]);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    if (phase === 1) {
      // Water rinsing: bubbles flow downward and wash off
      rinseProgress.current = Math.min(1.4, rinseProgress.current + delta * 0.45);
      // Loop the rinse effect every 3.2 seconds so the user can clearly watch the soap wash away
      if (rinseProgress.current >= 1.35) {
        rinseProgress.current = 0;
      }
    } else {
      rinseProgress.current = 0;
    }

    if (bubblesRef.current) {
      const p = rinseProgress.current;
      // Move bubbles down as water pours over them
      bubblesRef.current.position.y = phase === 1 ? -p * 0.65 : Math.sin(t * 3) * 0.015;
      bubblesRef.current.position.z = phase === 1 ? p * 0.08 : 0;
      const scaleFade = phase === 1 ? Math.max(0.01, 1 - p * 0.75) : 1 + Math.sin(t * 4) * 0.08;
      bubblesRef.current.scale.setScalar(scaleFade);
    }

    if (waterStreamRef.current) {
      waterStreamRef.current.position.y = 1.26 + Math.sin(t * 10) * 0.02;
    }
  });

  if (!active || phase === 2 || phase === 3) return null;

  const baseY = sex === 'female' ? 1.15 : 1.38;
  const baseZ = sex === 'female' ? 0.22 : 0.28;

  return (
    <group>
      {/* Animated Soap Foam Bubbles (ฟองสบู่อ่อน) */}
      {(phase === 0 || phase === 1) && (
        <group ref={bubblesRef}>
          {Array.from({ length: 26 }, (_, i) => {
            const angle = (i / 26) * Math.PI * 2;
            const radius = 0.04 + (i % 4) * 0.038;
            const bx = Math.cos(angle * 2.3) * radius;
            const by = baseY + Math.sin(angle * 1.7) * 0.16 - (i % 5) * 0.03;
            const bz = baseZ + (i % 3) * 0.025;
            const bSize = 0.022 + (i % 3) * 0.01;
            return (
              <Ball
                key={i}
                p={[bx, by, bz]}
                s={[bSize, bSize, bSize]}
                c={i % 2 === 0 ? '#ffffff' : '#ecfeff'}
                opacity={0.9}
                transparent
              />
            );
          })}
        </group>
      )}

      {/* Pouring Clean Water Stream washing away the soap (ราดน้ำสะอาดล้างฟองสบู่ไหลออก) */}
      {phase === 1 && (
        <group>
          <mesh ref={waterStreamRef} position={[0, 1.26, baseZ + 0.08]}>
            <cylinderGeometry args={[0.025, 0.065, 0.75, 20]} />
            <meshStandardMaterial color="#7dd3fc" transparent opacity={0.62} roughness={0.15} />
          </mesh>
          {/* Water droplets / runoff */}
          {Array.from({ length: 10 }, (_, i) => (
            <Ball
              key={`drop-${i}`}
              p={[
                Math.sin(i * 2.1) * 0.1,
                0.75 - (i % 4) * 0.08,
                baseZ + 0.05
              ]}
              s={[0.018, 0.026, 0.018]}
              c="#bae6fd"
              opacity={0.75}
              transparent
            />
          ))}
        </group>
      )}
    </group>
  );
}

// Clinical Pelvic Training Mannequin for Genital Hygiene
function Pelvis({
  sex,
  wipe,
  phase,
  act
}: {
  sex: 'female' | 'male';
  wipe: boolean;
  phase: number; // 0 = mild soap, 1 = water rinse, 2 = pat dry, 3 = foreskin return
  act: () => void;
}) {
  const cloth = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (cloth.current) {
      if (sex === 'female') {
        // Strict single-direction wipe: Front to Back (หน้าไปหลัง)
        // Never wipe back and forth!
        const cycle = (clock.elapsedTime * 0.45) % 1; // 0.0 to 1.0
        if (cycle < 0.65) {
          // Stroke phase: Moving from Front (meatus/anterior y=1.30, z=0.20) to Back (posterior y=0.85, z=0.12) touching the surface
          const stroke = cycle / 0.65;
          cloth.current.position.y = 1.30 - stroke * 0.45;
          cloth.current.position.z = 0.20 - stroke * 0.08;
          cloth.current.rotation.x = -0.2;
        } else {
          // Lift-and-return phase: Lifts off the body (z moves outwards to 0.42) and returns to the top WITHOUT touching
          const ret = (cycle - 0.65) / 0.35;
          cloth.current.position.y = 0.85 + ret * 0.45;
          cloth.current.position.z = 0.20 + Math.sin(ret * Math.PI) * 0.22;
          cloth.current.rotation.x = -0.2 + Math.sin(ret * Math.PI) * 0.3;
        }
      } else {
        const t = (clock.elapsedTime * 0.5) % 1;
        cloth.current.position.x = Math.sin(t * Math.PI * 2) * 0.12;
        cloth.current.position.y = 1.32 + Math.cos(t * Math.PI * 2) * 0.08;
      }
    }
  });

  return (
    <group position={[0, 0.1, 0.35]}>
      <Block p={[0, 0.15, -0.1]} s={[1.8, 0.3, 1.4]} c="#ffffff" />
      <Block p={[0, 0.28, 0.45]} s={[1.4, 0.08, 0.2]} c="#0d9488" />

      <Block p={[0, 1.2, -0.18]} s={[1.35, 1.15, 0.45]} c={siliconeMannequin} />
      {[-0.5, 0.5].map((gx) => (
        <Block key={gx} p={[gx, 0.5, -0.1]} s={[0.42, 1.05, 0.5]} c={siliconeMannequin} />
      ))}
      <Block p={[0, 1.82, -0.13]} s={[1.4, 0.3, 0.5]} c="#99f6e4" />

      {sex === 'female' ? (
        <group>
          <Ball p={[-0.14, 1.13, 0.08]} s={[0.12, 0.3, 0.1]} c="#dba995" />
          <Ball p={[0.14, 1.13, 0.08]} s={[0.12, 0.3, 0.1]} c="#dba995" />
          <Ball p={[-0.06, 1.12, 0.14]} s={[0.06, 0.2, 0.06]} c="#cf9581" />
          <Ball p={[0.06, 1.12, 0.14]} s={[0.06, 0.2, 0.06]} c="#cf9581" />
          <Ball p={[0, 1.25, 0.16]} s={[0.03, 0.03, 0.02]} c="#8b5cf6" />
          <Line
            points={[
              [0, 1.25, 0.18],
              [0.08, 1.16, 0.32],
              [0.45, 1.0, 0.42],
              [1.0, 0.6, 0.3]
            ]}
            color="#cfad62"
            lineWidth={6}
          />
          <Ball p={[0, 1.08, 0.15]} s={[0.045, 0.07, 0.02]} c="#b07d6c" />
          <Ball p={[0, 0.72, 0.08]} s={[0.035, 0.035, 0.015]} c="#9c6858" />

          {/* Directional Single-Way Arrow Indicator: Front to Back Only (ทิศทางเดียว: ด้านหน้าไปด้านหลังเท่านั้น) */}
          <group position={[0.28, 1.05, 0.22]}>
            <Line points={[[0, 0.35, 0], [0, -0.35, 0]]} color="#0284c7" lineWidth={6} />
            <Line points={[[-0.07, -0.26, 0], [0, -0.35, 0], [0.07, -0.26, 0]]} color="#0284c7" lineWidth={6} />
            <mesh position={[0, 0, -0.01]}>
              <planeGeometry args={[0.06, 0.72]} />
              <meshBasicMaterial color="#38bdf8" transparent opacity={0.35} />
            </mesh>
          </group>
        </group>
      ) : (
        <group>
          <Block p={[0, 1.22, 0.2]} s={[0.22, 0.46, 0.26]} c="#d8ab94" />
          <Ball p={[0, 1.48, 0.21]} s={[0.14, 0.12, 0.15]} c="#ce9c84" />
          <mesh position={[0, phase === 3 ? 1.44 : 1.32, 0.2]}>
            <cylinderGeometry args={[0.13, 0.14, 0.12, 24]} />
            <meshStandardMaterial color="#c78f77" roughness={0.6} />
          </mesh>
          <Ball p={[0, 1.54, 0.22]} s={[0.03, 0.03, 0.02]} c="#8b5cf6" />
          <Line
            points={[
              [0, 1.54, 0.24],
              [0.15, 1.56, 0.38],
              [0.55, 1.12, 0.42],
              [1.0, 0.6, 0.3]
            ]}
            color="#cfad62"
            lineWidth={6}
          />
          <Ball p={[-0.11, 0.94, 0.1]} s={[0.15, 0.18, 0.12]} c={siliconeMannequin} />
          <Ball p={[0.11, 0.94, 0.1]} s={[0.15, 0.18, 0.12]} c={siliconeMannequin} />
        </group>
      )}

      <mesh
        position={[0, 1.2, 0.2]}
        onClick={(e) => {
          e.stopPropagation();
          act();
        }}
      >
        <boxGeometry args={[0.8, 0.9, 0.3]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Soap Foam & Water Rinse Animation */}
      <HygieneSoapAndWater active={wipe} phase={phase} sex={sex} />

      {/* Animated Washcloth / Hand */}
      {wipe && phase !== 1 && (
        <group ref={cloth}>
          <ArticulatedHand p={[-0.14, 0.08, 0.54]} r={[0, 0, -0.6]} scale={0.9} />
          <Block
            p={[0, 0, 0.42]}
            s={[0.26, 0.14, 0.05]}
            c={phase === 0 ? '#ecfdf5' : '#ffffff'}
          />
          {phase === 0 &&
            [-0.08, 0, 0.08].map((bx) => (
              <Ball key={bx} p={[bx, 0.06, 0.46]} s={[0.038, 0.038, 0.038]} c="#ffffff" />
            ))}
        </group>
      )}
    </group>
  );
}

// Hand Washing Simulation (IC 7 Steps: หน้า หลัง กลาง ปั้น โป้ง ปลาย ข้อ + Rinse & Dry)
function Washing({ phase, paused, act }: { phase: number; paused: boolean; act: () => void }) {
  const leftHand = useRef<THREE.Group>(null);
  const rightHand = useRef<THREE.Group>(null);
  const soapRunoffRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (paused) return;
    const t = clock.elapsedTime;
    const rubFast = Math.sin(t * 8.0) * 0.12;
    const rubMedium = Math.sin(t * 5.0) * 0.1;

    if (leftHand.current && rightHand.current) {
      if (phase === 0) {
        // 1. หน้า: ฝ่ามือถูกัน (Palm to palm)
        leftHand.current.position.set(-0.06, 1.1 + rubFast, 0.4);
        leftHand.current.rotation.set(0, 0, -1.2);
        rightHand.current.position.set(0.06, 1.1 - rubFast, 0.42);
        rightHand.current.rotation.set(0, Math.PI, 1.2);
      } else if (phase === 1) {
        // 2. หลัง: ฝ่ามือถูหลังมือและซอกนิ้ว (Palm over dorsum with interlaced fingers)
        leftHand.current.position.set(-0.05, 1.05, 0.4);
        leftHand.current.rotation.set(0, 0, -1.5);
        rightHand.current.position.set(rubMedium, 1.12, 0.48);
        rightHand.current.rotation.set(-0.3, 0, 0);
      } else if (phase === 2) {
        // 3. กลาง: ฝ่ามือถูฝ่ามือและซอกนิ้ว (Palm to palm with fingers interlaced)
        leftHand.current.position.set(-0.04, 1.1 + rubFast * 0.5, 0.42);
        leftHand.current.rotation.set(0, 0.4, -1.1);
        rightHand.current.position.set(0.04, 1.1 - rubFast * 0.5, 0.44);
        rightHand.current.rotation.set(0, -0.4, 1.1);
      } else if (phase === 3) {
        // 4. ปั้น: หลังนิ้วมือถูฝ่ามือ (Backs of fingers to opposing palms with fingers interlocked)
        leftHand.current.position.set(-0.08, 1.08, 0.44);
        leftHand.current.rotation.set(0.5, 0, -1.3);
        rightHand.current.position.set(0.08 + rubMedium, 1.1, 0.45);
        rightHand.current.rotation.set(-0.5, Math.PI, 1.3);
      } else if (phase === 4) {
        // 5. โป้ง: ถูรอบนิ้วหัวแม่มือด้วยฝ่ามือ (Rotational rubbing of thumb clasped in palm)
        leftHand.current.position.set(-0.1, 1.08, 0.42);
        leftHand.current.rotation.set(0, 0, -1.4);
        rightHand.current.position.set(-0.02 + Math.cos(t * 6) * 0.06, 1.1 + Math.sin(t * 6) * 0.06, 0.45);
        rightHand.current.rotation.set(0, 0, 0.8);
      } else if (phase === 5) {
        // 6. ปลาย: ปลายนิ้วถูขวางฝ่ามือ (Fingertips rubbing circularly in opposing palm)
        leftHand.current.position.set(-0.08, 1.06, 0.42);
        leftHand.current.rotation.set(-0.35, 0, -1.5);
        rightHand.current.position.set(-0.04 + Math.cos(t * 7) * 0.05, 1.15, 0.43 + Math.sin(t * 7) * 0.05);
        rightHand.current.rotation.set(0.9, 0, 0.2);
      } else if (phase === 6) {
        // 7. ข้อ: ถูรอบข้อมือทั้งสองข้าง (Rotational rubbing around wrist)
        leftHand.current.position.set(-0.12, 1.05, 0.42);
        leftHand.current.rotation.set(0, 0, -1.2);
        rightHand.current.position.set(-0.18, 0.92 + Math.sin(t * 6) * 0.05, 0.45 + Math.cos(t * 6) * 0.04);
        rightHand.current.rotation.set(0.3, 0, 1.1);
      } else {
        // 8. ล้างน้ำสะอาดและเช็ดมือให้แห้ง
        leftHand.current.position.set(-0.08, 0.98, 0.35);
        leftHand.current.rotation.set(0, 0, -0.8);
        rightHand.current.position.set(0.08, 0.98, 0.37);
        rightHand.current.rotation.set(0, 0, 0.8);
      }
    }

    if (soapRunoffRef.current && phase === 7) {
      const cycle = (t * 0.7) % 1;
      soapRunoffRef.current.position.y = -cycle * 0.38;
      soapRunoffRef.current.scale.setScalar(Math.max(0.1, 1 - cycle * 0.8));
    }
  });

  return (
    <group position={[0, 0.15, 0]}>
      <Block p={[0, 0.55, 0]} s={[2.2, 0.18, 1.3]} c="#ffffff" />
      <mesh position={[0, 0.66, 0.05]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.58, 0.08, 16, 48]} />
        <meshStandardMaterial color="#cde3e8" roughness={0.3} />
      </mesh>

      <Block p={[0, 1.15, -0.45]} s={[0.08, 0.95, 0.09]} c="#94a3b8" />
      <Block p={[0, 1.58, -0.22]} s={[0.08, 0.08, 0.55]} c="#94a3b8" />
      <Block p={[0, 1.52, 0.02]} s={[0.06, 0.08, 0.06]} c="#64748b" />

      <Block p={[-0.85, 0.92, -0.2]} s={[0.22, 0.45, 0.22]} c="#14b8a6" />
      <Block p={[-0.85, 1.18, -0.2]} s={[0.05, 0.12, 0.05]} c="#94a3b8" />
      <Block p={[-0.85, 1.24, -0.15]} s={[0.18, 0.04, 0.14]} c="#0f766e" />

      <group
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          act();
        }}
      >
        <group ref={leftHand}>
          <ArticulatedHand p={[0, 0, 0]} scale={1.05} isLeft={true} />
        </group>
        <group ref={rightHand}>
          <ArticulatedHand p={[0, 0, 0]} scale={1.05} isLeft={false} />
        </group>
      </group>

      {phase < 7 &&
        Array.from({ length: 24 }, (_, i) => (
          <Ball
            key={i}
            p={[
              Math.sin(i * 1.8) * 0.24,
              1.06 + Math.cos(i * 2.2) * 0.12,
              0.55 + Math.sin(i * 3.1) * 0.06
            ]}
            s={[0.038, 0.038, 0.038]}
            c="#ffffff"
          />
        ))}

      {phase === 7 && (
        <group position={[0, 1.25, 0.02]}>
          <mesh>
            <cylinderGeometry args={[0.03, 0.055, 0.6, 16]} />
            <meshStandardMaterial color="#38bdf8" transparent opacity={0.7} />
          </mesh>
          {/* Soap Bubbles Washing Off with Water Stream */}
          <group ref={soapRunoffRef} position={[0, -0.18, 0.3]}>
            {Array.from({ length: 14 }, (_, i) => (
              <Ball
                key={`wash-${i}`}
                p={[Math.sin(i * 2.4) * 0.18, Math.cos(i * 1.7) * 0.08, (i % 3) * 0.03]}
                s={[0.03, 0.03, 0.03]}
                c="#ffffff"
                opacity={0.85}
                transparent
              />
            ))}
          </group>
        </group>
      )}
    </group>
  );
}

const CameraController = forwardRef<
  {
    reset: () => void;
  },
  { topic: SceneKind; locked: boolean }
>((props, ref) => {
  const { camera } = useThree();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);

  const defaultPos: V = props.topic === 'hygiene' ? [0, 1.5, 4.2] : [3.3, 2.9, 5.5];
  const defaultTarget: V = props.topic === 'hygiene' ? [0, 1.25, 0.35] : [0, 1.25, 0.2];

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (controlsRef.current) {
        camera.position.set(...defaultPos);
        controlsRef.current.target.set(...defaultTarget);
        controlsRef.current.update();
      }
    }
  }));

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enabled={!props.locked && props.topic !== 'position'}
      target={defaultTarget}
      minDistance={1.1}
      maxDistance={9.5}
      enablePan={true}
      screenSpacePanning={true}
      panSpeed={1.5}
      rotateSpeed={0.8}
      zoomSpeed={1.1}
      minPolarAngle={0.1}
      maxPolarAngle={Math.PI / 2 + 0.12}
    />
  );
});

export default function GuidedScene({
  topic,
  visual,
  paused,
  speaking = false,
  mode = 'learn',
  sex: sexProp,
  onSexChange,
  onOpenHandVideo,
  onAction
}: Props) {
  const [height, setHeight] = useState(0.9);
  const [valve, setValve] = useState(false);
  const [container, setContainer] = useState(false);
  const [fill, setFill] = useState(0.8);
  const [wipe, setWipe] = useState(false);
  const [stowed, setStowed] = useState(false);
  const [tape, setTape] = useState(0);
  const [slackTight, setSlackTight] = useState(false);
  const [straight, setStraight] = useState(true);
  const [tubeIssue, setTubeIssue] = useState<'normal' | 'kink' | 'dependentLoop'>('normal');
  const [phase, setPhase] = useState(0);
  const [internalSex, setInternalSex] = useState<'female' | 'male'>('female');
  const [secureDemoPos, setSecureDemoPos] = useState<'thigh' | 'suprapubic'>('thigh');
  const [troubleDemo, setTroubleDemo] = useState<'kink' | 'belly' | 'leak' | 'flank' | 'blood' | 'fever'>('kink');
  const [feedback, setFeedback] = useState('');
  const [drag, setDrag] = useState(false);

  const sex = sexProp ?? internalSex;
  const handleSexChange = (newSex: 'female' | 'male') => {
    setInternalSex(newSex);
    onSexChange?.(newSex);
  };

  const cameraCtrl = useRef<{ reset: () => void }>(null);

  const auto = mode === 'learn';
  const hint = mode !== 'challenge';
  const prevTopic = useRef(topic);
  const prevMode = useRef(mode);

  const record = (actionStr: string) => {
    onAction?.(actionStr);
    setFeedback(actionStr);
  };

  useEffect(() => {
    if (!auto && prevTopic.current === topic && prevMode.current === mode) return;
    prevMode.current = mode;

    setHeight(
      topic === 'position' && visual === 0
        ? 1.95
        : topic === 'position' && visual === 2
        ? 0.32
        : 0.95
    );
    setValve(auto && topic === 'drain' && visual === 2);
    setContainer(auto && visual >= 1);
    setFill(auto && visual >= 3 ? 0.05 : 0.8);
    setWipe(auto && ((topic === 'drain' && visual === 3) || (topic === 'hygiene' && visual >= 1 && visual <= 3)));
    setStowed(auto && topic === 'drain' && visual >= 3);
    setTape(auto && topic === 'secure' && visual > 0 ? 1 : 0);
    setSlackTight(false);

    if (topic === 'tube') {
      if (visual === 0) {
        setStraight(false);
        setTubeIssue('kink');
      } else if (visual === 2) {
        setStraight(true);
        setTubeIssue('dependentLoop');
      } else {
        setStraight(true);
        setTubeIssue('normal');
      }
    } else {
      setStraight(true);
      setTubeIssue('normal');
    }

    if (topic === 'trouble') {
      if (visual === 0) {
        setTroubleDemo('kink');
        setStraight(false);
      } else if (visual === 1) {
        setTroubleDemo('belly');
        setStraight(true);
      } else {
        setTroubleDemo('fever');
        setStraight(true);
      }
    }
    // For hygiene topic, sync phase with visual step (soap foam -> water rinse -> pat dry)
    if (topic === 'hygiene') {
      setPhase(visual === 1 ? 0 : visual === 2 ? 1 : visual >= 3 ? 2 : 0);
    } else {
      setPhase(0);
    }
    setFeedback('');

    if (prevTopic.current !== topic) {
      cameraCtrl.current?.reset();
      prevTopic.current = topic;
    }
  }, [topic, visual, mode, auto]);

  useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => {
      if (topic === 'drain' && valve && container) {
        setFill((n) => drainTick(n, true, true, 0.08));
      }
    }, 100);
    return () => clearInterval(interval);
  }, [paused, topic, valve, container]);

  useEffect(() => {
    if (!auto || paused || topic !== 'hands') return;
    const interval = setInterval(() => setPhase((p) => (p + 1) % 8), 2600);
    return () => clearInterval(interval);
  }, [auto, paused, topic]);

  const toggleValve = () => {
    if (paused) return;
    if (!valve && !container) {
      record('จัดภาชนะรองใต้ปลายก๊อกก่อนเปิดนะคะ');
      return;
    }
    setValve((v) => !v);
    record(valve ? 'ปิดก๊อกระบายให้สนิท' : 'เปิดก๊อกระบายปัสสาวะ');
  };

  const doWipeSpout = () => {
    if (valve) {
      record('ปิดก๊อกให้สนิทก่อนเช็ดปลายก๊อกด้วยแอลกอฮอล์นะคะ');
      return;
    }
    setWipe(true);
    record('เช็ดปลายก๊อกด้วยสำลีชุบแอลกอฮอล์');
  };

  const doStowSpout = () => {
    if (valve || !wipe) {
      record('ปิดก๊อกและเช็ดแอลกอฮอล์ให้สะอาดก่อนเก็บปลายก๊อกนะคะ');
      return;
    }
    setStowed(true);
    record('เก็บปลายก๊อกเข้าซองเก็บอุปกรณ์เรียบร้อย');
  };

  const chooseTape = (thigh: number) => {
    if (topic !== 'secure') return;
    setTape(thigh);
    if (sex === 'male') {
      record('แปะเทปบริเวณหัวหน่าวหรือท้องน้อย เหลือระยะหย่อนพอดี');
    } else {
      record(thigh === 1 ? 'แปะเทปที่หน้าขาขวา เหลือระยะหย่อนพอดี' : 'แปะเทปที่หน้าขาซ้าย เหลือระยะหย่อนพอดี');
    }
  };

  const handPhases = [
    '1. หน้า: ฝ่ามือถูกัน',
    '2. หลัง: ฝ่ามือถูหลังมือและซอกนิ้ว',
    '3. กลาง: ฝ่ามือถูฝ่ามือและซอกนิ้ว',
    '4. ปั้น: หลังนิ้วมือถูฝ่ามือ',
    '5. โป้ง: ถูรอบนิ้วหัวแม่มือ',
    '6. ปลาย: ปลายนิ้วถูขวางฝ่ามือ',
    '7. ข้อ: ถูรอบข้อมือ',
    'ล้างน้ำสะอาดและเช็ดแห้ง'
  ];

  const WAIST_Y = 1.62;
  const isAboveWaist = height > 1.6;
  const isTouchingFloor = height < 0.4;
  const isOptimalPosition = !isAboveWaist && !isTouchingFloor;

  const showBodyTopics = ['position', 'tube', 'secure', 'trouble'].includes(topic);

  const insertionPoint: V = [-0.65, 1.48, 0.25];
  const bagInlet: V = [0.82, height + 0.38, 0.58];

  let catheterPoints: V[];
  if ((!straight && topic === 'tube') || (topic === 'trouble' && (!straight || troubleDemo === 'kink'))) {
    // ตอนเสนอว่ามีการทับสาย: สายมุดอยู่ใต้ต้นขาผู้ป่วยบนผ้าปูเตียง (y = 1.05 ใต้ขา ไม่ทะลุเนื้อขา) และพับงอ ทำให้ปัสสาวะไม่ไหล
    catheterPoints = [
      insertionPoint,
      [-0.48, 1.10, 0.36],
      [-0.30, 1.05, 0.44], // สายมุดอยู่ใต้ต้นขาผู้ป่วยบนผ้าปูเตียง (การทับสาย ไม่ทะลุเนื้อขา)
      [-0.12, 1.06, 0.50],
      [-0.02, 1.18, 0.52], // จุดหักพับงอ
      [0.08, 1.12, 0.54],
      [0.35, 1.10, 0.58],
      bagInlet
    ];
  } else if (topic === 'tube' && tubeIssue === 'dependentLoop') {
    // สายคล้อยห้อยท้องช้าง (Dependent loop): ตกท้องช้างต่ำกว่าระดับปากถุง เกิด Fluid Trap เสี่ยงแบคทีเรียไหลย้อนกลับ
    catheterPoints = [
      insertionPoint,
      [-0.48, 1.58, 0.36],
      [-0.30, 1.62, 0.44], // พาดบนหน้าขา
      [-0.05, 1.20, 0.48], // เริ่มหย่อนลง
      [0.22, 0.45, 0.52],  // ห้อยท้องช้างต่ำกว่าระดับปากถุง
      [0.48, 0.42, 0.56],  // ท้องช้างแอ่งน้ำขังค้าง (Fluid Trap)
      [0.68, 0.82, 0.58],  // ไต่ย้อนกลับขึ้นมายังปากถุง
      bagInlet
    ];
  } else if (topic === 'secure' && tape > 0) {
    if (secureDemoPos === 'suprapubic') {
      // เพศชาย: ยึดสายบริเวณหัวหน่าวหรือท้องน้อย (Suprapubic area)
      catheterPoints = [
        insertionPoint,
        [-0.58, 1.66, 0.32],
        [-0.55, 1.74, 0.36], // แปะเทปที่หัวหน่าว/ท้องน้อย
        [-0.20, 1.64, 0.46],
        [0.20, 1.45, 0.54],
        bagInlet
      ];
    } else {
      // เพศหญิง: ยึดสายที่หน้าขา (Anterior thigh)
      const thighX = tape === 1 ? -1.0 : -0.3;
      if (slackTight) {
        catheterPoints = [
          insertionPoint,
          [-0.48, 1.58, 0.36],
          [thighX, 1.60, 0.44], // พาดบนหน้าขาแน่นพอดี
          [0.2, 1.38, 0.55],
          bagInlet
        ];
      } else {
        catheterPoints = [
          insertionPoint,
          [-0.48, 1.58, 0.36],
          [thighX - 0.05, 1.61, 0.42],
          [thighX, 1.62, 0.44], // พาดบนหน้าขาอย่างนุ่มนวล หย่อนพอดี ไม่ตึงรั้ง
          [0.10, 1.48, 0.52],
          [0.38, 1.25, 0.60],
          bagInlet
        ];
      }
    }
  } else {
    // สายสวนไม่ให้แสดงทะลุขาผู้ป่วย: ให้สายพาดอยู่บนขาผู้ป่วยเสมอ (y = 1.62 ลอยเด่นเหนือผิวต้นขา 1.53 ไม่ทะลุเนื้อขาเด็ดขาด)
    catheterPoints = [
      insertionPoint,
      [-0.48, 1.58, 0.36], // ขึ้นจากรูเปิดท่อปัสสาวะมาที่ขอบในของต้นขา
      [-0.30, 1.62, 0.44], // พาดอยู่บนหน้าขาผู้ป่วยอย่างชัดเจน (y = 1.62 > 1.53)
      [-0.12, 1.58, 0.50], // โค้งรับขอบนอกของต้นขา
      [0.10, 1.46, 0.54],  // ทอดตัวลงสู่ผ้าปูเตียงอย่างเป็นธรรมชาติ
      [0.40, Math.min(1.25, height + 0.15), 0.58],
      bagInlet
    ];
  }

  return (
    <div className="virtual-lab">
      <div className="guided-stage">
        <Suspense fallback={<div className="stage-loading">กำลังเตรียมห้องสาธิต 3 มิติ…</div>}>
          <Canvas shadows dpr={[1, 1.5]} camera={{ position: [3.3, 2.9, 5.5], fov: 42 }}>
            <color attach="background" args={['#e6f0eb']} />
            <ambientLight intensity={1.5} />
            <directionalLight position={[2, 6, 4]} intensity={2.0} castShadow />

            <Room />

            {topic !== 'hygiene' && <NurseModel paused={paused} speaking={speaking} />}

            {showBodyTopics && (
              <>
                <Patient
                  tape={tape}
                  slackMode={slackTight}
                  chooseTape={chooseTape}
                  onToggleSlack={() => {
                    setSlackTight((s) => !s);
                    record(slackTight ? 'จัดสายหย่อนพอดี ไม่ตึงรั้ง' : 'จำลองสายตึงรั้งเกินไป');
                  }}
                  activeSex={topic === 'secure' ? (secureDemoPos === 'suprapubic' ? 'male' : 'female') : sex}
                  isSecureTopic={topic === 'secure'}
                />

                {topic === 'position' && (
                  <>
                    <Line points={[[-1.4, WAIST_Y, 0.6], [1.4, WAIST_Y, 0.6]]} color="#0284c7" lineWidth={4} />
                    <Line
                      points={[[-1.4, 1.48, 0.6], [1.4, 1.48, 0.6]]}
                      color="#0d9488"
                      dashed
                      dashSize={0.08}
                      gapSize={0.05}
                    />
                    <Line
                      points={[[0.82, WAIST_Y, 0.6], [0.82, height + 0.38, 0.6]]}
                      color={isAboveWaist ? '#dc2626' : isTouchingFloor ? '#ea580c' : '#10b981'}
                      lineWidth={5}
                    />
                  </>
                )}

                <Line
                  points={catheterPoints}
                  color={
                    topic === 'trouble' && (troubleDemo === 'blood' || visual === 2)
                      ? '#dc2626'
                      : topic === 'tube' && tubeIssue === 'dependentLoop'
                      ? '#ea580c'
                      : (slackTight && topic === 'secure') ||
                        (!straight && topic === 'tube') ||
                        (topic === 'trouble' && (!straight || troubleDemo === 'kink'))
                      ? '#ef4444'
                      : '#d4af37'
                  }
                  lineWidth={6}
                  onClick={() => {
                    setStraight(true);
                    setTubeIssue('normal');
                    if (topic === 'trouble' && troubleDemo === 'kink') {
                      record('คลายจุดที่สายพับงอออก');
                    } else if (topic === 'tube') {
                      record('จัดสายให้พาดบนหน้าขา ลาดเทตรง');
                    } else {
                      record('จัดสายให้คลายพับงอ');
                    }
                  }}
                />

                {/* Dependent Loop Fluid Trap Pool (แอ่งน้ำปัสสาวะขังคั่งค้างในท้องช้าง) */}
                {topic === 'tube' && tubeIssue === 'dependentLoop' && (
                  <group position={[0.35, 0.44, 0.54]}>
                    <Ball p={[0, 0, 0]} s={[0.14, 0.09, 0.14]} c="#eab308" />
                    <Ball p={[0.13, 0.02, 0]} s={[0.09, 0.07, 0.09]} c="#ca8a04" />
                  </group>
                )}

                {/* Visual Symptom Demonstrations for topic === 'trouble' (เมื่อมีปัญหา) */}
                    {topic === 'trouble' && (
                      <group>
                        {/* 1. สายพับงอ (Kinked tube highlight marker) */}
                        {(!straight || troubleDemo === 'kink') && (
                          <group position={[-0.08, 1.28, 0.58]}>
                            <mesh>
                              <torusGeometry args={[0.18, 0.025, 16, 32]} />
                              <meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.45} />
                            </mesh>
                          </group>
                        )}

                        {/* 2. ปวดท้องน้อย (Lower abdominal / bladder pain pulsing red glow) */}
                        {(visual === 1 || troubleDemo === 'belly') && (
                          <group position={[-0.65, 1.56, 0.28]}>
                            <Ball p={[0, 0, 0]} s={[0.22, 0.15, 0.09]} c="#ef4444" opacity={0.78} transparent />
                            <Ball p={[0, 0, 0.02]} s={[0.3, 0.21, 0.06]} c="#fca5a5" opacity={0.45} transparent />
                          </group>
                        )}

                        {/* 3. ปัสสาวะรั่วซึมรอบสาย (Urine leaking around catheter insertion site) */}
                        {(visual === 1 || troubleDemo === 'leak') && (
                          <group position={[-0.65, 1.44, 0.29]}>
                            <Ball p={[-0.06, -0.04, 0.03]} s={[0.035, 0.055, 0.025]} c="#f59e0b" />
                            <Ball p={[0.05, -0.08, 0.04]} s={[0.03, 0.05, 0.025]} c="#f59e0b" />
                            <Ball p={[0, -0.13, 0.02]} s={[0.14, 0.025, 0.12]} c="#fbbf24" opacity={0.85} transparent />
                          </group>
                        )}

                        {/* 4. ปวดเอว / ปวดสีข้างและหลัง (Flank / lower back pain pulsing indicators on both sides of waist) */}
                        {(visual === 2 || troubleDemo === 'flank') && (
                          <group>
                            <Ball p={[-1.02, 1.68, 0.16]} s={[0.14, 0.18, 0.1]} c="#dc2626" opacity={0.82} transparent />
                            <Ball p={[-0.28, 1.68, 0.16]} s={[0.14, 0.18, 0.1]} c="#dc2626" opacity={0.82} transparent />
                            <Line points={[[-1.18, 1.74, 0.25], [-1.05, 1.68, 0.25]]} color="#ef4444" lineWidth={4} />
                            <Line points={[[-0.12, 1.74, 0.25], [-0.25, 1.68, 0.25]]} color="#ef4444" lineWidth={4} />
                          </group>
                        )}

                        {/* 5. มีไข้ 38 องศาเซลเซียส (3D Clinical Thermometer showing red mercury column & 38°C fever) */}
                        {(visual === 2 || troubleDemo === 'fever') && (
                          <group position={[-0.12, 2.38, 0.25]}>
                            {/* White thermometer body */}
                            <Block p={[0, 0, 0]} s={[0.22, 0.72, 0.08]} c="#ffffff" />
                            {/* Thermometer outer rim */}
                            <Block p={[0, 0, -0.01]} s={[0.25, 0.75, 0.06]} c="#fca5a5" />
                            {/* Red bulb at bottom */}
                            <Ball p={[0, -0.26, 0.04]} s={[0.065, 0.065, 0.05]} c="#dc2626" />
                            {/* High red mercury column up to 38°C+ */}
                            <Block p={[0, -0.02, 0.045]} s={[0.042, 0.44, 0.03]} c="#dc2626" />
                            {/* 38°C tick marks */}
                            {[-0.12, 0, 0.12, 0.2].map((ty, idx) => (
                              <Block key={idx} p={[0.055, ty, 0.045]} s={[0.045, 0.012, 0.02]} c="#1e293b" />
                            ))}
                            {/* Red fever flush on patient's cheeks/forehead */}
                            <Ball p={[-0.53, 0.1, -0.32]} s={[0.18, 0.09, 0.06]} c="#ef4444" opacity={0.55} transparent />
                          </group>
                        )}
                      </group>
                    )}

                    <group
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        if (topic !== 'position') return;
                        setDrag(true);
                        try {
                          (e.target as unknown as Element).setPointerCapture(e.pointerId);
                        } catch {}
                        const p = new THREE.Vector3();
                        if (e.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.58), p)) {
                          setHeight(Math.min(2.1, Math.max(0.3, p.y)));
                        }
                      }}
                      onPointerMove={(e) => {
                        if (!drag) return;
                        e.stopPropagation();
                        const p = new THREE.Vector3();
                        if (e.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.58), p)) {
                          setHeight(Math.min(2.1, Math.max(0.3, p.y)));
                        }
                      }}
                      onPointerUp={(e) => {
                        e.stopPropagation();
                        if (!drag) return;
                        setDrag(false);
                        try {
                          (e.target as unknown as Element).releasePointerCapture(e.pointerId);
                        } catch {}
                        record('ปรับระดับถุง: ' + bagStatus(height));
                      }}
                      onPointerCancel={() => setDrag(false)}
                    >
                      <DrainageBag
                        h={height}
                        fill={
                          topic === 'trouble' && (!straight || troubleDemo === 'kink' || troubleDemo === 'belly')
                            ? 0.08
                            : 0.55
                        }
                        fluidColor={
                          topic === 'trouble' && (visual === 2 || troubleDemo === 'blood') ? '#dc2626' : '#f59e0b'
                        }
                        draggable={topic === 'position'}
                        valve={false}
                        onValve={() => {}}
                        onSelect={() => {
                          if (topic === 'position') {
                            setHeight((prev) => (prev > 1.3 ? 0.95 : prev > 0.5 ? 0.32 : 1.85));
                            record('คลิกปรับระดับถุงปัสสาวะ');
                          } else {
                            record('เลือกถุงปัสสาวะ');
                          }
                        }}
                      />
                    </group>
                  </>
                )}

            {topic === 'hands' && (
              <Washing
                phase={phase}
                paused={paused}
                act={() => {
                  setPhase((p) => (p + 1) % 8);
                  record(handPhases[(phase + 1) % 8]);
                }}
              />
            )}

            {topic === 'drain' && (
              <>
                <DrainageBag
                  h={1.65}
                  fill={fill}
                  valve={valve}
                  onValve={toggleValve}
                  onSelect={() => record('เลือกถุงปัสสาวะ')}
                  wipe={wipe}
                  stowed={stowed}
                  onWipe={doWipeSpout}
                  onStow={doStowSpout}
                />

                <group
                  position={[container ? 0.82 : 1.7, 0, 0.58]}
                  onClick={(e) => {
                    e.stopPropagation();
                    setContainer((v) => !v);
                    if (valve) setValve(false);
                    record(container ? 'ย้ายภาชนะออก' : 'วางภาชนะรองใต้ก๊อก');
                  }}
                >
                  <mesh position={[0, 0.26, 0]}>
                    <cylinderGeometry args={[0.34, 0.28, 0.46, 32, 1, true]} />
                    <meshStandardMaterial color="#bae6fd" transparent opacity={0.65} side={THREE.DoubleSide} />
                  </mesh>
                  <mesh position={[0, 0.05 + (0.8 - fill) * 0.24, 0]}>
                    <cylinderGeometry args={[0.27, 0.26, Math.max(0.01, (0.8 - fill) * 0.4), 32]} />
                    <meshStandardMaterial color="#f59e0b" />
                  </mesh>
                </group>

                {valve && container && fill > 0 && (
                  <mesh position={[0.82, 0.8, 0.58]}>
                    <cylinderGeometry args={[0.018, 0.022, 0.65, 12]} />
                    <meshStandardMaterial color="#f59e0b" transparent opacity={0.85} />
                  </mesh>
                )}

                {wipe && (
                  <group
                    position={[0.85, 1.15, 0.7]}
                    onClick={(e) => {
                      e.stopPropagation();
                      doWipeSpout();
                    }}
                  >
                    <Ball p={[0, 0, 0]} s={[0.11, 0.08, 0.06]} c="#ffffff" />
                    <ArticulatedHand p={[-0.18, 0.07, 0.1]} r={[0, 0, -0.8]} scale={0.8} />
                  </group>
                )}

                <Block p={[-0.1, 0.55, 0.5]} s={[0.24, 0.16, 0.14]} c="#ffffff" onClick={doWipeSpout} />
              </>
            )}

            {topic === 'secure' && tape === 0 && (
              <Block p={[0.7, 0.2, 1]} s={[0.4, 0.04, 0.22]} c="#ffffff" onClick={() => chooseTape(1)} />
            )}

            {topic === 'hygiene' && (
              <Pelvis
                sex={sex}
                wipe={wipe && !paused}
                phase={phase}
                act={() => {
                  setWipe(true);
                  record(sex === 'female' ? 'ใช้สบู่อ่อนล้างและเช็ดหน้าไปหลัง' : 'ใช้สบู่อ่อนทำความสะอาดรอบรูเปิด');
                }}
              />
            )}

            {topic === 'water' && (
              <>
                <mesh position={[-0.2, 0.85, 0.4]}>
                  <cylinderGeometry args={[0.28, 0.22, 1.1, 32, 1, true]} />
                  <meshPhysicalMaterial color="#38bdf8" transparent opacity={0.6} side={THREE.DoubleSide} />
                </mesh>
                <DrainageBag
                  h={1.3}
                  fill={0.65}
                  valve={false}
                  onValve={() => {}}
                  onSelect={() => record('สังเกตสีปัสสาวะเหลืองอ่อน')}
                />
              </>
            )}

            {topic === 'followup' && (
              <group position={[0, 1.2, 0.3]}>
                <Block p={[0, 0, 0]} s={[1.7, 1.5, 0.12]} c="#ffffff" />
                <Block p={[0, 0.65, 0.08]} s={[1.7, 0.25, 0.06]} c="#0d9488" />
                {Array.from({ length: 14 }, (_, i) => (
                  <Block
                    key={i}
                    p={[-0.65 + (i % 7) * 0.22, 0.25 - Math.floor(i / 7) * 0.4, 0.08]}
                    s={[0.15, 0.18, 0.05]}
                    c={i === 13 ? '#f59e0b' : '#e0f2fe'}
                    onClick={() => record('ตรวจวันนัดเปลี่ยนสายทุก 2 สัปดาห์')}
                  />
                ))}
              </group>
            )}

            <ContactShadows position={[0, 0.005, 0]} scale={8} opacity={0.3} blur={2} far={4} />
            <CameraController ref={cameraCtrl} topic={topic} locked={drag} />
          </Canvas>
        </Suspense>

        <span className="stage-corner">
          ห้องสาธิต 3D ·{' '}
          {mode === 'learn'
            ? 'CathLearn · ดูสาธิต'
            : mode === 'practice'
            ? 'CathPractice · ฝึกทำ'
            : 'CathChallenge · ลองเอง'}
        </span>

        {topic === 'position' && hint && (
          <div
            className={`bag-waist-badge ${
              isAboveWaist ? 'badge-danger' : isTouchingFloor ? 'badge-warning' : 'badge-safe'
            }`}
          >
            {isAboveWaist
              ? 'ถุงสูงกว่าระดับเอว ปัสสาวะอาจไหลย้อนกลับ'
              : isTouchingFloor
              ? 'ก้นถุงแตะพื้น เสี่ยงต่อการปนเปื้อนเชื้อ'
              : 'ระดับเหมาะสม: ต่ำกว่าระดับเอวและกระเพาะปัสสาวะ ไม่แตะพื้น'}
          </div>
        )}

        {topic === 'hygiene' && (
          <div className="bag-waist-badge badge-safe">
            {sex === 'female'
              ? 'แนะนำเฉพาะเพศหญิง: เช็ดทิศทางเดียวจากหน้าไปหลัง (ห้ามเช็ดถูย้อนไปมาเด็ดขาด)'
              : 'แนะนำเฉพาะเพศชาย: รูดเปิดหนังหุ้มปลายเบา ๆ ฟอกสบู่อ่อน ซับแห้ง และรูดกลับทันที'}
          </div>
        )}

        {topic === 'tube' && (
          <div
            className={`bag-waist-badge ${
              tubeIssue === 'dependentLoop' ? 'badge-danger' : !straight ? 'badge-warning' : 'badge-safe'
            }`}
          >
            {tubeIssue === 'dependentLoop'
              ? 'สายคล้อยห้อยท้องช้าง (Dependent loop): น้ำปัสสาวะขังคั่งค้าง เสี่ยงแบคทีเรียไหลย้อนกลับ (Reflux) สู่กระเพาะปัสสาวะ (หลักฐาน CDC & SHEA)'
              : !straight
              ? 'สายพับงอหรือถูกนอนทับ: น้ำปัสสาวะไม่ไหลลงถุง ให้คลายจุดพับและยกสายพาดบนหน้าขา'
              : 'สายพาดบนขาและลาดเทตรงสู่ถุง: น้ำปัสสาวะไหลสะดวกตามแรงโน้มถ่วง'}
          </div>
        )}

        {topic === 'secure' && (
          <div className="bag-waist-badge badge-safe">
            {secureDemoPos === 'suprapubic'
              ? 'เพศชาย: แปะเทปยึดสายบริเวณหัวหน่าวหรือท้องน้อย (ลดแรงดึงรั้งที่มุม Penoscrotal junction)'
              : 'เพศหญิง: แปะเทปยึดสายที่หน้าขา (Anterior thigh) เหลือระยะหย่อนพอดี ไม่ดึงรั้ง'}
          </div>
        )}

        {topic === 'followup' && (
          <div className="bag-waist-badge badge-safe">
            คงสภาพระบบปิด (Closed System): เปลี่ยนสายเมื่อชำรุด หลุด รั่ว หรือมีตะกอนค้าง · ห้ามเปลี่ยนเองหรือปลดข้อต่อ
          </div>
        )}

        {topic === 'trouble' && (visual === 2 || troubleDemo === 'fever') && (
          <div className="bag-waist-badge badge-danger">
            ปรอทวัดไข้สูง 38.0 °C · มีอาการปวดเอว หรือปัสสาวะปนเลือดสีแดงสด ต้องรีบพบแพทย์ทันที
          </div>
        )}
      </div>

      {/* Interactive Controls Panel Below Canvas */}
      <div className="lab-controls">
        <div className="camera-help">
          <span>
            {topic === 'position'
              ? 'โหมดปรับระดับถุง: หน้าจอล็อกมุมมองไว้เพื่อให้คลิกและลากถุงปัสสาวะขึ้น-ลงได้โดยหน้าจอไม่ขยับ'
              : 'ลากเพื่อหมุนมุมมอง · คลิกขวาหรือสองนิ้วลากเพื่อเลื่อนซ้าย-ขวา · ล้อเมาส์เพื่อซูม'}
          </span>
          <button onClick={() => cameraCtrl.current?.reset()}>คืนมุมมองตั้งต้น</button>
        </div>

        {topic === 'position' && (
          <>
            <label>
              ระดับถุงปัสสาวะ เทียบกับระดับเอวผู้ป่วย
              <input
                aria-label="แถบเลื่อนระดับถุงปัสสาวะ"
                type="range"
                min="0.3"
                max="2.1"
                step="0.02"
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                onPointerUp={() => record('ปรับระดับถุง: ' + bagStatus(height))}
              />
            </label>
            <div className="control-row">
              <button
                onClick={() => {
                  setHeight((h) => Math.max(0.3, h - 0.15));
                  record('ลดระดับถุง');
                }}
              >
                ลดระดับถุง
              </button>
              <button
                onClick={() => {
                  setHeight((h) => Math.min(2.1, h + 0.15));
                  record('เพิ่มระดับถุง');
                }}
              >
                เพิ่มระดับถุง
              </button>
              <button
                className={isOptimalPosition ? 'selected' : ''}
                onClick={() => {
                  setHeight(0.95);
                  record('จัดระดับถุงต่ำกว่าเอว');
                }}
              >
                จัดต่ำกว่าเอว (เหมาะสม)
              </button>
              {hint && (
                <>
                  <button
                    className={isAboveWaist ? 'selected' : ''}
                    onClick={() => {
                      setHeight(1.85);
                      record('จำลองถุงสูงกว่าเอว');
                    }}
                  >
                    สูงกว่าเอว (ตัวอย่างที่ควรเลี่ยง)
                  </button>
                  <button
                    className={isTouchingFloor ? 'selected' : ''}
                    onClick={() => {
                      setHeight(0.32);
                      record('จำลองถุงแตะพื้น');
                    }}
                  >
                    แตะพื้น (ตัวอย่างที่ควรเลี่ยง)
                  </button>
                </>
              )}
            </div>
            {hint && (
              <p className={isAboveWaist ? 'text-danger' : isTouchingFloor ? 'text-warning' : 'text-safe'}>
                สถานะ: {bagStatus(height)} (เส้นสีน้ำเงิน = ระดับเอวผู้ป่วย)
              </p>
            )}
          </>
        )}

        {topic === 'hands' && (
          <div className="hand-hygiene-demo-container">
            <div className="hand-hygiene-header-banner">
              <span className="demo-badge">ภาพสาธิตท่าล้างมืออ้างอิงท่าจริง 7 ขั้นตอน (IC มาตรฐานสากล)</span>
              <strong>{handPhases[phase]}</strong>
              <small>แนะนำถูอย่างน้อย 15–20 วินาทีในแต่ละท่า เพื่อฆ่าเชื้อโรคให้ทั่วถึง</small>
            </div>
            {onOpenHandVideo && (
              <div style={{ margin: '8px 0 10px', textAlign: 'center' }}>
                <button
                  type="button"
                  className="hand-video-btn"
                  onClick={() => {
                    onOpenHandVideo();
                    record('เปิดดูคลิปวิดีโอสาธิตการล้างมือ 7 ขั้นตอนของจริง');
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '24px',
                    padding: '8px 18px',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    boxShadow: '0 3px 8px rgba(13, 148, 136, 0.3)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  ชมคลิปวิดีโอสาธิตการล้างมือ 7 ขั้นตอนของจริง (ศิริราช)
                </button>
              </div>
            )}
            <div className="hand-steps-interactive-grid">
              {handPhases.map((hp, i) => (
                <button
                  key={hp}
                  className={`hand-step-pill-btn ${phase === i ? 'selected' : ''}`}
                  onClick={() => {
                    setPhase(i);
                    record(hp);
                  }}
                  title={hp}
                >
                  <span className="hand-step-badge">ท่าที่ {i + 1}</span>
                  <span className="hand-step-name">{['1. หน้า', '2. หลัง', '3. กลาง', '4. ปั้น', '5. โป้ง', '6. ปลาย', '7. ข้อ', '8. น้ำสะอาด'][i]}</span>
                </button>
              ))}
            </div>
            {hint && (
              <p aria-live="polite" className="hand-current-cue">
                กำลังสาธิต: <strong>{handPhases[phase]}</strong> (คลิกเลือกเปลี่ยนท่าได้ หรือกดชมคลิปวิดีโอสาธิตของจริงได้ค่ะ)
              </p>
            )}
          </div>
        )}

        {topic === 'drain' && (
          <>
            <div className="control-row">
              <button
                onClick={() => {
                  setContainer((v) => !v);
                  setValve(false);
                  record(container ? 'ย้ายภาชนะออก' : 'วางภาชนะรองใต้ก๊อก');
                }}
              >
                {container ? 'ย้ายภาชนะออก' : '1. วางภาชนะรองใต้ก๊อก'}
              </button>
              <button onClick={toggleValve} className={valve ? 'selected' : ''}>
                {valve ? '3. ปิดก๊อกให้สนิท' : '2. เปิดก๊อกระบาย'}
              </button>
              <button onClick={doWipeSpout} className={wipe ? 'selected' : ''}>
                4. เช็ดอุปกรณ์ ถุง และปลายก๊อกด้วยแอลกอฮอล์ 70%
              </button>
              <button onClick={doStowSpout} className={stowed ? 'selected' : ''}>
                5. เก็บปลายก๊อกเข้าที่
              </button>
              <button
                onClick={() => {
                  setFill(0.8);
                  setValve(false);
                  setWipe(false);
                  setStowed(false);
                  record('เริ่มจำลองการเทใหม่');
                }}
              >
                เริ่มเทใหม่
              </button>
            </div>
            <p>
              ปัสสาวะจำลองคงเหลือ: {Math.round(fill * 100)}% · สถานะก๊อก: {valve ? 'เปิดอยู่' : 'ปิดสนิท'}
              {wipe ? ' · เช็ดอุปกรณ์ ถุง และปลายก๊อกด้วยแอลกอฮอล์ 70% แล้ว' : ''}
              {stowed ? ' · เก็บปลายก๊อกเรียบร้อย' : ''}
            </p>
          </>
        )}

        {topic === 'secure' && (
          <>
            <div className="control-row">
              <button
                className={secureDemoPos === 'thigh' ? 'selected' : ''}
                onClick={() => {
                  setSecureDemoPos('thigh');
                  setTape(1);
                  record('เลือกตำแหน่งยึดสาย: แปะที่หน้าขา (สำหรับเพศหญิง)');
                }}
              >
                ตำแหน่งที่ 1: แปะหน้าขา (สำหรับเพศหญิง)
              </button>
              <button
                className={secureDemoPos === 'suprapubic' ? 'selected' : ''}
                onClick={() => {
                  setSecureDemoPos('suprapubic');
                  setTape(1);
                  record('เลือกตำแหน่งยึดสาย: แปะบริเวณหัวหน่าวหรือท้องน้อย (สำหรับเพศชาย)');
                }}
              >
                ตำแหน่งที่ 2: แปะหัวหน่าวหรือท้องน้อย (สำหรับเพศชาย)
              </button>
            </div>
            <div className="control-row">
              {secureDemoPos === 'thigh' ? (
                <>
                  <button className={tape === 1 ? 'selected' : ''} onClick={() => chooseTape(1)}>
                    แปะเทปที่หน้าขาขวา
                  </button>
                  <button className={tape === 2 ? 'selected' : ''} onClick={() => chooseTape(2)}>
                    แปะเทปที่หน้าขาซ้าย
                  </button>
                </>
              ) : (
                <button className={tape > 0 ? 'selected' : ''} onClick={() => chooseTape(1)}>
                  แปะเทปบริเวณหัวหน่าว / ท้องน้อย
                </button>
              )}
              <button
                className={slackTight ? 'selected' : ''}
                onClick={() => {
                  setSlackTight((s) => !s);
                  record(slackTight ? 'จัดสายหย่อนพอดี ไม่ตึงรั้ง' : 'จำลองสายตึงรั้งเกินไป');
                }}
              >
                {slackTight ? 'สายตึงรั้งเกินไป (กดเพื่อคลาย)' : 'สายหย่อนพอดี ไม่ดึงรั้ง'}
              </button>
              <button
                onClick={() => {
                  setTape(0);
                  record('นำเทปออกเพื่อจัดใหม่');
                }}
              >
                ลอกเทปจัดใหม่
              </button>
            </div>
            {hint && (
              <p>
                {secureDemoPos === 'thigh'
                  ? 'เพศหญิง: แนะนำแปะเทปยึดสายที่บริเวณหน้าขา (Anterior thigh) โดยเหลือระยะหย่อนพอดี ไม่ดึงรั้ง'
                  : 'เพศชาย: แนะนำแปะเทปยึดสายบริเวณหัวหน่าวหรือท้องน้อย เพื่อลดแรงดึงรั้งที่มุม Penoscrotal junction ป้องกันแผลกดทับ'}
              </p>
            )}
          </>
        )}

        {topic === 'tube' && (
          <>
            <div className="control-row">
              <button
                className={straight && tubeIssue === 'normal' ? 'selected' : ''}
                onClick={() => {
                  setStraight(true);
                  setTubeIssue('normal');
                  record('จัดสายให้พาดบนขาและลาดเทตรงลงสู่ถุงอย่างถูกต้อง');
                }}
              >
                1. สายพาดบนขา ลาดเทตรง (ถูกต้อง)
              </button>
              <button
                className={!straight || tubeIssue === 'kink' ? 'selected' : ''}
                onClick={() => {
                  setStraight(false);
                  setTubeIssue('kink');
                  record('จำลองสถานการณ์สายพับงอหรือถูกนอนทับ');
                }}
              >
                2. จำลองสายพับงอ / ถูกนอนทับ
              </button>
              <button
                className={tubeIssue === 'dependentLoop' ? 'selected' : ''}
                onClick={() => {
                  setStraight(true);
                  setTubeIssue('dependentLoop');
                  record('จำลองสายคล้อยห้อยท้องช้าง (Dependent loop)');
                }}
              >
                3. จำลองสายคล้อยห้อยท้องช้าง (เสี่ยงติดเชื้อ)
              </button>
            </div>
            {hint && (
              <p>
                {tubeIssue === 'dependentLoop'
                  ? 'หลักฐานทางการแพทย์ (CDC / SHEA / AACN): ห้ามสายห้อยท้องช้างเด็ดขาด เพราะทำให้น้ำปัสสาวะขังคั่งค้าง เชื้อแบคทีเรียเจริญเติบโต และไหลย้อนกลับ (Reflux) สู่กระเพาะปัสสาวะ จึงต้องจัดให้สายลาดเทตรงเสมอ'
                  : !straight
                  ? 'เมื่อสายพับงอหรือถูกทับ ปัสสาวะจะไม่สามารถไหลลงถุงได้ ให้คลายจุดพับแล้วยกสายมาพาดบนหน้าขาอย่างนุ่มนวล'
                  : 'แนวทางที่ถูกต้อง: ให้สายพาดบนหน้าขา ลาดเทตรงลงสู่ถุงอย่างสม่ำเสมอตามแรงโน้มถ่วง'}
              </p>
            )}
          </>
        )}

        {topic === 'trouble' && (
          <>
            <div className="control-row">
              <button
                className={!straight || troubleDemo === 'kink' ? 'selected' : ''}
                onClick={() => {
                  setTroubleDemo('kink');
                  setStraight(false);
                  record('แสดงภาพสาธิต: สายสวนพับงอ ปัสสาวะไม่ไหลลงถุง');
                }}
              >
                1. สายพับงอ (ไม่ไหล)
              </button>
              <button
                className={troubleDemo === 'belly' ? 'selected' : ''}
                onClick={() => {
                  setTroubleDemo('belly');
                  setStraight(true);
                  record('แสดงภาพสาธิต: ปวดตึงท้องน้อย (กระเพาะปัสสาวะคั่ง)');
                }}
              >
                2. ปวดท้องน้อย
              </button>
              <button
                className={troubleDemo === 'leak' ? 'selected' : ''}
                onClick={() => {
                  setTroubleDemo('leak');
                  setStraight(true);
                  record('แสดงภาพสาธิต: ปัสสาวะรั่วซึมรอบสายสวน');
                }}
              >
                3. ปัสสาวะรั่วซึม
              </button>
              <button
                className={troubleDemo === 'flank' ? 'selected' : ''}
                onClick={() => {
                  setTroubleDemo('flank');
                  setStraight(true);
                  record('แสดงภาพสาธิต: ปวดเอว / ปวดสีข้างและหลัง');
                }}
              >
                4. ปวดเอว
              </button>
              <button
                className={troubleDemo === 'blood' ? 'selected' : ''}
                onClick={() => {
                  setTroubleDemo('blood');
                  setStraight(true);
                  record('แสดงภาพสาธิต: ปัสสาวะปนเลือดเป็นสีแดงสด');
                }}
              >
                5. ปัสสาวะปนเลือดสีแดง
              </button>
              <button
                className={troubleDemo === 'fever' ? 'selected' : ''}
                onClick={() => {
                  setTroubleDemo('fever');
                  setStraight(true);
                  record('แสดงภาพสาธิต: มีไข้สูง ปรอทวัดไข้ 38 °C');
                }}
              >
                6. มีไข้ (ปรอท 38 °C)
              </button>
            </div>
            {hint && (
              <p className="text-danger">
                กดปุ่มด้านบนเพื่อดูภาพสาธิตอาการผิดปกติแต่ละแบบ: สายพับงอ · ปวดท้องน้อย · ปัสสาวะรั่วซึม · ปวดเอว · ปัสสาวะปนเลือดสีแดง · มีไข้สูง 38 องศา
              </p>
            )}
          </>
        )}

        {topic === 'followup' && (
          <>
            <div className="control-row">
              <button
                onClick={() => {
                  record('ตรวจใบนัดหมายเปลี่ยนสายที่สถานพยาบาล');
                }}
              >
                1. ตรวจใบนัดสถานพยาบาล
              </button>
              <button
                onClick={() => {
                  record('ข้อบ่งชี้เปลี่ยนสาย: ชำรุด หลุด รั่ว หรือมีตะกอนค้างปัสสาวะไม่ลงถุง');
                }}
              >
                2. เปลี่ยนเมื่อ: ชำรุด / หลุด / รั่ว / มีตะกอนค้าง
              </button>
              <button
                className="selected"
                onClick={() => {
                  record('เน้นย้ำ: ไม่แนะนำให้เปลี่ยนเองหรือปลดข้อต่อ เพื่อคงสภาพระบบปิด ป้องกันการติดเชื้อ');
                }}
              >
                3. คงระบบปิด (ห้ามเปลี่ยนเองหรือปลดข้อต่อ)
              </button>
            </div>
            {hint && (
              <p>
                <strong>คำแนะนำจากทีมพยาบาล:</strong> เปลี่ยนสายเมื่อสายชำรุด หลุด รั่ว หรือมีตะกอนค้าง ปัสสาวะไม่ลงถุง ไม่แนะนำให้เปลี่ยนเอง หรือปลดข้อต่อ เพื่อคงสภาพสายสวนปัสสาวะและถุงรองรับปัสสาวะให้เป็นระบบปิด เพื่อป้องกันการติดเชื้อค่ะ
              </p>
            )}
          </>
        )}

        {topic === 'hygiene' && (
          <>
            <div className="control-row">
              <button
                className={sex === 'female' ? 'selected' : ''}
                onClick={() => {
                  handleSexChange('female');
                  setWipe(true);
                  setPhase(0);
                  record('เลือกคำแนะนำเพศหญิง: เช็ดหน้าไปหลังทิศทางเดียว');
                }}
              >
                คำแนะนำเฉพาะเพศหญิง (เช็ดหน้าไปหลัง)
              </button>
              <button
                className={sex === 'male' ? 'selected' : ''}
                onClick={() => {
                  handleSexChange('male');
                  setWipe(true);
                  setPhase(0);
                  record('เลือกคำแนะนำเพศชาย: รูดเปิดเบา ๆ ล้างสบู่อ่อน');
                }}
              >
                คำแนะนำเฉพาะเพศชาย (รูดเปิดเบา ๆ ล้างสบู่อ่อน)
              </button>
            </div>
            <div className="control-row">
              {sex === 'female' ? (
                <>
                  <button
                    className={wipe && phase === 0 ? 'selected' : ''}
                    onClick={() => {
                      setPhase(0);
                      setWipe(true);
                      record('1. ล้างด้วยสบู่อ่อน: เช็ดทิศทางเดียวจากหน้าไปหลัง (ห้ามถูย้อน)');
                    }}
                  >
                    1. ฟอกสบู่อ่อน (เช็ดหน้าไปหลัง)
                  </button>
                  <button
                    className={wipe && phase === 1 ? 'selected' : ''}
                    onClick={() => {
                      setPhase(1);
                      setWipe(true);
                      record('2. ราดน้ำสะอาดล้างฟองสบู่ออก');
                    }}
                  >
                    2. ราดน้ำสะอาดล้างฟองสบู่
                  </button>
                  <button
                    className={wipe && phase === 2 ? 'selected' : ''}
                    onClick={() => {
                      setPhase(2);
                      setWipe(true);
                      record('3. ซับให้แห้งด้วยผ้าสะอาด');
                    }}
                  >
                    3. ซับให้แห้งด้วยผ้าสะอาด
                  </button>
                </>
              ) : (
                <>
                  <button
                    className={wipe && phase === 0 ? 'selected' : ''}
                    onClick={() => {
                      setPhase(0);
                      setWipe(true);
                      record('1. รูดเปิดหนังหุ้มปลายเบา ๆ และล้างด้วยสบู่อ่อนรอบรูเปิด');
                    }}
                  >
                    1. รูดเปิดเบา ๆ ฟอกสบู่อ่อน
                  </button>
                  <button
                    className={wipe && phase === 1 ? 'selected' : ''}
                    onClick={() => {
                      setPhase(1);
                      setWipe(true);
                      record('2. ราดน้ำสะอาดล้างฟองสบู่ออก');
                    }}
                  >
                    2. ราดน้ำสะอาดล้างฟองสบู่
                  </button>
                  <button
                    className={wipe && phase === 2 ? 'selected' : ''}
                    onClick={() => {
                      setPhase(2);
                      setWipe(true);
                      record('3. ซับให้แห้งด้วยผ้าสะอาด');
                    }}
                  >
                    3. ซับให้แห้งด้วยผ้าสะอาด
                  </button>
                  <button
                    className={phase === 3 ? 'selected' : ''}
                    onClick={() => {
                      setPhase(3);
                      record('4. รูดหนังหุ้มปลายกลับเข้าที่เดิมทันที');
                    }}
                  >
                    4. รูดหนังหุ้มปลายกลับทันที
                  </button>
                </>
              )}
            </div>
            {hint && (
              <p>
                {sex === 'female'
                  ? 'คำแนะนำเฉพาะผู้ป่วยเพศหญิง: ใช้ผ้าชุบน้ำสบู่อ่อน เช็ดในทิศทางเดียวจากด้านหน้าไปด้านหลัง (จากรูเปิดท่อปัสสาวะไปยังทวารหนัก) ห้ามเช็ดถูย้อนไปมาเด็ดขาด เพื่อป้องกันการติดเชื้อ'
                  : 'คำแนะนำเฉพาะผู้ป่วยเพศชาย: ค่อย ๆ รูดเปิดหนังหุ้มปลายเบา ๆ เท่าที่ทำได้ ล้างด้วยสบู่อ่อนรอบรูเปิดและสายสวน ซับให้แห้ง แล้วรูดหนังหุ้มปลายกลับเข้าที่เดิมทันที เพื่อป้องกันภาวะบวมรัด (Paraphimosis)'}
              </p>
            )}
          </>
        )}

        {feedback && (
          <p className="scene-feedback" role="status">
            {hint ? feedback : 'บันทึกการปฏิบัติแล้ว'}
          </p>
        )}
      </div>
    </div>
  );
}
