import { useId, useState } from "react";
import { User } from "lucide-react";

/** A red STOP road sign. */
export function StopSign({ size = 44, text = "STOP" }: { size?: number; text?: string }) {
  const pts = Array.from({ length: 8 }, (_, i) => {
    const a = ((22.5 + i * 45) * Math.PI) / 180;
    return `${50 + 48 * Math.cos(a)},${50 + 48 * Math.sin(a)}`;
  }).join(" ");
  const inner = Array.from({ length: 8 }, (_, i) => {
    const a = ((22.5 + i * 45) * Math.PI) / 180;
    return `${50 + 42 * Math.cos(a)},${50 + 42 * Math.sin(a)}`;
  }).join(" ");
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden className="stop-sign">
      <polygon points={pts} fill="#ffffff" />
      <polygon points={inner} fill="#d62828" />
      {text && (
        <text x="50" y="51" textAnchor="middle" dominantBaseline="central" fill="#ffffff" fontFamily="Anton, Impact, sans-serif" fontSize="30" letterSpacing="1">
          {text}
        </text>
      )}
    </svg>
  );
}

/** "FOOT" + a STOP sign. */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <span className="logo" style={{ fontSize: size * 0.62 }}>
      <span className="logo-foot">FOOT</span>
      <StopSign size={size} />
    </span>
  );
}

function pentagon(cx: number, cy: number, r: number, rot: number): [number, number][] {
  return Array.from({ length: 5 }, (_, k) => {
    const a = ((rot + k * 72) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number];
  });
}

const P = 12.5; // centre pentagon radius
const D = 39; // distance of the outer pentagons
const Q = 11; // outer pentagon radius
const CENTRE = pentagon(0, 0, P, -90);
const OUTER = Array.from({ length: 5 }, (_, k) => {
  const a = -90 + k * 72;
  const rad = (a * Math.PI) / 180;
  return pentagon(D * Math.cos(rad), D * Math.sin(rad), Q, a + 180);
});
const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
// Seams closing the hexagons between neighbouring outer pentagons.
const SEAMS: [number, number][][] = [];
for (let k = 0; k < 5; k++) {
  const a = OUTER[k];
  const b = OUTER[(k + 1) % 5];
  SEAMS.push([CENTRE[k], a[0]]);
  let best: [[number, number], [number, number]] = [a[1], b[1]];
  for (const va of [a[1], a[4]]) for (const vb of [b[1], b[4]]) if (dist(va, vb) < dist(best[0], best[1])) best = [va, vb];
  SEAMS.push(best);
}
const path = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L")}Z`;

/** A proper black-and-white football (truncated icosahedron), shaded. */
export function Ball({ size = 30, spin = 0 }: { size?: number; spin?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="-50 -50 100 100" aria-hidden className="ball">
      <defs>
        <radialGradient id={`s${id}`} cx="36%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#eeeeee" />
          <stop offset="100%" stopColor="#a9a9a9" />
        </radialGradient>
        <clipPath id={`c${id}`}>
          <circle r="46" />
        </clipPath>
      </defs>
      <circle r="46" fill={`url(#s${id})`} />
      <g clipPath={`url(#c${id})`} transform={`rotate(${spin})`}>
        <g stroke="#2b2b2b" strokeWidth="1.6" strokeLinecap="round">
          {SEAMS.map(([a, b], i) => (
            <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
          ))}
        </g>
        <path d={path(CENTRE)} fill="#161616" stroke="#161616" strokeWidth="1.5" strokeLinejoin="round" />
        {OUTER.map((pts, i) => (
          <path key={i} d={path(pts)} fill="#161616" stroke="#161616" strokeWidth="1.5" strokeLinejoin="round" />
        ))}
      </g>
      {/* Light from the top left, shadow on the other side. */}
      <circle r="46" fill={`url(#s${id})`} opacity=".25" />
      <ellipse cx="-16" cy="-20" rx="13" ry="8" fill="#ffffff" opacity=".55" transform="rotate(-35 -16 -20)" />
      <circle r="46" fill="none" stroke="#1d1d1d" strokeWidth="2" />
    </svg>
  );
}

export function Face({ src, size = 30 }: { src?: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  return src && !broken ? (
    <img className="face" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} onError={() => setBroken(true)} />
  ) : (
    <span className="face face-empty" style={{ width: size, height: size }}>
      <User size={size * 0.55} />
    </span>
  );
}

/** A player's name on a paper tag (used in lists and tables). */
export function NameTag({ name, color, size = "md" }: { name: string; color: string; size?: "sm" | "md" }) {
  return (
    <span className={`name-tag name-tag-${size}`} style={{ ["--pc" as string]: color }}>
      {name}
    </span>
  );
}
