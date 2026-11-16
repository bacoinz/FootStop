import { motion } from "motion/react";
import { SPIN_MS, type GameView } from "../../shared/engine.ts";
import { clockOf, roundBank, secs } from "../lib/clock.ts";
import { standings } from "./Board.tsx";
import { SubBoard } from "./SubBoard.tsx";
import type { PitchLayout } from "./Pitch.tsx";
import { useI18n, type Dict } from "../lib/i18n.tsx";

export function roundLabel(view: GameView, t: Dict) {
  const r = view.round;
  if (!r) return "";
  if (r.sudden) return t.suddenDeath;
  if (view.kind === "solo") return t.roundN(r.n);
  return t.roundNofM(r.n, view.settings.rounds);
}

export function Lives({ left, total }: { left: number; total: number }) {
  const { t } = useI18n();
  return (
    <span className="lives" title={t.livesLeft(left, total)}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`life ${i < left ? "" : "gone"}`} />
      ))}
    </span>
  );
}

/** The round's letter or category, written on a sheet of paper (left of the circle). */
export function CategoryCard({ view, now, layout }: { view: GameView; now: number; layout: PitchLayout }) {
  const r = view.round!;
  const p = r.prompt;
  const drawn = now - r.introAt >= SPIN_MS;
  const { t, tr } = useI18n();
  return (
    <div className={`paper category-card ${layout.wide ? "" : "category-card-row"}`}>
      <span className="tape" />
      <div className="cat-round">
        {roundLabel(view, t)}
        {view.solo && (
          <>
            {" "}
            · <Lives left={view.solo.lives} total={view.settings.lives} />
          </>
        )}
      </div>
      {drawn ? (
        <motion.div key={`drawn-${r.introAt}`} className="cat-body" initial={{ scale: 1.3, rotate: -5 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 16 }}>
          <div className="cat-family">{t.family[p.family]}</div>
          {p.flag && <span className={`fi fi-${p.flag} cat-flag`} />}
          {p.family === "letter" ? <div className="cat-letter">{tr(p.title)}</div> : <div className="cat-title">{tr(p.title)}</div>}
          {p.subtitle && <div className="cat-sub">{p.family === "letter" ? t.letterHint : tr(p.subtitle)}</div>}
        </motion.div>
      ) : (
        <div className="cat-body">
          <div className="cat-family">{t.draw}</div>
          <div className="cat-title cat-wait">{t.spinning}</div>
        </div>
      )}
      {view.solo && (
        <div className="cat-score">
          {t.names(view.solo.score)}
        </div>
      )}
    </div>
  );
}

/** My own clock, on the fourth official's board (right of the circle). */
export function MyClock({ view, now, layout }: { view: GameView; now: number; layout: PitchLayout }) {
  const me = view.players.find((p) => p.id === view.me);
  const r = view.round!;
  const bank = roundBank(view);
  const out = !me?.inRound || !me.alive;
  const ms = me ? clockOf(view, me, now) : 0;
  const mine = r.turn?.playerId === view.me && now >= r.startAt;
  const low = mine && ms <= 5000 && !r.turn?.pausedAt;
  const width = layout.wide ? 250 : layout.compact ? 128 : 170;
  const { t } = useI18n();
  return (
    <div className="my-clock">
      <SubBoard
        seconds={out ? null : secs(ms)}
        fraction={out ? 0 : ms / bank}
        low={low}
        active={mine}
        label={out ? t.out : mine ? t.yourTurnBoard : t.time}
        width={width}
      />
    </div>
  );
}

/** The table so far, small, under the board. */
export function MiniTable({ view }: { view: GameView }) {
  const { t } = useI18n();
  if (view.kind === "solo") return null;
  const rows = standings(view.players);
  return (
    <div className="paper mini-table">
      <div className="mt-title">{t.table}</div>
      <table>
        <thead>
          <tr>
            <th />
            <th />
            <th title={t.pointsTitle}>{t.pts.replace(/^./, (c) => c.toUpperCase())}</th>
            <th title={t.namesTitle}>{t.namesCol}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, rank }) => (
            <tr key={p.id} className={p.id === view.me ? "me" : ""}>
              <td className="mt-pos">{rank}.</td>
              <td className="mt-name" style={{ ["--pc" as string]: p.color }}>
                {p.name}
              </td>
              <td className="mt-pts">{p.points}</td>
              <td className="mt-names">{p.names}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
