import type { ClientAction, GameView } from "./engine.ts";
import type { Text } from "./i18n.ts";

export type ClientMessage =
  | { type: "hello"; playerId: string; token: string; name: string; solo?: boolean }
  | { type: "action"; action: ClientAction }
  | { type: "answer"; text: string }
  /** Picks one of the "Querias dizer…?" options. */
  | { type: "choose"; qid: number }
  | { type: "trump" }
  /** What the player on the clock is typing, relayed live to the others. */
  | { type: "typing"; text: string }
  | { type: "ping" };

export type ServerMessage =
  | { type: "state"; view: GameView }
  | { type: "typing"; playerId: string; text: string }
  | { type: "error"; message: Text; fatal?: boolean }
  | { type: "pong"; serverNow: number };
