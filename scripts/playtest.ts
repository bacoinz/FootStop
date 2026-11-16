// Plays a whole game against a running server with bots, to check the real server end to end:
//   node scripts/playtest.ts [http://localhost:5174] [players=3]
// Bots answer with real players from the database, and also try a wrong name, an ambiguous one,
// an unknown one (Wikidata live check), a pass and the trump card.

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { PlayerDb } from "../shared/db.ts";
import { pickTrumpAnswer } from "../shared/match.ts";
import type { GameView } from "../shared/engine.ts";
import type { ServerMessage } from "../shared/protocol.ts";

const base = process.argv[2] ?? "http://localhost:5174";
const players = Number(process.argv[3] ?? 3);
// Pass a room code to join a room hosted in the browser (the bots then just play along).
const joinCode = process.argv[4]?.toUpperCase();
const code = joinCode ?? Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)]).join("");
const db = new PlayerDb(JSON.parse(gunzipSync(readFileSync(new URL("../public/data/players.bin", import.meta.url))).toString()));
const wsUrl = `${base.replace(/^http/, "ws")}/api/rooms/${code}/ws`;
console.log(`room ${code}, ${players} bots`);

interface Bot {
  name: string;
  ws: WebSocket;
  view: GameView | null;
  said: Set<number>;
  lastSeq: number;
  tricks: string[];
  offset: number;
}

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(14, 23), ...a);
const bots: Bot[] = [];
let done = false;
let lastEvent = 0;
const seen = new Set<string>();

function act(bot: Bot) {
  const v = bot.view;
  if (!v || v.phase !== "round" || !v.round?.turn) return;
  const t = v.round.turn;
  const now = Date.now() + bot.offset;
  if (t.playerId !== v.me || t.seq === bot.lastSeq || t.checking || now < v.round.startAt + 50) return;
  bot.lastSeq = t.seq;
  const me = v.players.find((p) => p.id === v.me)!;
  const delay = 250 + Math.random() * 400;
  setTimeout(() => {
    // One trick per bot per round, then real answers.
    const trick = bot.tricks.shift();
    if (trick === "trump" && me.trump) return bot.ws.send(JSON.stringify({ type: "trump" }));
    if (trick === "pass") return bot.ws.send(JSON.stringify({ type: "action", action: { type: "pass" } }));
    if (trick === "wrong") return bot.ws.send(JSON.stringify({ type: "answer", text: "Messi Ronaldo Zidane" }));
    if (trick === "ambiguous") return bot.ws.send(JSON.stringify({ type: "answer", text: "Silva" }));
    if (trick === "unknown") return bot.ws.send(JSON.stringify({ type: "answer", text: "Zé Qualquer Inventado" }));
    const cat = db.file.categories.find((c) => c.id === v.round!.prompt.id);
    if (!cat) return log("?? prompt", v.round!.prompt.id);
    const used = new Set([...bot.said]);
    const idx = pickTrumpAnswer(db, cat.prompt, used);
    if (idx === null) return log("no answer for", cat.title);
    bot.said.add(db.qid(idx));
    // Bots sometimes give up so rounds end.
    if (Math.random() < 0.18) return;
    bot.ws.send(JSON.stringify({ type: "typing", text: db.name(idx) }));
    bot.ws.send(JSON.stringify({ type: "answer", text: db.name(idx) }));
  }, delay);
}

function onState(bot: Bot, v: GameView) {
  const prev = bot.view;
  bot.view = v;
  bot.offset = v.serverNow - Date.now();
  // Vague name: pick one of the options at random (right or wrong).
  const choice = v.round?.turn?.choice;
  if (choice && v.round?.turn?.playerId === v.me && v.event?.id !== prev?.event?.id) {
    const o = choice.options[Math.floor(Math.random() * choice.options.length)];
    setTimeout(() => bot.ws.send(JSON.stringify({ type: "choose", qid: o.qid })), 300);
  }
  // After a rejected answer the turn goes on: try again.
  if (v.event && v.event.id !== prev?.event?.id && v.event.playerId === v.me && (v.event.kind === "miss" || v.event.kind === "ambiguous")) bot.lastSeq = -1;
  if (bot === bots[0]) {
    if (v.event && v.event.id !== lastEvent) {
      lastEvent = v.event.id;
      const who = v.players.find((p) => p.id === v.event!.playerId)?.name;
      log(`  ${v.event.kind.padEnd(9)} ${who}: ${v.event.name ?? v.event.text ?? ""} ${v.event.message ? `→ ${v.event.message}` : ""} ${v.event.delta ? `(${v.event.delta} s)` : ""}`);
      seen.add(v.event.kind);
    }
    if (v.phase !== prev?.phase || v.round?.n !== prev?.round?.n) {
      if (v.phase === "round") log(`ROUND ${v.round!.n}${v.round!.sudden ? " (sudden death)" : ""}: ${v.round!.prompt.title} — order ${v.round!.order.map((id) => v.players.find((p) => p.id === id)?.name).join(" → ")}`);
      if (v.phase === "roundEnd")
        log(
          `  end: ${v.round!.placements?.map((id) => v.players.find((p) => p.id === id)?.name).join(", ")} | table ${v.players.map((p) => `${p.name}=${p.points}`).join(" ")} | trump: ${v.players.filter((p) => p.trump).map((p) => p.name).join(",") || "-"}`,
        );
      if (v.phase === "gameEnd") {
        log(`GAME OVER — champion ${v.players.find((p) => p.id === v.championId)?.name}`);
        for (const c of v.stats?.cards ?? []) log(`  · ${c.title}: ${c.text}`);
        done = true;
        setTimeout(() => {
          const expected = ["ok", "miss", "choose", "pass", "out", "trump"];
          const missing = expected.filter((k) => !seen.has(k));
          log(missing.length ? `MISSING events: ${missing.join(", ")}` : "all event kinds seen");
          for (const b of bots) b.ws.close();
          process.exit(missing.length ? 1 : 0);
        }, 300);
      }
      if (v.phase === "roundEnd") {
        for (const b of bots) {
          b.said.clear();
          b.tricks = b === bots[0] ? ["trump", "wrong", "ambiguous"] : b === bots[1] ? ["trump", "unknown", "pass"] : ["trump"];
        }
      }
    }
  }
  act(bot);
}

for (let i = 0; i < players; i++) {
  const ws = new WebSocket(wsUrl);
  const bot: Bot = { name: `Bot${i + 1}`, ws, view: null, said: new Set(), lastSeq: -1, offset: 0, tricks: i === 0 ? ["wrong", "ambiguous"] : i === 1 ? ["unknown", "pass"] : [] };
  bots.push(bot);
  ws.onopen = () => ws.send(JSON.stringify({ type: "hello", playerId: `bot${i}-${code}`, token: `t${i}`, name: bot.name }));
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data)) as ServerMessage;
    if (m.type === "state") onState(bot, m.view);
    else if (m.type === "error") log(`  error to ${bot.name}: ${m.message}`);
  };
}
// Keep bots acting when nothing arrives (their own turn starting after the intro).
setInterval(() => bots.forEach(act), 100);

const start = setInterval(() => {
  if (joinCode) return clearInterval(start);
  const host = bots.find((b) => b.view && b.view.hostId === b.view.me);
  if (!host?.view || host.view.players.length < players) return;
  clearInterval(start);
  host.ws.send(JSON.stringify({ type: "action", action: { type: "settings", seconds: 10, rounds: 5 } }));
  host.ws.send(JSON.stringify({ type: "action", action: { type: "start" } }));
  // Skip the table between rounds.
  setInterval(() => {
    if (host.view?.phase === "roundEnd") host.ws.send(JSON.stringify({ type: "action", action: { type: "next" } }));
  }, 1500);
}, 200);

setTimeout(() => {
  if (!done) {
    log("TIMEOUT");
    process.exit(2);
  }
}, 8 * 60_000);
