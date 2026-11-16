import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { WifiOff } from "lucide-react";
import { useI18n } from "../lib/i18n.tsx";
import type { GameView, PlayerView } from "../../shared/engine.ts";
import { clockOf, secs } from "../lib/clock.ts";
import { Ball } from "./Brand.tsx";

export interface PitchLayout {
  /** Centre circle diameter (px). */
  d: number;
  /** Category card and timer beside the circle (wide screens) or above it. */
  wide: boolean;
  compact: boolean;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(() => Math.min(window.innerWidth, 1100));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

// Players sit on the top and bottom arcs of the circle, leaving its sides to the category (left)
// and the clock (right). Clockwise from me at the bottom.
const ARC = 50;
function seatAngle(k: number, n: number): number {
  if (k === 0 || n < 2) return 180;
  const u = (k * 4 * ARC) / n;
  if (u < ARC) return 180 + u;
  if (u < 3 * ARC) return 360 - ARC + (u - ARC);
  return 180 - ARC + (u - 3 * ARC);
}

/**
 * The centre circle: players' name tags around it, the ball passed in a straight line to whoever
 * is on the clock, the category on the left, my clock on the right and the answer area inside.
 */
export function Pitch({
  view,
  now,
  hop,
  left,
  right,
  below,
  center,
}: {
  view: GameView;
  now: number;
  hop: number;
  /** The category (left of the circle). */
  left: (l: PitchLayout) => ReactNode;
  /** The clock (right of the circle). */
  right: (l: PitchLayout) => ReactNode;
  /** The table (under the clock, or under the circle on narrow screens). */
  below: (l: PitchLayout) => ReactNode;
  center: (l: PitchLayout) => ReactNode;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const { t } = useI18n();
  const vh = window.innerHeight;
  const wide = w >= 1080;
  const GAP = w >= 1400 ? 80 : 60;
  const compact = w < 560;
  const tagH = compact ? 48 : 60;
  const room = w - 2 * GAP - 460;
  const leftW = wide ? Math.round(Math.min(430, Math.max(320, room * 0.56))) : 0;
  const rightW = wide ? Math.round(Math.min(330, Math.max(260, room * 0.44))) : 0;
  const d = Math.round(
    Math.max(
      compact ? 250 : 300,
      Math.min(wide ? 600 : 480, wide ? w - leftW - rightW - 2 * GAP : w - 24, vh - 84 - 2 * (tagH + 40) - (wide ? 20 : 170)),
    ),
  );
  // Room for the board and the table beside the circle.
  const column = wide ? 330 + 46 + 34 * view.players.length : 0;
  const h = Math.max(d + 2 * (tagH + 40), column + 40);
  // The circle sits between the two columns (a bit right of centre when the sheet is wider).
  const cx = wide ? (w - (leftW + rightW + 2 * GAP + d)) / 2 + leftW + GAP + d / 2 : w / 2;
  const cy = h / 2;
  const layout: PitchLayout = { d, wide, compact };

  const r = view.round!;
  const seated = r.order.map((id) => view.players.find((p) => p.id === id)).filter((p): p is PlayerView => !!p);
  const n = seated.length;
  const meIdx = Math.max(0, seated.findIndex((p) => p.id === view.me));
  const angleOf = (i: number) => seatAngle((i - meIdx + n) % n, n);
  const at = (deg: number, radius: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: cx + radius * Math.sin(a), y: cy - radius * Math.cos(a) };
  };
  const tagR = d / 2 + tagH / 2 + 22;
  const activeIdx = seated.findIndex((p) => p.id === r.turn?.playerId);
  // The ball waits just inside the circle, at the feet of whoever is playing.
  const ball = at(activeIdx >= 0 ? angleOf(activeIdx) : 180, d / 2 - (compact ? 20 : 28));

  return (
    <>
      {!wide && (
        <div className="round-head">
          {left(layout)}
          {right(layout)}
        </div>
      )}
      <div ref={ref} className="pitch" style={{ height: h }}>
        <div className="pitch-line" style={{ left: cx }} />
        <div className="pitch-circle" style={{ width: d, height: d, left: cx - d / 2, top: cy - d / 2 }} />
        <div className="pitch-inner" style={{ width: d, height: d, left: cx - d / 2, top: cy - d / 2 }}>
          {center(layout)}
        </div>
        {wide && (
          <>
            <div className="pitch-side pitch-left" style={{ width: leftW, left: cx - d / 2 - GAP - leftW, top: cy }}>
              {left(layout)}
            </div>
            <div className="pitch-side pitch-right" style={{ width: rightW, left: cx + d / 2 + GAP, top: cy }}>
              {right(layout)}
              {below(layout)}
            </div>
          </>
        )}

        {seated.map((p, i) => {
          const angle = angleOf(i);
          const pos = at(angle, tagR);
          const isActive = i === activeIdx && view.phase === "round";
          const out = !p.alive;
          return (
            <motion.div
              key={p.id}
              className={`seat ${isActive ? "seat-active" : ""} ${out ? "seat-out" : ""} ${p.id === view.me ? "seat-me" : ""}`}
              style={{ left: pos.x, top: pos.y, ["--pc" as string]: p.color, ["--tilt" as string]: `${((i * 37) % 5) - 2}deg` }}
              animate={{ scale: isActive ? 1.08 : 1 }}
            >
              <span className="seat-tag">
                {p.name}
                {p.id === view.me && <small> {t.you}</small>}
                {p.trump && !out && (
                  <span className="seat-trump" title={t.hasTrump}>
                    T
                  </span>
                )}
                {!p.connected && <WifiOff size={11} className="seat-off" />}
              </span>
              <span className="seat-time">{out ? t.outShort : `${secs(clockOf(view, p, now))} s`}</span>
            </motion.div>
          );
        })}

        {view.phase === "round" && activeIdx >= 0 && now >= r.startAt - 400 && (
          <motion.div
            className="ball-token"
            initial={false}
            animate={{ left: ball.x, top: ball.y }}
            transition={{ duration: 0.32, ease: [0.25, 0.8, 0.35, 1] }}
          >
            <motion.div key={hop} animate={hop ? { rotate: [0, 360], scale: [1, 1.18, 1] } : {}} transition={{ duration: 0.4 }}>
              <Ball size={compact ? 30 : 40} />
            </motion.div>
          </motion.div>
        )}
      </div>
      {!wide && <div className="round-foot">{below(layout)}</div>}
    </>
  );
}
