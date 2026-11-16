// Authoritative game engine: pure logic that mutates the state passed in.
// Runs inside the Durable Object (which does the name checks) and is unit-tested directly.

import type { Category, Family } from "./categories.ts";
import { fold } from "./text.ts";
import { tx, type Text } from "./i18n.ts";
import { computeStats, type GameStats } from "./stats.ts";

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;
export const SECONDS_OPTIONS = [30, 45, 60] as const;
export const ROUNDS_OPTIONS = [5, 8, 10] as const;
export const LIVES_OPTIONS = [1, 3, 5] as const;
/** The centre circle spins as a wheel for 4 s, then 6 s until the first clock starts. */
export const SPIN_MS = 4000;
export const INTRO_MS = 10_000;
/** How long the winning slice stays lit before the countdown takes over the circle. */
export const REVEAL_MS = 900;
export const WHEEL_SLICES = 12;
export const ROUND_END_MS = 12_000;
export const SOLO_ROUND_END_MS = 3500;
export const BONUS_MS = 2000;
export const PASS_PENALTY_MS = 5000;
export const SUDDEN_MS = 15_000;
/** A Wikidata check never freezes a clock for longer than this. */
export const MAX_PAUSE_MS = 3000;

export const PLAYER_COLORS = ["#3b82f6", "#f97316", "#ec4899", "#a855f7", "#eab308", "#06b6d4", "#ef4444", "#22c55e"];

export type Mode = "letters" | "categories" | "mixed";
export type Kind = "multi" | "solo";
export type Phase = "lobby" | "round" | "roundEnd" | "gameEnd";

export interface Settings {
  seconds: number;
  rounds: number;
  mode: Mode;
  lives: number;
}

export interface Player {
  id: string;
  token: string;
  name: string;
  color: string;
  connected: boolean;
  points: number;
  roundsWon: number;
  /** Names accepted (the trump's don't count). */
  names: number;
  trumpsUsed: number;
  /** Place in each round played (1 = won), 0 = didn't play it. */
  form: number[];
  /** Rank in the table before the last round (for ▲▼). */
  prevRank: number;
  /** Clock left at the start of the next turn. */
  bankMs: number;
  inRound: boolean;
  alive: boolean;
  /** Holds a trump card for this round. */
  trump: boolean;
}

export interface PromptView {
  id: string;
  family: Family;
  title: Text;
  subtitle?: Text;
  flag?: string;
}

/** One option of "Querias dizer…?" (validity and message stay on the server). */
export interface ChoiceOption {
  qid: number;
  name: string;
  hint?: Text;
  image?: string;
  valid: boolean;
  /** Why it doesn't fit (shown if picked). */
  message?: Text;
}

export interface Turn {
  playerId: string;
  startedAt: number;
  /** Clock frozen while an unknown name is checked on Wikidata. */
  pausedAt: number | null;
  /** Text being checked. */
  checking: string | null;
  /** A vague name waiting for the player to pick one of the options. */
  choice?: { text: string; options: ChoiceOption[] } | null;
  seq: number;
}

export interface Round {
  n: number;
  sudden: boolean;
  category: Category;
  view: PromptView;
  introAt: number;
  startAt: number;
  order: string[];
  turn: Turn | null;
  /** QID numbers said this round (never sent to clients). */
  used: number[];
  /** Typed names (folded) accepted this round, so the same name can't be said twice. */
  usedKeys: string[];
  /** Labels on the wheel's slices, and which one the round landed on. */
  wheel: Text[];
  wheelIndex: number;
  eliminated: string[];
  answers: number;
  endedAt: number | null;
  /** 1st … last. */
  placements: string[] | null;
}

export type EventKind = "ok" | "miss" | "ambiguous" | "choose" | "pass" | "out" | "trump" | "life";

export interface GameEvent {
  id: number;
  at: number;
  kind: EventKind;
  playerId: string;
  text?: string;
  name?: string;
  image?: string;
  message?: Text;
  /** Seconds added (ok/trump) or removed (pass). */
  delta?: number;
  reason?: "time" | "pass" | "miss";
}

export interface LogItem {
  round: number;
  playerId: string;
  kind: "ok" | "miss" | "ambiguous" | "pass" | "out" | "trump";
  /** Time into the turn. */
  ms: number;
  /** Clock left when it happened. */
  left: number;
  qid?: number;
  name?: string;
  image?: string;
  sudden?: boolean;
}

export interface RoundSummary {
  n: number;
  sudden: boolean;
  title: Text;
  family: Family;
  answers: number;
  winnerId: string | null;
}

export interface Solo {
  lives: number;
  score: number;
}

export interface GameState {
  code: string;
  kind: Kind;
  hostId: string | null;
  settings: Settings;
  phase: Phase;
  players: Player[];
  round: Round | null;
  roundEndAt: number | null;
  usedPrompts: string[];
  history: RoundSummary[];
  event: GameEvent | null;
  log: LogItem[];
  solo: Solo | null;
  championId: string | null;
  stats: GameStats | null;
  gameNo: number;
  seq: number;
  lastActivity: number;
}

export type ClientAction =
  | { type: "settings"; seconds?: number; rounds?: number; mode?: Mode; lives?: number }
  | { type: "start" }
  | { type: "pass" }
  | { type: "trump" }
  | { type: "next" }
  | { type: "kick"; playerId: string }
  | { type: "rematch" };

export type Rng = () => number;

export interface EngineEnv {
  categories: Category[];
  rng?: Rng;
}

// ---------------------------------------------------------------------------

export function createGame(code: string, kind: Kind, now: number): GameState {
  return {
    code,
    kind,
    hostId: null,
    settings: { seconds: 45, rounds: 8, mode: "mixed", lives: 3 },
    phase: "lobby",
    players: [],
    round: null,
    roundEndAt: null,
    usedPrompts: [],
    history: [],
    event: null,
    log: [],
    solo: null,
    championId: null,
    stats: null,
    gameNo: 0,
    seq: 1,
    lastActivity: now,
  };
}

function player(s: GameState, id: string | null | undefined) {
  return s.players.find((p) => p.id === id);
}

/** The host keeps the role across reconnects; while away, the first connected player stands in. */
export function effectiveHost(s: GameState): string | null {
  const host = player(s, s.hostId);
  if (host?.connected) return host.id;
  return s.players.find((p) => p.connected)?.id ?? s.hostId;
}

function emit(s: GameState, e: Omit<GameEvent, "id">) {
  s.event = { id: s.seq++, ...e };
}

// --- Players ---------------------------------------------------------------

export interface JoinInfo {
  id: string;
  token: string;
  name: string;
}

function cleanName(name: string) {
  return name.replace(/\s+/g, " ").trim().slice(0, 16);
}

/** Adds or reconnects a player. Returns an error message or null. */
export function join(s: GameState, info: JoinInfo, now: number): Text | null {
  const existing = player(s, info.id);
  if (existing) {
    if (existing.token !== info.token) return tx("Sessão inválida.", "Invalid session.");
    existing.connected = true;
    if (info.name) existing.name = cleanName(info.name);
    if (!player(s, s.hostId)) s.hostId = existing.id;
    return null;
  }
  if (s.kind === "solo" && s.players.length >= 1) return tx("Esta sala é de um jogador só.", "This room is for one player only.");
  if (s.players.length >= MAX_PLAYERS) return tx("A sala está cheia (máx. 8 jogadores).", "The room is full (max. 8 players).");
  const used = new Set(s.players.map((p) => p.color));
  s.players.push({
    id: info.id,
    token: info.token,
    name: cleanName(info.name) || `Jogador ${s.players.length + 1}`,
    color: PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[0],
    connected: true,
    points: 0,
    roundsWon: 0,
    names: 0,
    trumpsUsed: 0,
    form: [],
    prevRank: 0,
    bankMs: 0,
    inRound: false,
    alive: false,
    trump: false,
  });
  if (!player(s, s.hostId)) s.hostId = info.id;
  s.lastActivity = now;
  return null;
}

export function disconnect(s: GameState, id: string) {
  const p = player(s, id);
  if (p) p.connected = false;
}

// --- Prompts -----------------------------------------------------------------

/** Letters or categories (by mode), never repeating one in the same game. */
/** In mixed mode, the share of rounds that are a category (the rest are letters). */
export const CATEGORY_SHARE = 1 / 3;

/** A random item, more likely the heavier it is. */
function weighted<T>(items: T[], weight: (t: T) => number, rng: Rng): T {
  const total = items.reduce((sum, it) => sum + Math.max(0, weight(it)), 0);
  if (total <= 0) return items[Math.floor(rng() * items.length)];
  let x = rng() * total;
  for (const it of items) {
    x -= Math.max(0, weight(it));
    if (x < 0) return it;
  }
  return items[items.length - 1];
}

/**
 * Letters or categories (by mode; in mixed mode a category 1 time in 3), never repeating one in
 * the same game. Common letters come up more often (weighted by how many players they have).
 */
export function pickCategory(categories: Category[], mode: Mode, used: string[], rng: Rng = Math.random): Category | null {
  const fresh = categories.filter((c) => !used.includes(c.id));
  const pool = fresh.length ? fresh : categories;
  const letters = pool.filter((c) => c.family === "letter");
  const others = pool.filter((c) => c.family !== "letter");
  let from: Category[];
  if (mode === "letters") from = letters;
  else if (mode === "categories") from = others;
  else from = (rng() >= CATEGORY_SHARE && letters.length) || !others.length ? letters : others;
  if (!from.length) from = pool;
  if (!from.length) return null;
  if (from.every((c) => c.family === "letter")) return weighted(from, (c) => c.answers, rng);
  // Each family equally likely, so 60 clubs don't crowd out everything else.
  const families = [...new Set(from.map((c) => c.family))];
  const fam = families[Math.floor(rng() * families.length)];
  from = from.filter((c) => c.family === fam);
  return from[Math.floor(rng() * from.length)];
}

function viewOf(c: Category): PromptView {
  return { id: c.id, family: c.family, title: c.title, subtitle: c.subtitle, flag: c.flag };
}

/** The wheel's slices: the round's prompt among others of the same mode, shuffled. */
export function wheelFor(chosen: Category, categories: Category[], mode: Mode, rng: Rng = Math.random): { wheel: Text[]; index: number } {
  const label = (c: Category) => c.short ?? c.title;
  const same = (a: Category, b: Category) => label(a).pt === label(b).pt;
  const pool = categories.filter(
    (c) => c.id !== chosen.id && !same(c, chosen) && (mode === "letters" ? c.family === "letter" : mode === "categories" ? c.family !== "letter" : true),
  );
  const picked: Category[] = [];
  while (picked.length < WHEEL_SLICES - 1 && pool.length) {
    // In mixed mode, alternate letters and categories.
    // In mixed mode, two letters for every category (like the odds of the draw).
    const wantLetter = mode === "mixed" ? picked.length % 3 !== 2 : mode === "letters";
    let candidates = pool.filter((c) => (c.family === "letter") === wantLetter);
    if (!candidates.length) candidates = pool;
    const c = candidates[Math.floor(rng() * candidates.length)];
    if (!picked.some((p) => same(p, c))) picked.push(c);
    pool.splice(pool.indexOf(c), 1);
  }
  const wheel = picked.map(label);
  const index = Math.floor(rng() * (wheel.length + 1));
  wheel.splice(index, 0, label(chosen));
  return { wheel, index };
}

// --- Rounds ------------------------------------------------------------------

function ranked(s: GameState): Player[] {
  return [...s.players].sort((a, b) => b.points - a.points || b.roundsWon - a.roundsWon || b.names - a.names);
}

/** Table rank (1-based, ties share the rank). */
export function rankOf(players: Pick<Player, "id" | "points" | "roundsWon" | "names">[], id: string): number {
  const me = players.find((p) => p.id === id);
  if (!me) return 0;
  return 1 + players.filter((p) => p.points > me.points || (p.points === me.points && (p.roundsWon > me.roundsWon || (p.roundsWon === me.roundsWon && p.names > me.names)))).length;
}

function beginRound(s: GameState, env: EngineEnv, now: number, opts: { sudden?: boolean; participants?: string[]; starter?: string } = {}) {
  const rng = env.rng ?? Math.random;
  const category = pickCategory(env.categories, s.settings.mode, s.usedPrompts, rng);
  if (!category) throw new Error("Sem categorias disponíveis");
  s.usedPrompts.push(category.id);
  const sudden = !!opts.sudden;
  const ids = opts.participants ?? s.players.map((p) => p.id);
  // Seat order, starting with the starter.
  const seats = s.players.map((p) => p.id).filter((id) => ids.includes(id));
  const start = Math.max(0, seats.indexOf(opts.starter ?? seats[0]));
  const order = [...seats.slice(start), ...seats.slice(0, start)];
  const bank = sudden ? SUDDEN_MS : s.settings.seconds * 1000;
  for (const p of s.players) {
    const plays = order.includes(p.id);
    p.inRound = plays;
    p.alive = plays;
    p.bankMs = plays ? bank : 0;
    if (!plays || sudden) p.trump = false;
  }
  const n = (s.round?.n ?? 0) + 1;
  const startAt = now + INTRO_MS;
  const { wheel, index } = wheelFor(category, env.categories, s.settings.mode, rng);
  s.round = {
    n,
    sudden,
    category,
    view: viewOf(category),
    introAt: now,
    startAt,
    order,
    turn: { playerId: order[0], startedAt: startAt, pausedAt: null, checking: null, choice: null, seq: s.seq++ },
    used: [],
    usedKeys: [],
    wheel,
    wheelIndex: index,
    eliminated: [],
    answers: 0,
    endedAt: null,
    placements: null,
  };
  s.phase = "round";
  s.roundEndAt = null;
  s.event = null;
}

export function startGame(s: GameState, env: EngineEnv, now: number): Text | null {
  if (s.phase !== "lobby") return tx("O jogo já começou.", "The game has already started.");
  if (!env.categories.length) return tx("A base de dados ainda está a carregar.", "The database is still loading.");
  const connected = s.players.filter((p) => p.connected);
  if (s.kind === "multi" && connected.length < MIN_PLAYERS) return tx("São precisos pelo menos 2 jogadores.", "You need at least 2 players.");
  // Players who left while in the lobby don't take a seat.
  s.players = s.players.filter((p) => p.connected);
  for (const p of s.players) {
    Object.assign(p, { points: 0, roundsWon: 0, names: 0, trumpsUsed: 0, form: [], prevRank: 1, trump: false });
  }
  s.gameNo++;
  s.usedPrompts = [];
  s.history = [];
  s.log = [];
  s.stats = null;
  s.championId = null;
  s.round = null;
  s.solo = s.kind === "solo" ? { lives: s.settings.lives, score: 0 } : null;
  beginRound(s, env, now, { starter: effectiveHost(s) ?? undefined });
  s.lastActivity = now;
  return null;
}

/** Clock left for a player right now. */
export function clockLeft(s: GameState, p: Player, now: number): number {
  const t = s.round?.turn;
  if (!t || t.playerId !== p.id) return p.bankMs;
  const at = t.pausedAt ?? now;
  return p.bankMs - Math.max(0, at - t.startedAt);
}

function current(s: GameState): Player | undefined {
  return player(s, s.round?.turn?.playerId);
}

function nextAlive(s: GameState, fromId: string): string | null {
  const r = s.round!;
  const i = r.order.indexOf(fromId);
  for (let k = 1; k <= r.order.length; k++) {
    const id = r.order[(i + k) % r.order.length];
    if (player(s, id)?.alive) return id;
  }
  return null;
}

function passTurn(s: GameState, fromId: string, now: number) {
  const r = s.round!;
  const next = nextAlive(s, fromId);
  if (!next) return;
  r.turn = { playerId: next, startedAt: Math.max(now, r.startAt), pausedAt: null, checking: null, choice: null, seq: s.seq++ };
}

function aliveCount(s: GameState) {
  return s.players.filter((p) => p.inRound && p.alive).length;
}

function logItem(s: GameState, p: Player, kind: LogItem["kind"], now: number, extra: Partial<LogItem> = {}) {
  const r = s.round!;
  const t = r.turn!;
  s.log.push({
    round: r.n,
    playerId: p.id,
    kind,
    ms: Math.max(0, (t.pausedAt ?? now) - t.startedAt),
    left: clockLeft(s, p, now),
    sudden: r.sudden || undefined,
    ...extra,
  });
}

function eliminate(s: GameState, p: Player, reason: "time" | "pass", now: number) {
  const r = s.round!;
  p.alive = false;
  p.bankMs = 0;
  r.eliminated.push(p.id);
  emit(s, { at: now, kind: "out", playerId: p.id, reason });
  if (s.kind === "solo") return loseLife(s, p, reason, now);
  if (aliveCount(s) <= 1) return endRound(s, now);
  passTurn(s, p.id, now);
}

function loseLife(s: GameState, p: Player, reason: "time" | "pass" | "miss", now: number) {
  const r = s.round!;
  s.solo!.lives--;
  p.alive = false;
  if (!r.eliminated.includes(p.id)) r.eliminated.push(p.id);
  emit(s, { at: now, kind: "life", playerId: p.id, reason });
  r.endedAt = now;
  r.turn = null;
  r.placements = [p.id];
  s.history.push({ n: r.n, sudden: false, title: r.view.title, family: r.view.family, answers: r.answers, winnerId: null });
  s.phase = "roundEnd";
  s.roundEndAt = now + SOLO_ROUND_END_MS;
}

function endRound(s: GameState, now: number) {
  const r = s.round!;
  const survivors = r.order.filter((id) => player(s, id)?.alive);
  // Last one standing first, then the latest to fall.
  const placements = [...survivors, ...[...r.eliminated].reverse()].filter((id, i, a) => a.indexOf(id) === i && player(s, id));
  r.placements = placements;
  r.endedAt = now;
  r.turn = null;
  const winnerId = placements[0] ?? null;
  for (const p of s.players) p.prevRank = rankOf(s.players, p.id);
  if (!r.sudden) {
    const n = placements.length;
    placements.forEach((id, i) => {
      const p = player(s, id)!;
      p.points += n - 1 - i;
      if (i === 0) p.roundsWon++;
    });
    for (const p of s.players) p.form.push(placements.includes(p.id) ? placements.indexOf(p.id) + 1 : 0);
  }
  // Trumps are only good for one round; last place earns one for the next.
  for (const p of s.players) p.trump = false;
  const last = placements[placements.length - 1];
  if (!r.sudden && placements.length >= 2 && last) player(s, last)!.trump = true;
  s.history.push({ n: r.n, sudden: r.sudden, title: r.view.title, family: r.view.family, answers: r.answers, winnerId });
  if (r.sudden) s.championId = winnerId;
  s.phase = "roundEnd";
  s.roundEndAt = now + ROUND_END_MS;
}

/** After the round-end screen: next round, sudden death or the end. */
function afterRound(s: GameState, env: EngineEnv, now: number) {
  const r = s.round!;
  if (s.kind === "solo") {
    if (s.solo!.lives <= 0) return endGame(s, now);
    return beginRound(s, env, now);
  }
  const starter = r.placements?.[r.placements.length - 1];
  if (r.sudden) return endGame(s, now);
  const played = s.history.filter((h) => !h.sudden).length;
  if (played < s.settings.rounds) return beginRound(s, env, now, { starter });
  const table = ranked(s);
  const top = table[0];
  const tied = table.filter((p) => p.points === top.points && p.roundsWon === top.roundsWon && p.names === top.names);
  if (tied.length > 1) {
    return beginRound(s, env, now, {
      sudden: true,
      participants: tied.map((p) => p.id),
      starter: [...(r.placements ?? [])].reverse().find((id) => tied.some((t) => t.id === id)),
    });
  }
  s.championId = top?.id ?? null;
  endGame(s, now);
}

function endGame(s: GameState, now: number) {
  s.phase = "gameEnd";
  s.roundEndAt = null;
  if (!s.championId && s.kind === "multi") s.championId = ranked(s)[0]?.id ?? null;
  s.stats = computeStats(s);
  s.lastActivity = now;
}

// --- Answers (the room resolves the name, then calls one of these) ---------------------------

/** Why this player can't answer right now (null = they can). */
export function answerBlock(s: GameState, playerId: string, now: number): Text | null {
  const r = s.round;
  if (s.phase !== "round" || !r?.turn) return tx("A ronda não está a decorrer.", "The round isn't on.");
  if (r.turn.playerId !== playerId) return tx("Não é a tua vez.", "It's not your turn.");
  if (now < r.startAt) return tx("Ainda não começou!", "It hasn't started yet!");
  if (r.turn.checking) return tx("A verificar o nome anterior…", "Checking the previous name…");
  return null;
}

export function usedSet(s: GameState): Set<number> {
  return new Set(s.round?.used ?? []);
}

export function usedKeySet(s: GameState): Set<string> {
  return new Set(s.round?.usedKeys ?? []);
}

export interface Accepted {
  /** null when several players share the name and all of them fit. */
  qid: number | null;
  name: string;
  image?: string;
  /** Folded names to block for the rest of the round. */
  keys?: string[];
}

export function acceptAnswer(s: GameState, playerId: string, text: string, a: Accepted, now: number, viaTrump = false) {
  const r = s.round!;
  const p = player(s, playerId)!;
  const bonus = r.sudden ? 0 : BONUS_MS;
  logItem(s, p, viaTrump ? "trump" : "ok", now, { qid: a.qid ?? undefined, name: a.name, image: a.image });
  p.bankMs = clockLeft(s, p, now) + bonus;
  if (a.qid !== null) r.used.push(a.qid);
  if (!r.usedKeys) r.usedKeys = [];
  for (const k of [fold(text), ...(a.keys ?? [])]) if (k && !r.usedKeys.includes(k)) r.usedKeys.push(k);
  r.answers++;
  if (viaTrump) p.trumpsUsed++;
  else p.names++;
  if (s.solo) s.solo.score++;
  emit(s, { at: now, kind: viaTrump ? "trump" : "ok", playerId, text, name: a.name, image: a.image, delta: bonus / 1000 });
  if (s.kind === "solo") {
    // Alone: the clock keeps going for the next name.
    r.turn = { playerId, startedAt: now, pausedAt: null, checking: null, choice: null, seq: s.seq++ };
    return;
  }
  passTurn(s, playerId, now);
  s.lastActivity = now;
}

export function rejectAnswer(s: GameState, playerId: string, text: string, message: Text, now: number, ambiguous = false) {
  const p = player(s, playerId)!;
  if (s.round?.turn) s.round.turn.choice = null;
  logItem(s, p, ambiguous ? "ambiguous" : "miss", now, { name: text });
  emit(s, { at: now, kind: ambiguous ? "ambiguous" : "miss", playerId, text, message });
  // Alone, a wrong name costs the round (an ambiguous one doesn't).
  if (s.kind === "solo" && !ambiguous) {
    p.bankMs = clockLeft(s, p, now);
    loseLife(s, p, "miss", now);
    s.event = { ...s.event!, kind: "life", reason: "miss", text, message };
  }
  s.lastActivity = now;
}

/** A vague name: the player picks which one they meant ("Querias dizer…?"). The clock keeps going. */
export function offerChoice(s: GameState, playerId: string, text: string, options: ChoiceOption[], now: number) {
  const t = s.round!.turn!;
  t.choice = { text, options };
  emit(s, { at: now, kind: "choose", playerId, text });
  s.lastActivity = now;
}

/** Forgets a pending choice (the player typed something else instead). */
export function clearChoice(s: GameState) {
  if (s.round?.turn) s.round.turn.choice = null;
}

/** The player picked an option: right if it's the one that fits the round. */
export function chooseOption(s: GameState, playerId: string, qid: number, now: number): Text | null {
  const block = answerBlock(s, playerId, now);
  if (block) return block;
  const t = s.round!.turn!;
  const option = t.choice?.options.find((o) => o.qid === qid);
  if (!t.choice || !option) return tx("Essa opção já não está disponível.", "That option is no longer available.");
  const text = t.choice.text;
  t.choice = null;
  if (option.valid) acceptAnswer(s, playerId, text, { qid: option.qid, name: option.name, image: option.image, keys: [fold(option.name)] }, now);
  else rejectAnswer(s, playerId, text, option.message ?? tx(`${option.name} não serve para esta ronda`, `${option.name} doesn't fit this round`), now);
  return null;
}

/** Freezes the clock while an unknown name is checked on Wikidata. Returns the turn's id. */
export function pauseForCheck(s: GameState, text: string, now: number): number {
  const t = s.round!.turn!;
  t.pausedAt = now;
  t.checking = text;
  return t.seq;
}

/** Restarts the clock after a check (no-op if the turn has moved on). */
export function resumeAfterCheck(s: GameState, seq: number, now: number): boolean {
  const t = s.round?.turn;
  if (!t || t.seq !== seq || t.pausedAt === null) return false;
  t.startedAt += now - t.pausedAt;
  t.pausedAt = null;
  t.checking = null;
  return true;
}

// --- Actions ---------------------------------------------------------------

export function apply(s: GameState, playerId: string, action: ClientAction, env: EngineEnv, now: number): Text | null {
  const me = player(s, playerId);
  if (!me) return tx("Não estás nesta sala.", "You're not in this room.");
  s.lastActivity = now;
  const isHost = effectiveHost(s) === playerId;
  switch (action.type) {
    case "settings": {
      if (!isHost) return tx("Só o anfitrião pode mudar as definições.", "Only the host can change the settings.");
      if (s.phase !== "lobby") return tx("O jogo já começou.", "The game has already started.");
      const st = s.settings;
      if (action.seconds && (SECONDS_OPTIONS as readonly number[]).includes(action.seconds)) st.seconds = action.seconds;
      if (action.rounds && (ROUNDS_OPTIONS as readonly number[]).includes(action.rounds)) st.rounds = action.rounds;
      if (action.lives && (LIVES_OPTIONS as readonly number[]).includes(action.lives)) st.lives = action.lives;
      if (action.mode && ["letters", "categories", "mixed"].includes(action.mode)) st.mode = action.mode;
      return null;
    }
    case "start":
      if (!isHost) return tx("Só o anfitrião pode começar.", "Only the host can start.");
      return startGame(s, env, now);
    case "pass": {
      const block = answerBlock(s, playerId, now);
      if (block) return block;
      logItem(s, me, "pass", now);
      if (s.kind === "solo") {
        me.bankMs = clockLeft(s, me, now);
        emit(s, { at: now, kind: "pass", playerId, delta: 0 });
        loseLife(s, me, "pass", now);
        return null;
      }
      const left = clockLeft(s, me, now) - PASS_PENALTY_MS;
      emit(s, { at: now, kind: "pass", playerId, delta: -PASS_PENALTY_MS / 1000 });
      if (left <= 0) eliminate(s, me, "pass", now);
      else {
        me.bankMs = left;
        passTurn(s, playerId, now);
      }
      return null;
    }
    case "trump":
      // Resolved by the room (it needs the database); see useTrump.
      return tx("Ação inválida.", "Invalid action.");
    case "next":
      if (!isHost) return tx("Só o anfitrião pode avançar.", "Only the host can move on.");
      if (s.phase !== "roundEnd") return null;
      afterRound(s, env, now);
      return null;
    case "kick": {
      if (!isHost) return tx("Só o anfitrião pode expulsar jogadores.", "Only the host can kick players.");
      if (action.playerId === playerId) return tx("Não te podes expulsar.", "You can't kick yourself.");
      const target = player(s, action.playerId);
      if (!target) return null;
      const r = s.round;
      const wasTurn = r?.turn?.playerId === target.id;
      const next = r && wasTurn ? nextAlive(s, target.id) : null;
      s.players = s.players.filter((p) => p.id !== target.id);
      if (r) {
        r.order = r.order.filter((id) => id !== target.id);
        r.eliminated = r.eliminated.filter((id) => id !== target.id);
        if (s.phase === "round") {
          if (aliveCount(s) <= 1 && s.kind === "multi") endRound(s, now);
          else if (wasTurn && next && next !== target.id) r.turn = { playerId: next, startedAt: Math.max(now, r.startAt), pausedAt: null, checking: null, choice: null, seq: s.seq++ };
        }
      }
      if (s.hostId === target.id) s.hostId = s.players[0]?.id ?? null;
      return null;
    }
    case "rematch":
      if (s.phase !== "gameEnd") return null;
      s.phase = "lobby";
      s.round = null;
      s.event = null;
      return null;
  }
}

/** Uses the current player's trump with a name picked by the room. */
export function useTrump(s: GameState, playerId: string, a: Accepted | null, now: number): Text | null {
  const block = answerBlock(s, playerId, now);
  if (block) return block;
  const p = player(s, playerId)!;
  if (!p.trump) return tx("Não tens nenhum trunfo.", "You don't have a trump card.");
  if (!a) return tx("O trunfo não encontrou nenhum nome.", "The trump card couldn't find a name.");
  p.trump = false;
  acceptAnswer(s, playerId, a.name, a, now, true);
  return null;
}

// --- Time ------------------------------------------------------------------

/** Handles expired timers. Returns true if the state changed. */
export function tick(s: GameState, env: EngineEnv, now: number): boolean {
  if (s.phase === "round" && s.round?.turn) {
    const t = s.round.turn;
    if (t.pausedAt !== null) {
      if (now - t.pausedAt < MAX_PAUSE_MS) return false;
      resumeAfterCheck(s, t.seq, now);
      return true;
    }
    const p = current(s);
    if (!p) {
      // The player left the room.
      passTurn(s, t.playerId, now);
      return true;
    }
    if (now >= t.startedAt + p.bankMs) {
      logItem(s, p, "out", now);
      eliminate(s, p, "time", now);
      return true;
    }
    return false;
  }
  if (s.phase === "roundEnd" && s.roundEndAt !== null && now >= s.roundEndAt) {
    afterRound(s, env, now);
    return true;
  }
  return false;
}

export function nextDeadline(s: GameState): number | null {
  if (s.phase === "round" && s.round?.turn) {
    const t = s.round.turn;
    if (t.pausedAt !== null) return t.pausedAt + MAX_PAUSE_MS;
    const p = current(s);
    return p ? t.startedAt + p.bankMs : Date.now();
  }
  if (s.phase === "roundEnd") return s.roundEndAt;
  return null;
}

// --- Views -----------------------------------------------------------------

export interface PlayerView {
  id: string;
  name: string;
  color: string;
  connected: boolean;
  points: number;
  roundsWon: number;
  names: number;
  trumpsUsed: number;
  form: number[];
  prevRank: number;
  bankMs: number;
  inRound: boolean;
  alive: boolean;
  trump: boolean;
}

/** What the player choosing sees of an option (not whether it's right). */
export interface ChoiceView {
  qid: number;
  name: string;
  hint?: Text;
  image?: string;
}

export interface TurnView {
  playerId: string;
  startedAt: number;
  pausedAt: number | null;
  checking: string | null;
  /** Only in the view of the player who has to choose. */
  choice: { text: string; options: ChoiceView[] } | null;
  seq: number;
}

export interface RoundView {
  n: number;
  sudden: boolean;
  prompt: PromptView;
  introAt: number;
  startAt: number;
  wheel: Text[];
  wheelIndex: number;
  order: string[];
  turn: TurnView | null;
  eliminated: string[];
  answers: number;
  endedAt: number | null;
  placements: string[] | null;
}

export interface GameView {
  code: string;
  kind: Kind;
  me: string;
  hostId: string | null;
  phase: Phase;
  settings: Settings;
  players: PlayerView[];
  round: RoundView | null;
  roundEndAt: number | null;
  history: RoundSummary[];
  event: GameEvent | null;
  solo: Solo | null;
  championId: string | null;
  stats: GameStats | null;
  gameNo: number;
  serverNow: number;
}

export function viewFor(s: GameState, me: string, now: number): GameView {
  const r = s.round;
  return {
    code: s.code,
    kind: s.kind,
    me,
    hostId: effectiveHost(s),
    phase: s.phase,
    settings: s.settings,
    players: s.players.map(({ token: _t, ...p }) => p),
    round: r
      ? {
          n: r.n,
          sudden: r.sudden,
          prompt: r.view,
          introAt: r.introAt,
          startAt: r.startAt,
          wheel: r.wheel ?? [],
          wheelIndex: r.wheelIndex ?? 0,
          order: r.order,
          turn: r.turn
            ? {
                playerId: r.turn.playerId,
                startedAt: r.turn.startedAt,
                pausedAt: r.turn.pausedAt,
                checking: r.turn.checking,
                choice:
                  r.turn.choice && r.turn.playerId === me
                    ? { text: r.turn.choice.text, options: r.turn.choice.options.map(({ qid, name, hint, image }) => ({ qid, name, hint, image })) }
                    : null,
                seq: r.turn.seq,
              }
            : null,
          eliminated: r.eliminated,
          answers: r.answers,
          endedAt: r.endedAt,
          placements: r.placements,
        }
      : null,
    roundEndAt: s.roundEndAt,
    history: s.history,
    event: s.event,
    solo: s.solo,
    championId: s.championId,
    stats: s.stats,
    gameNo: s.gameNo,
    serverNow: now,
  };
}
