import { useEffect, useRef } from "react";
import { useI18n } from "../lib/i18n.tsx";
import { SPIN_MS, type RoundView } from "../../shared/engine.ts";
import { sfx } from "../lib/sound.ts";
import { serverNow } from "../lib/useRoom.ts";

const TURNS = 4;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Wheel rotation (degrees, clockwise) at a moment of the spin, so the chosen slice ends on top. */
export function wheelAngle(round: RoundView, now: number) {
  const n = Math.max(1, round.wheel.length);
  const final = 360 * TURNS - (round.wheelIndex * 360) / n;
  const t = Math.min(1, Math.max(0, (now - round.introAt) / SPIN_MS));
  return final * easeOut(t);
}

function slicePath(r: number, a0: number, a1: number) {
  const p = (a: number) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return `${(r * Math.cos(rad)).toFixed(2)} ${(r * Math.sin(rad)).toFixed(2)}`;
  };
  return `M0 0L${p(a0)}A${r} ${r} 0 0 1 ${p(a1)}Z`;
}

/**
 * The centre circle turned into a wheel for the draw: grass-striped slices with the options,
 * spinning for 3 s and stopping with the round's prompt under the red marker.
 */
export function CenterWheel({ round, d, stopped }: { round: RoundView; d: number; stopped: boolean }) {
  const g = useRef<SVGGElement>(null);
  const { tr } = useI18n();
  const n = Math.max(1, round.wheel.length);
  const step = 360 / n;
  const r = d / 2 - 3;

  useEffect(() => {
    let raf = 0;
    let lastSlice = -1;
    let lastTick = 0;
    const frame = () => {
      const now = serverNow();
      const angle = wheelAngle(round, now);
      if (g.current) g.current.setAttribute("transform", `rotate(${angle.toFixed(2)})`);
      // A flap sound each time a slice passes the marker (not more than ~25 a second).
      const slice = Math.floor((angle + step / 2) / step);
      if (slice !== lastSlice && now - round.introAt < SPIN_MS) {
        if (lastSlice !== -1 && performance.now() - lastTick > 40) {
          sfx.flip();
          lastTick = performance.now();
        }
        lastSlice = slice;
      }
      if (now - round.introAt < SPIN_MS + 100) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [round, step]);

  const fontFor = (label: string) => (label.length === 1 ? d * 0.085 : Math.min(d * 0.043, (r * 0.62) / (label.length * 0.5)));

  return (
    <svg className={`center-wheel ${stopped ? "stopped" : ""}`} width={d} height={d} viewBox={`${-d / 2} ${-d / 2} ${d} ${d}`} aria-hidden>
      <g ref={g} transform={`rotate(${wheelAngle(round, serverNow()).toFixed(2)})`}>
        {round.wheel.map((text, i) => {
          const label = tr(text);
          const a0 = i * step - step / 2;
          const win = stopped && i === round.wheelIndex;
          return (
            <g key={i}>
              <path d={slicePath(r, a0, a0 + step)} fill={win ? "#d62828" : i % 2 ? "#1c6a39" : "#155a2f"} stroke="rgba(255,255,255,.75)" strokeWidth="2" />
              <g transform={`rotate(${i * step})`}>
                <text
                  x="0"
                  y={-r * 0.6}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#ffffff"
                  opacity={stopped && !win ? 0.45 : 1}
                  fontFamily="Anton, Impact, sans-serif"
                  fontSize={fontFor(label)}
                  transform={label.length === 1 ? undefined : `rotate(-90 0 ${-r * 0.6})`}
                >
                  {label}
                </text>
              </g>
            </g>
          );
        })}
      </g>
      <circle r={d * 0.12} fill="#f4f1e8" stroke="rgba(0,0,0,.25)" strokeWidth="2" />
      <circle r={d * 0.035} fill="#0f3d24" />
      {/* The marker at the top. */}
      <path d={`M${-d * 0.045} ${-r - 8}L${d * 0.045} ${-r - 8}L0 ${-r + d * 0.07}Z`} fill="#d62828" stroke="#ffffff" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}
