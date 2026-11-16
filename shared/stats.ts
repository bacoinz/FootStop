// End-of-game statistics and fun facts, computed from the answer log.

import type { GameState, LogItem } from "./engine.ts";
import { both, tx, type Lang, type Text } from "./i18n.ts";

export interface StatCard {
  key: string;
  title: Text;
  text: Text;
  playerId?: string;
  image?: string;
}

export interface PlayerTotals {
  playerId: string;
  names: number;
  misses: number;
  passes: number;
  trumps: number;
  fastestMs: number | null;
  avgMs: number | null;
  streak: number;
}

export interface GameStats {
  cards: StatCard[];
  totals: PlayerTotals[];
  solo: { score: number; rounds: number; best: { title: Text; names: number } | null } | null;
}

export function secs(ms: number, lang: Lang = "pt"): string {
  const n = (ms / 1000).toFixed(1);
  return `${lang === "pt" ? n.replace(".", ",") : n} s`;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** "3 nomes" / "3 names". */
const names = (n: number, lang: Lang) => (lang === "pt" ? plural(n, "nome", "nomes") : plural(n, "name", "names"));

function top<T>(items: T[], score: (t: T) => number): T | undefined {
  let best: T | undefined;
  for (const it of items) if (best === undefined || score(it) > score(best)) best = it;
  return best;
}

export function computeStats(s: GameState): GameStats {
  const log = s.log;
  const name = (id: string) => s.players.find((p) => p.id === id)?.name ?? "?";
  const ok = (l: LogItem) => l.kind === "ok";

  const totals: PlayerTotals[] = s.players.map((p) => {
    const mine = log.filter((l) => l.playerId === p.id);
    const oks = mine.filter(ok);
    let streak = 0;
    let run = 0;
    let lastRound = -1;
    for (const l of mine) {
      if (l.round !== lastRound) {
        run = 0;
        lastRound = l.round;
      }
      if (l.kind === "ok") streak = Math.max(streak, ++run);
      else if (l.kind === "miss" || l.kind === "pass" || l.kind === "out") run = 0;
    }
    return {
      playerId: p.id,
      names: oks.length,
      misses: mine.filter((l) => l.kind === "miss").length,
      passes: mine.filter((l) => l.kind === "pass").length,
      trumps: mine.filter((l) => l.kind === "trump").length,
      fastestMs: oks.length ? Math.min(...oks.map((l) => l.ms)) : null,
      avgMs: oks.length ? oks.reduce((a, l) => a + l.ms, 0) / oks.length : null,
      streak,
    };
  });

  const cards: StatCard[] = [];
  const multi = s.kind === "multi";

  const most = top(totals, (t) => t.names);
  if (multi && most && most.names > 0)
    cards.push({ key: "names", title: tx("Máquina de nomes", "Name machine"), text: both((l) => `${name(most.playerId)}: ${names(most.names, l)}`), playerId: most.playerId });

  const fastest = top(log.filter(ok), (l) => -l.ms);
  if (fastest)
    cards.push({
      key: "fastest",
      title: tx("Dedo mais rápido", "Fastest finger"),
      text: both((l) => `${multi ? `${name(fastest.playerId)} ${l === "pt" ? "disse" : "said"} ` : ""}${fastest.name} ${l === "pt" ? "em" : "in"} ${secs(fastest.ms, l)}`),
      playerId: fastest.playerId,
      image: fastest.image,
    });

  const streak = top(totals, (t) => t.streak);
  if (streak && streak.streak >= 3)
    cards.push({
      key: "streak",
      title: tx("Em série", "On a roll"),
      text: both((l) => `${multi ? `${name(streak.playerId)}: ` : ""}${streak.streak} ${l === "pt" ? "nomes seguidos sem falhar" : "names in a row without a miss"}`),
      playerId: streak.playerId,
    });

  const close = top(log.filter((l) => ok(l) && l.left < 1500), (l) => -l.left);
  if (close)
    cards.push({
      key: "close",
      title: tx("Salvo pelo gongo", "Saved by the bell"),
      text: both((l) =>
        l === "pt"
          ? `${multi ? `${name(close.playerId)} respondeu` : "Respondeste"} com ${secs(Math.max(0, close.left), l)} no relógio`
          : `${multi ? `${name(close.playerId)} answered` : "You answered"} with ${secs(Math.max(0, close.left), l)} on the clock`,
      ),
      playerId: close.playerId,
    });

  const passer = top(totals, (t) => t.passes);
  if (multi && passer && passer.passes > 0)
    cards.push({
      key: "passes",
      title: tx("Rei do passe", "King of the pass"),
      text: tx(`${name(passer.playerId)} passou ${plural(passer.passes, "vez", "vezes")}`, `${name(passer.playerId)} passed ${plural(passer.passes, "time", "times")}`),
      playerId: passer.playerId,
    });

  const misser = top(totals, (t) => t.misses);
  if (multi && misser && misser.misses >= 2)
    cards.push({
      key: "misses",
      title: tx("Pé frio", "Cold feet"),
      text: tx(`${name(misser.playerId)} falhou ${misser.misses} tentativas`, `${name(misser.playerId)} missed ${misser.misses} tries`),
      playerId: misser.playerId,
    });

  const thinker = top(
    totals.filter((t) => t.names >= 3 && t.avgMs !== null),
    (t) => t.avgMs!,
  );
  if (multi && thinker && totals.filter((t) => t.names >= 3).length >= 2)
    cards.push({
      key: "thinker",
      title: tx("O pensador", "The thinker"),
      text: both((l) => `${name(thinker.playerId)} ${l === "pt" ? "demorou em média" : "took on average"} ${secs(thinker.avgMs!, l)}`),
      playerId: thinker.playerId,
    });

  const trumper = top(totals, (t) => t.trumps);
  if (multi && trumper && trumper.trumps > 0)
    cards.push({
      key: "trumps",
      title: tx("Trunfo na manga", "Ace up the sleeve"),
      text: tx(`${name(trumper.playerId)} usou ${plural(trumper.trumps, "trunfo", "trunfos")}`, `${name(trumper.playerId)} used ${plural(trumper.trumps, "trump card", "trump cards")}`),
      playerId: trumper.playerId,
    });

  const said = new Map<number, { n: number; item: LogItem }>();
  for (const l of log) if ((l.kind === "ok" || l.kind === "trump") && l.qid) {
    const cur = said.get(l.qid);
    said.set(l.qid, { n: (cur?.n ?? 0) + 1, item: cur?.item ?? l });
  }
  const star = top([...said.values()], (x) => x.n);
  if (star && star.n >= 2)
    cards.push({ key: "star", title: tx("Estrela do jogo", "Star of the game"), text: tx(`${star.item.name} foi dito ${star.n} vezes`, `${star.item.name} was said ${star.n} times`), image: star.item.image });

  const rounds = s.history.filter((h) => !h.sudden);
  const hardest = top(rounds, (h) => -h.answers);
  const longest = top(rounds, (h) => h.answers);
  if (longest && longest.answers > 0)
    cards.push({ key: "longest", title: tx("Ronda mais longa", "Longest round"), text: both((l) => `${longest.title[l]}: ${names(longest.answers, l)}`) });
  if (hardest && rounds.length >= 2 && hardest !== longest)
    cards.push({
      key: "hardest",
      title: tx("Ronda mais difícil", "Hardest round"),
      text: both((l) => `${hardest.title[l]}: ${hardest.answers === 0 ? (l === "pt" ? "nenhum nome" : "no names") : `${l === "pt" ? "só" : "only"} ${names(hardest.answers, l)}`}`),
    });

  const solo = s.solo
    ? {
        score: s.solo.score,
        rounds: s.history.length,
        best: longest && longest.answers > 0 ? { title: longest.title, names: longest.answers } : null,
      }
    : null;

  return { cards, totals, solo };
}
