import { motion } from "motion/react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { rankOf, type GameView, type PlayerView } from "../../shared/engine.ts";
import type { GameStats } from "../../shared/stats.ts";
import { Face, NameTag } from "./Brand.tsx";
import { useI18n } from "../lib/i18n.tsx";

export function standings(players: PlayerView[]) {
  return [...players]
    .sort((a, b) => b.points - a.points || b.roundsWon - a.roundsWon || b.names - a.names || a.name.localeCompare(b.name))
    .map((p) => ({ p, rank: rankOf(players, p.id) }));
}

/** Points each player got in the last round (from its placements). */
function lastGain(view: GameView): Record<string, number> {
  const r = view.round;
  if (!r?.placements || r.sudden) return {};
  const n = r.placements.length;
  return Object.fromEntries(r.placements.map((id, i) => [id, n - 1 - i]));
}

function FormDots({ form, size }: { form: number[]; size: number }) {
  const { t } = useI18n();
  return (
    <span className="form" title={t.formTitle}>
      {form.slice(-5).map((place, i) => (
        <i key={i} className={place === 0 ? "" : place === 1 ? "w" : place === size ? "l" : "m"} />
      ))}
    </span>
  );
}

/** The league table: position, points, rounds won, names and form. */
export function LeagueTable({ view, showMoves = true }: { view: GameView; showMoves?: boolean }) {
  const rows = standings(view.players);
  const gains = lastGain(view);
  const size = view.players.length;
  const { t } = useI18n();
  return (
    <table className="league">
      <thead>
        <tr>
          <th>{t.pos}</th>
          <th>{t.player}</th>
          <th title={t.pointsTitle}>Pts</th>
          <th title={t.roundsWon}>{t.rw}</th>
          <th title={t.namesTitle}>{t.namesCol}</th>
          <th>{t.form}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ p, rank }, i) => {
          const move = p.prevRank ? p.prevRank - rank : 0;
          return (
            <motion.tr
              key={p.id}
              layout
              className={`${p.id === view.me ? "me" : ""} ${rank === 1 ? "leader" : ""}`}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <td className="l-pos">
                {rank}.
                {showMoves && move > 0 && (
                  <span className="l-move up">
                    <ChevronUp size={12} />
                  </span>
                )}
                {showMoves && move < 0 && (
                  <span className="l-move down">
                    <ChevronDown size={12} />
                  </span>
                )}
              </td>
              <td className="l-name">
                <span className="avatar-line">
                  <NameTag name={p.name} color={p.color} size="sm" />
                  {p.id === view.me && <span className="you">{t.you}</span>}
                </span>
              </td>
              <td>
                <span className="l-pts">{p.points}</span>
                {showMoves && gains[p.id] ? <span className="l-gain">+{gains[p.id]}</span> : null}
              </td>
              <td>{p.roundsWon}</td>
              <td>{p.names}</td>
              <td>
                <FormDots form={p.form} size={size} />
              </td>
            </motion.tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function StatCards({ stats, view }: { stats: GameStats; view: GameView }) {
  const color = (id?: string) => view.players.find((p) => p.id === id)?.color;
  const { tr } = useI18n();
  return (
    <div className="stats-grid">
      {stats.cards.map((c, i) => (
        <motion.div key={c.key} className="stat-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.06 }}>
          {c.image ? <Face src={c.image} size={38} /> : c.playerId ? <span className="stat-dot" style={{ background: color(c.playerId) ?? "#888" }} /> : null}
          <div>
            <div className="stat-title">{tr(c.title)}</div>
            <div className="stat-text">{tr(c.text)}</div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
