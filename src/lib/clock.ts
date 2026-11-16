import { SUDDEN_MS, type GameView, type PlayerView } from "../../shared/engine.ts";

/** Clock left for a player at `now` (only the player on turn is ticking). */
export function clockOf(view: GameView, p: PlayerView, now: number): number {
  const t = view.round?.turn;
  if (!t || t.playerId !== p.id || view.phase !== "round") return p.bankMs;
  const at = t.pausedAt ?? now;
  return p.bankMs - Math.max(0, Math.min(at, now) - t.startedAt);
}

export function roundBank(view: GameView) {
  return view.round?.sudden ? SUDDEN_MS : view.settings.seconds * 1000;
}

/** Whole seconds, rounded up (a clock showing 0 means the time is really up). */
export function secs(ms: number) {
  return Math.max(0, Math.ceil(ms / 1000));
}
