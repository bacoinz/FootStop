// One Durable Object per room. Holds the authoritative state, checks names and fans out views.

import { DurableObject } from "cloudflare:workers";
import {
  acceptAnswer,
  answerBlock,
  apply,
  chooseOption,
  clearChoice,
  createGame,
  offerChoice,
  disconnect,
  join,
  nextDeadline,
  pauseForCheck,
  rejectAnswer,
  resumeAfterCheck,
  tick,
  usedKeySet,
  usedSet,
  useTrump,
  viewFor,
  type ChoiceOption,
  type ClientAction,
  type EngineEnv,
  type GameState,
} from "../shared/engine.ts";
import type { ClientMessage, ServerMessage } from "../shared/protocol.ts";
import type { PlayerDb } from "../shared/db.ts";
import { judgeLive, liveMatches, pickTrumpAnswer, resolveAnswer, type Choice, type RoundContext } from "../shared/match.ts";
import { COUNTRIES, explainMiss } from "../shared/categories.ts";
import { fold } from "../shared/text.ts";
import { tx, type Text } from "../shared/i18n.ts";
import { loadDb } from "./playerdb.ts";
import { getFacts, searchFootballers } from "./wikidata.ts";
import { toPlayerFacts } from "./facts.ts";

const IDLE_TTL_MS = 6 * 60 * 60 * 1000;
/** Longest wait for Wikidata before giving up on an unknown name. */
const LIVE_TIMEOUT_MS = 2200;

interface Attachment {
  playerId?: string;
  code: string;
}

function titleCase(text: string) {
  return text.trim().replace(/\s+/g, " ").replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | "timeout"> {
  return Promise.race([p, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), ms))]);
}

export class GameRoom extends DurableObject<Env> {
  private state: GameState | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get<GameState>("state")) ?? null;
    });
  }

  private db(): Promise<PlayerDb> {
    return loadDb(this.env.ASSETS);
  }

  private async engineEnv(): Promise<EngineEnv> {
    const db = await this.db();
    return { categories: db.file.categories };
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const code = new URL(request.url).searchParams.get("code") ?? "????";
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ code } satisfies Attachment);
    // Warm the player database while people gather in the lobby.
    this.ctx.waitUntil(this.db().then(() => undefined, () => undefined));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string") return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const now = Date.now();
    const att = (ws.deserializeAttachment() ?? { code: "????" }) as Attachment;

    if (msg.type === "ping") {
      this.send(ws, { type: "pong", serverNow: now });
      return;
    }

    if (msg.type === "hello") {
      if (!this.state) this.state = createGame(att.code, msg.solo ? "solo" : "multi", now);
      const s = this.state;
      const err = join(s, { id: String(msg.playerId), token: String(msg.token), name: String(msg.name ?? "") }, now);
      if (err) {
        this.send(ws, { type: "error", message: err, fatal: true });
        ws.close(4000, err.en);
        return;
      }
      // Close older sockets for the same player (e.g. a second tab).
      for (const other of this.ctx.getWebSockets()) {
        const o = other.deserializeAttachment() as Attachment | null;
        if (other !== ws && o?.playerId === msg.playerId) {
          other.serializeAttachment({ code: att.code });
          try {
            other.close(4001, "Opened in another tab");
          } catch {}
        }
      }
      ws.serializeAttachment({ code: att.code, playerId: String(msg.playerId) } satisfies Attachment);
      await this.commit();
      return;
    }

    const s = this.state;
    if (!s) return;
    const pid = att.playerId;
    if (!pid) {
      this.send(ws, { type: "error", message: tx("Ainda não entraste na sala.", "You haven't joined the room yet.") });
      return;
    }

    if (msg.type === "typing") {
      const t = s.round?.turn;
      if (s.phase !== "round" || t?.playerId !== pid) return;
      const text = String(msg.text ?? "").slice(0, 60);
      for (const other of this.ctx.getWebSockets()) {
        const o = other.deserializeAttachment() as Attachment | null;
        if (other !== ws && o?.playerId) this.send(other, { type: "typing", playerId: pid, text });
      }
      return;
    }

    if (msg.type === "answer") return this.answer(ws, pid, String(msg.text ?? "").slice(0, 60));
    if (msg.type === "choose") return this.choose(ws, pid, Number(msg.qid));
    if (msg.type === "trump") return this.trump(ws, pid);

    if (msg.type === "action") {
      const action = msg.action as ClientAction;
      const env = await this.engineEnv().catch(() => ({ categories: [] }));
      const t = Date.now();
      tick(s, env, t);
      const err = apply(s, pid, action, env, t);
      if (err) this.send(ws, { type: "error", message: err });
      if (action.type === "kick" && !err) this.closePlayer(action.playerId, tx("Foste expulso da sala.", "You were kicked from the room."));
      await this.commit();
    }
  }

  private context(s: GameState, db: PlayerDb): RoundContext {
    return { prompt: s.round!.category.prompt, clubs: db.file.clubs, used: usedSet(s), usedKeys: usedKeySet(s) };
  }

  /** "Querias dizer…?" options, with a hint to tell namesakes apart that doesn't give the answer away. */
  private options(db: PlayerDb, s: GameState, choices: Choice[]): ChoiceOption[] {
    const prompt = s.round!.category.prompt;
    return choices.map(({ idx, valid }) => {
      const f = db.facts(idx);
      const c = f.nats[0] !== undefined ? COUNTRIES[f.nats[0]] : undefined;
      const nat: Text | undefined = c ? tx(c.name, c.en[0]) : undefined;
      const hint = prompt.kind === "decade" ? nat : f.by ? tx(`n. ${f.by}`, `b. ${f.by}`) : nat;
      return {
        qid: db.qid(idx),
        name: db.name(idx),
        hint,
        image: db.image(idx),
        valid,
        message: valid ? undefined : explainMiss(f, prompt, db.file.clubs, db.name(idx)),
      };
    });
  }

  private async choose(ws: WebSocket, pid: string, qid: number) {
    const s = this.state!;
    const db = await this.db().catch(() => null);
    if (!db) return;
    const now = Date.now();
    if (tick(s, { categories: db.file.categories }, now)) {
      await this.commit();
      return;
    }
    const err = chooseOption(s, pid, qid, now);
    if (err) this.send(ws, { type: "error", message: err });
    await this.commit();
  }

  private async answer(ws: WebSocket, pid: string, text: string) {
    const s = this.state!;
    const db = await this.db().catch(() => null);
    if (!db) {
      this.send(ws, { type: "error", message: tx("A base de dados não carregou. Tenta outra vez.", "The database didn't load. Try again.") });
      return;
    }
    const env = { categories: db.file.categories };
    let now = Date.now();
    if (tick(s, env, now)) await this.commit();
    const block = answerBlock(s, pid, now);
    if (block) {
      this.send(ws, { type: "error", message: block });
      return;
    }
    clearChoice(s);
    const ctx = this.context(s, db);
    const res = resolveAnswer(db, text, ctx);
    if (res.status === "ok") {
      if (res.idx === null) acceptAnswer(s, pid, text, { qid: null, name: titleCase(text) }, now);
      else acceptAnswer(s, pid, text, { qid: db.qid(res.idx), name: db.nameFor(res.idx, fold(text), res.fuzzy), image: db.image(res.idx), keys: [fold(db.name(res.idx))] }, now);
    } else if (res.status === "invalid") {
      if (res.reason === "short") return;
      // A first name alone just needs the surname: no penalty (not even alone).
      rejectAnswer(s, pid, text, res.message, now, res.reason === "vague");
    } else if (res.status === "choose") {
      offerChoice(s, pid, text, this.options(db, s, res.options), now);
    } else {
      // Not in the database: ask Wikidata, with this player's clock frozen meanwhile.
      const seq = pauseForCheck(s, text, now);
      await this.commit();
      const verdict = await withTimeout(this.liveCheck(db, text, ctx), LIVE_TIMEOUT_MS).catch(() => "timeout" as const);
      now = Date.now();
      if (!resumeAfterCheck(s, seq, now)) return;
      if (verdict === "timeout") rejectAnswer(s, pid, text, tx(`Não consegui confirmar ${text} a tempo: tenta outro`, `Couldn't check ${text} in time: try another`), now, true);
      else if (verdict.status === "ok") acceptAnswer(s, pid, text, { ...verdict.accepted, keys: [fold(verdict.accepted.name)] }, now);
      else if (verdict.status === "ambiguous") rejectAnswer(s, pid, text, verdict.message, now, true);
      else rejectAnswer(s, pid, text, verdict.message, now);
    }
    await this.commit();
  }

  private async liveCheck(db: PlayerDb, text: string, ctx: RoundContext) {
    const hits = await searchFootballers(text, false);
    const matches = liveMatches(hits, text).slice(0, 3);
    const withFacts = await Promise.all(
      matches.map(async (hit) => {
        const idx = db.indexOfQid(Number(hit.qid.slice(1)));
        if (idx !== undefined) return { hit: { qid: hit.qid, label: db.name(idx) }, facts: db.facts(idx), image: db.image(idx) };
        if (ctx.prompt.kind === "letter") return { hit, facts: null, image: undefined };
        const f = await getFacts(hit.qid).catch(() => null);
        return { hit, facts: f ? toPlayerFacts(f, db) : null, image: f?.image };
      }),
    );
    const v = judgeLive(text, withFacts, ctx);
    if (v.status !== "ok") return v;
    const m = withFacts.find((x) => x.hit.qid === v.hit.qid);
    return { status: "ok" as const, accepted: { qid: Number(v.hit.qid.slice(1)), name: v.hit.label, image: m?.image } };
  }

  private async trump(ws: WebSocket, pid: string) {
    const s = this.state!;
    const db = await this.db().catch(() => null);
    if (!db) return;
    const now = Date.now();
    tick(s, { categories: db.file.categories }, now);
    const block = answerBlock(s, pid, now);
    let err = block;
    if (!block) {
      const idx = pickTrumpAnswer(db, s.round!.category.prompt, usedSet(s), Math.random, usedKeySet(s));
      err = useTrump(s, pid, idx === null ? null : { qid: db.qid(idx), name: db.name(idx), image: db.image(idx), keys: [fold(db.name(idx))] }, now);
    }
    if (err) this.send(ws, { type: "error", message: err });
    await this.commit();
  }

  private closePlayer(playerId: string, reason: Text) {
    for (const ws of this.ctx.getWebSockets()) {
      const o = ws.deserializeAttachment() as Attachment | null;
      if (o?.playerId !== playerId) continue;
      this.send(ws, { type: "error", message: reason, fatal: true });
      ws.serializeAttachment({ code: o.code });
      try {
        ws.close(4000, reason.en);
      } catch {}
    }
  }

  async webSocketClose(ws: WebSocket) {
    await this.dropSocket(ws);
  }

  async webSocketError(ws: WebSocket) {
    await this.dropSocket(ws);
  }

  private async dropSocket(ws: WebSocket) {
    const att = ws.deserializeAttachment() as Attachment | null;
    const s = this.state;
    if (!s || !att?.playerId) return;
    const stillOpen = this.ctx
      .getWebSockets()
      .some((o) => o !== ws && (o.deserializeAttachment() as Attachment | null)?.playerId === att.playerId);
    if (stillOpen) return;
    disconnect(s, att.playerId);
    await this.commit();
  }

  async alarm() {
    const s = this.state;
    if (!s) return;
    const now = Date.now();
    if (now - s.lastActivity > IDLE_TTL_MS && !this.ctx.getWebSockets().length) {
      await this.ctx.storage.deleteAll();
      this.state = null;
      return;
    }
    const env = await this.engineEnv().catch(() => null);
    if (!env) {
      await this.ctx.storage.setAlarm(now + 1000);
      return;
    }
    // Several timers may have expired while hibernating.
    let changed = false;
    for (let i = 0; i < 8 && tick(s, env, Date.now()); i++) changed = true;
    if (changed) await this.commit();
    else await this.schedule();
  }

  private async commit() {
    const s = this.state;
    if (!s) return;
    this.broadcast();
    await this.ctx.storage.put("state", s);
    await this.schedule();
  }

  private async schedule() {
    const s = this.state;
    if (!s) return;
    const deadline = nextDeadline(s);
    await this.ctx.storage.setAlarm(deadline ?? Date.now() + IDLE_TTL_MS);
  }

  private broadcast() {
    const s = this.state;
    if (!s) return;
    const now = Date.now();
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att?.playerId) continue;
      this.send(ws, { type: "state", view: viewFor(s, att.playerId, now) });
    }
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {}
  }
}
