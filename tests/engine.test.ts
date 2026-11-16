import { describe, expect, it } from "vitest";
import {
  BONUS_MS,
  INTRO_MS,
  PASS_PENALTY_MS,
  ROUND_END_MS,
  SOLO_ROUND_END_MS,
  SUDDEN_MS,
  acceptAnswer,
  answerBlock,
  apply,
  chooseOption,
  offerChoice,
  clockLeft,
  createGame,
  join,
  nextDeadline,
  pauseForCheck,
  pickCategory,
  rejectAnswer,
  resumeAfterCheck,
  tick,
  useTrump,
  viewFor,
  type EngineEnv,
  type GameState,
} from "../shared/engine.ts";
import { club, letter } from "./fixtures.ts";

const categories = [letter("A"), letter("B"), letter("C"), letter("D"), letter("E"), letter("F"), club("benfica"), club("manutd")];
const env: EngineEnv = { categories, rng: () => 0.1 };

function game(n: number, opts: { kind?: "multi" | "solo"; seconds?: number; rounds?: number; lives?: number } = {}) {
  let now = 1_000_000;
  const s = createGame("ABCD", opts.kind ?? "multi", now);
  for (let i = 0; i < n; i++) join(s, { id: `p${i}`, token: `t${i}`, name: `P${i}` }, now);
  const host = "p0";
  if (opts.seconds) apply(s, host, { type: "settings", seconds: opts.seconds }, env, now);
  if (opts.rounds) apply(s, host, { type: "settings", rounds: opts.rounds }, env, now);
  if (opts.lives) apply(s, host, { type: "settings", lives: opts.lives }, env, now);
  expect(apply(s, host, { type: "start" }, env, now)).toBeNull();
  now += INTRO_MS;
  const clock = {
    get now() {
      return now;
    },
    advance(ms: number) {
      now += ms;
      tick(s, env, now);
    },
  };
  return { s, clock };
}

let q = 1;
function answer(s: GameState, now: number) {
  const id = s.round!.turn!.playerId;
  acceptAnswer(s, id, "x", { qid: q++, name: `Jogador ${q}` }, now);
  return id;
}

/** Lets the current player's clock run out. */
function runOut(s: GameState, clock: { now: number; advance(ms: number): void }) {
  const id = s.round!.turn!.playerId;
  clock.advance(nextDeadline(s)! - clock.now + 1);
  return id;
}

describe("starting", () => {
  it("needs two players for a room game", () => {
    const s = createGame("ABCD", "multi", 0);
    join(s, { id: "a", token: "t", name: "A" }, 0);
    expect(apply(s, "a", { type: "start" }, env, 0)?.pt).toMatch(/2 jogadores/);
    expect(apply(s, "a", { type: "start" }, env, 0)?.en).toMatch(/at least 2 players/);
  });

  it("the wheel and countdown come first: no answers before the clock starts", () => {
    const s = createGame("ABCD", "multi", 0);
    join(s, { id: "a", token: "t", name: "A" }, 0);
    join(s, { id: "b", token: "t", name: "B" }, 0);
    apply(s, "a", { type: "start" }, env, 0);
    expect(answerBlock(s, "a", INTRO_MS - 1)?.pt).toMatch(/Ainda não/);
    expect(answerBlock(s, "a", INTRO_MS)).toBeNull();
    expect(answerBlock(s, "b", INTRO_MS)?.pt).toMatch(/vez/);
  });

  it("the host starts the first round", () => {
    const { s } = game(3);
    expect(s.round!.turn!.playerId).toBe("p0");
  });
});

describe("chess clock", () => {
  it("a right answer gives 1 s back and the next clock starts at once", () => {
    const { s, clock } = game(3, { seconds: 30 });
    clock.advance(3000);
    answer(s, clock.now);
    expect(s.players[0].bankMs).toBe(30_000 - 3000 + BONUS_MS);
    expect(s.round!.turn).toMatchObject({ playerId: "p1", startedAt: clock.now });
    clock.advance(500);
    expect(clockLeft(s, s.players[1], clock.now)).toBe(29_500);
  });

  it("a wrong answer costs nothing but time; the clock keeps running", () => {
    const { s, clock } = game(2);
    clock.advance(1000);
    rejectAnswer(s, "p0", "zzz", "não", clock.now);
    expect(s.round!.turn!.playerId).toBe("p0");
    expect(s.event).toMatchObject({ kind: "miss", message: "não" });
    clock.advance(1000);
    expect(clockLeft(s, s.players[0], clock.now)).toBe(43_000);
  });

  it("passing costs 5 s and moves on; with less than 5 s it knocks you out", () => {
    const { s, clock } = game(3, { seconds: 30 });
    clock.advance(2000);
    apply(s, "p0", { type: "pass" }, env, clock.now);
    expect(s.players[0].bankMs).toBe(30_000 - 2000 - PASS_PENALTY_MS);
    expect(s.round!.turn!.playerId).toBe("p1");
    clock.advance(26_000);
    apply(s, "p1", { type: "pass" }, env, clock.now);
    expect(s.players[1].alive).toBe(false);
    expect(s.round!.eliminated).toEqual(["p1"]);
    expect(s.round!.turn!.playerId).toBe("p2");
  });

  it("a Wikidata check freezes the clock", () => {
    const { s, clock } = game(2);
    clock.advance(1000);
    const seq = pauseForCheck(s, "Fulano", clock.now);
    expect(answerBlock(s, "p0", clock.now)?.pt).toMatch(/verificar/);
    clock.advance(1500);
    expect(clockLeft(s, s.players[0], clock.now)).toBe(44_000);
    expect(resumeAfterCheck(s, seq, clock.now)).toBe(true);
    clock.advance(1000);
    expect(clockLeft(s, s.players[0], clock.now)).toBe(43_000);
  });

  it("the deadline is when the clock of the player on turn hits zero", () => {
    const { s, clock } = game(2, { seconds: 30 });
    expect(nextDeadline(s)).toBe(clock.now + 30_000);
  });
});

describe("rounds and points", () => {
  it("last one standing wins; points go N-1 … 0 by the order of elimination", () => {
    const { s, clock } = game(4);
    const out: string[] = [];
    while (s.phase === "round") {
      // p3 always answers; the others let the clock run out.
      if (s.round!.turn!.playerId === "p3") answer(s, clock.now);
      else out.push(runOut(s, clock));
    }
    expect(s.phase).toBe("roundEnd");
    const [first, second, third] = out;
    const pts = Object.fromEntries(s.players.map((p) => [p.id, p.points]));
    expect(pts).toEqual({ p3: 3, [third]: 2, [second]: 1, [first]: 0 });
    expect(s.players.find((p) => p.id === "p3")!.roundsWon).toBe(1);
    expect(s.round!.placements).toEqual(["p3", third, second, first]);
    expect(s.players.find((p) => p.id === first)!.form).toEqual([4]);
  });

  it("last place gets a trump for the next round only, and starts it", () => {
    const { s, clock } = game(3);
    const first = runOut(s, clock);
    while (s.phase === "round") answer(s, clock.now), runOut(s, clock);
    expect(s.players.find((p) => p.id === first)!.trump).toBe(true);
    clock.advance(ROUND_END_MS);
    expect(s.phase).toBe("round");
    expect(s.round!.n).toBe(2);
    expect(s.round!.turn!.playerId).toBe(first);
    clock.advance(INTRO_MS);
    expect(useTrump(s, first, { qid: 999, name: "Nome do trunfo" }, clock.now)).toBeNull();
    expect(s.players.find((p) => p.id === first)!.trump).toBe(false);
    expect(s.players.find((p) => p.id === first)!.trumpsUsed).toBe(1);
    expect(s.event).toMatchObject({ kind: "trump", name: "Nome do trunfo" });
    // Nobody else can use one.
    const other = s.round!.turn!.playerId;
    expect(useTrump(s, other, { qid: 998, name: "x" }, clock.now)?.pt).toMatch(/trunfo/);
  });

  it("an unused trump expires at the end of the round", () => {
    const { s, clock } = game(2);
    const first = runOut(s, clock);
    clock.advance(ROUND_END_MS + INTRO_MS);
    expect(s.players.find((p) => p.id === first)!.trump).toBe(true);
    runOut(s, clock);
    const holder = s.players.find((p) => p.id === first)!;
    expect(holder.trump).toBe(holder.id === s.round!.placements!.at(-1));
  });

  it("the host can skip the table", () => {
    const { s, clock } = game(2);
    runOut(s, clock);
    expect(s.phase).toBe("roundEnd");
    apply(s, "p0", { type: "next" }, env, clock.now);
    expect(s.phase).toBe("round");
  });

  it("the same typed name can't be said twice in a round", () => {
    const { s, clock } = game(2);
    acceptAnswer(s, "p0", "Diomande", { qid: null, name: "Diomande" }, clock.now);
    expect(s.round!.usedKeys).toContain("diomande");
    expect(s.round!.used).toEqual([]);
  });

  it("vague names: the player picks an option, and only the right one counts", () => {
    const { s, clock } = game(2);
    offerChoice(s, "p0", "Silva", [
      { qid: 1, name: "Bernardo Silva", hint: "n. 1994", valid: true },
      { qid: 2, name: "David Silva", hint: "n. 1986", valid: false, message: "David Silva não jogou no Benfica" },
    ], clock.now);
    // Only the chooser sees the options, and nobody sees which one is right.
    const mine = viewFor(s, "p0", clock.now).round!.turn!.choice!;
    expect(mine.options.map((o) => o.name)).toEqual(["Bernardo Silva", "David Silva"]);
    expect(JSON.stringify(mine)).not.toContain("valid");
    expect(viewFor(s, "p1", clock.now).round!.turn!.choice).toBeNull();
    expect(chooseOption(s, "p0", 2, clock.now)).toBeNull();
    expect(s.event).toMatchObject({ kind: "miss", message: "David Silva não jogou no Benfica" });
    expect(s.round!.turn!.playerId).toBe("p0");
    offerChoice(s, "p0", "Silva", [{ qid: 1, name: "Bernardo Silva", valid: true }], clock.now);
    expect(chooseOption(s, "p0", 1, clock.now)).toBeNull();
    expect(s.event).toMatchObject({ kind: "ok", name: "Bernardo Silva" });
    expect(s.round!.used).toEqual([1]);
    expect(s.round!.usedKeys).toEqual(expect.arrayContaining(["silva", "bernardo silva"]));
    expect(s.round!.turn!.playerId).toBe("p1");
    expect(chooseOption(s, "p1", 1, clock.now)?.pt).toMatch(/disponível/);
  });

  it("the wheel holds the round's prompt among others", () => {
    const { s } = game(2);
    const r = s.round!;
    expect(r.wheel.length).toBeGreaterThan(3);
    expect(r.wheel[r.wheelIndex]).toBe(r.category.short ?? r.category.title);
    expect(new Set(r.wheel).size).toBe(r.wheel.length);
  });

  it("names are only blocked within the round", () => {
    const { s, clock } = game(2);
    acceptAnswer(s, "p0", "Messi", { qid: 615, name: "Lionel Messi" }, clock.now);
    expect(s.round!.used).toEqual([615]);
    runOut(s, clock);
    clock.advance(ROUND_END_MS);
    expect(s.round!.used).toEqual([]);
  });

  it("the view never carries the names said", () => {
    const { s, clock } = game(2);
    acceptAnswer(s, "p0", "Messi", { qid: 615, name: "Lionel Messi" }, clock.now);
    const v = viewFor(s, "p1", clock.now);
    expect(JSON.stringify(v.round)).not.toContain("Messi");
    expect(v.players[0]).not.toHaveProperty("token");
  });
});

describe("end of the game", () => {
  function playRounds(s: GameState, clock: { now: number; advance(ms: number): void }, winners: string[]) {
    for (const w of winners) {
      while (s.phase === "round") {
        if (s.round!.turn!.playerId === w) answer(s, clock.now);
        else runOut(s, clock);
      }
      clock.advance(ROUND_END_MS);
    }
  }

  it("most points wins", () => {
    const { s, clock } = game(2, { rounds: 5 });
    playRounds(s, clock, ["p0", "p0", "p1", "p0", "p0"]);
    expect(s.phase).toBe("gameEnd");
    expect(s.championId).toBe("p0");
    expect(s.stats!.cards.length).toBeGreaterThan(0);
  });

  it("a tie goes to sudden death: 15 s, no bonus, no trump", () => {
    const { s, clock } = game(2, { rounds: 5 });
    playRounds(s, clock, ["p0", "p1", "p0", "p1", "p0"]);
    expect(s.phase).toBe("gameEnd");
    // Make it a dead heat and replay the decision.
    const t = createGame("ABCD", "multi", 0);
    Object.assign(t, s, { phase: "roundEnd", roundEndAt: 0, championId: null });
    t.players.forEach((p) => Object.assign(p, { points: 3, roundsWon: 2, names: 5 }));
    tick(t, env, clock.now);
    expect(t.round!.sudden).toBe(true);
    expect(t.round!.order.sort()).toEqual(["p0", "p1"]);
    expect(t.players.every((p) => p.bankMs === SUDDEN_MS && !p.trump)).toBe(true);
    const now = t.round!.startAt + 2000;
    const id = t.round!.turn!.playerId;
    acceptAnswer(t, id, "x", { qid: 1, name: "x" }, now);
    expect(t.players.find((p) => p.id === id)!.bankMs).toBe(SUDDEN_MS - 2000);
  });

  it("rematch goes back to the lobby", () => {
    const { s, clock } = game(2, { rounds: 5 });
    playRounds(s, clock, ["p0", "p0", "p0", "p0", "p0"]);
    apply(s, "p1", { type: "rematch" }, env, clock.now);
    expect(s.phase).toBe("lobby");
  });
});

describe("solo", () => {
  it("wrong names, timeouts and passes each cost a round; ambiguous names don't", () => {
    const { s, clock } = game(1, { kind: "solo", lives: 3 });
    expect(s.solo!.lives).toBe(3);
    answer(s, clock.now);
    answer(s, clock.now);
    expect(s.round!.turn!.playerId).toBe("p0");
    expect(s.solo!.score).toBe(2);
    rejectAnswer(s, "p0", "Silva", "Há vários Silva", clock.now, true);
    expect(s.solo!.lives).toBe(3);
    expect(s.phase).toBe("round");
    rejectAnswer(s, "p0", "Zé", "não", clock.now);
    expect(s.solo!.lives).toBe(2);
    expect(s.phase).toBe("roundEnd");
    clock.advance(SOLO_ROUND_END_MS);
    clock.advance(INTRO_MS);
    expect(s.phase).toBe("round");
    runOut(s, clock);
    expect(s.solo!.lives).toBe(1);
    clock.advance(SOLO_ROUND_END_MS);
    clock.advance(INTRO_MS);
    apply(s, "p0", { type: "pass" }, env, clock.now);
    expect(s.solo!.lives).toBe(0);
    clock.advance(SOLO_ROUND_END_MS);
    expect(s.phase).toBe("gameEnd");
    expect(s.stats!.solo!.score).toBe(2);
  });

  it("nobody else can join a solo room", () => {
    const s = createGame("ABCD", "solo", 0);
    expect(join(s, { id: "a", token: "t", name: "A" }, 0)).toBeNull();
    expect(join(s, { id: "b", token: "t", name: "B" }, 0)?.pt).toMatch(/um jogador/);
  });
});

describe("prompts", () => {
  it("follows the mode and never repeats", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const c = pickCategory(categories, "letters", [...seen])!;
      expect(c.family).toBe("letter");
      expect(seen.has(c.id)).toBe(false);
      seen.add(c.id);
    }
    expect(pickCategory(categories, "categories", [])!.family).toBe("club");
  });

  it("mixed: a category 1 time in 3, and common letters more often", () => {
    const cats = [
      { ...letter("M"), answers: 900 },
      { ...letter("Q"), answers: 100 },
      club("benfica"),
    ];
    // The first random number decides letter (≥ 1/3) or category (< 1/3).
    const seq = (...xs: number[]) => {
      let i = 0;
      return () => xs[i++ % xs.length];
    };
    expect(pickCategory(cats, "mixed", [], seq(0.2, 0.5, 0.5))!.family).toBe("club");
    expect(pickCategory(cats, "mixed", [], seq(0.4, 0.5))!.family).toBe("letter");
    // Letters by weight: M has 90% of the weight.
    expect(pickCategory(cats, "mixed", [], seq(0.9, 0.85))!.id).toBe("letter:M");
    expect(pickCategory(cats, "mixed", [], seq(0.9, 0.95))!.id).toBe("letter:Q");
    let categoriesDrawn = 0;
    let m = 0;
    for (let i = 0; i < 3000; i++) {
      const c = pickCategory(cats, "mixed", [])!;
      if (c.family !== "letter") categoriesDrawn++;
      if (c.id === "letter:M") m++;
    }
    expect(categoriesDrawn / 3000).toBeGreaterThan(0.28);
    expect(categoriesDrawn / 3000).toBeLessThan(0.39);
    expect(m / (3000 - categoriesDrawn)).toBeGreaterThan(0.85);
  });
});
