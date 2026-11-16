// Turns what a player typed into a footballer, checked against the round (letter or category).

import { explainMiss, satisfies, type ClubRef, type PlayerFacts, type Prompt } from "./categories.ts";
import { tx, type Text } from "./i18n.ts";
import type { PlayerDb } from "./db.ts";
import { cleanLabel, fold, words } from "./text.ts";

/** A candidate this much more famous (sitelinks) than the next one is taken as "the" player. */
export const DOMINANCE = 3;
/** Among players known by exactly the typed name ("Pepe"), a smaller lead is enough. */
export const EXACT_DOMINANCE = 1.5;

/** Words that don't count when telling "first name + surname" from a full legal name. */
const PARTICLES = new Set(["de", "da", "do", "dos", "das", "di", "del", "della", "du", "van", "von", "der", "den", "ter", "ten", "la", "le", "e", "y"]);

/** A full legal name ("Ricardo Alexandre dos Santos"), rather than first name + surname. */
export function isLegalName(name: string): boolean {
  return legalWords(words(fold(cleanLabel(name))));
}

function legalWords(w: string[]): boolean {
  return w.filter((x) => !PARTICLES.has(x)).length >= 3;
}

/** What the rest of the database knows about a player's first name (see nameKeys). */
export interface NameContext {
  /** The word is some player's first name ("manu", "leo"). */
  isFirstName(word: string): boolean;
  /** This player is the best-known one with that first name ("kepa", "ronaldo"). */
  ownsFirstName(word: string): boolean;
  /** Korean, Chinese and Vietnamese names: the first word is the family name ("son"). */
  familyFirst: boolean;
}

const NO_CONTEXT: NameContext = { isFirstName: () => false, ownsFirstName: () => true, familyFirst: false };

/**
 * Name keys a player can be found by: every label, the surname part ("messi", "van persie"),
 * first + last name of longer names ("juan riquelme") and aliases/nicknames ("cr7", "pepe").
 *
 * A first name on its own is never a key ("lionel"), and a one-word alias or label that is only
 * a first name would bring it back, completing "Manu" into Manuel Neuer. So these are left out:
 * a short form of the player's first name ("manu", "lio"), somebody else's first name ("leo" for
 * Lionel Messi) and the player's own, unless he is the best-known one with it ("kepa", not
 * "harry" for Harry Gregg). Players filed under a full legal name keep them all: there it is
 * the name they play by ("ricardinho" for Ricardo Alexandre dos Santos).
 */
export function nameKeys(labels: string[], aliases: string[], ctx: NameContext = NO_CONTEXT): string[] {
  const keys = new Set<string>();
  const names = labels.map((l) => fold(cleanLabel(l))).filter(Boolean);
  const split = names.map(words);
  const own = new Set(split.flat());
  const firstNames = new Set(split.filter((w) => w.length >= 2).map((w) => w[0]));
  const legalName = legalWords(split[0] ?? []);
  const onlyFirstName = (f: string, alias: boolean): boolean => {
    if (legalName || f.includes(" ")) return false;
    if (firstNames.has(f)) return !ctx.familyFirst && !ctx.ownsFirstName(f);
    if (!alias || own.has(f)) return false;
    return ctx.isFirstName(f) || split.some((w) => w[0].length > f.length && w[0].startsWith(f));
  };
  names.forEach((f, n) => {
    // The name shown in the game always counts.
    if (n > 0 && onlyFirstName(f, false)) return;
    keys.add(f);
    const w = split[n];
    if (w.length >= 2) {
      keys.add(w.slice(1).join(" "));
      const last = w[w.length - 1];
      if (last.length >= 3) keys.add(last);
      if (w.length >= 3) keys.add(`${w[0]} ${last}`);
      if (ctx.familyFirst && w[0].length >= 2) keys.add(w[0]);
    }
  });
  for (const a of aliases) {
    const f = fold(cleanLabel(a));
    if (f && !onlyFirstName(f, true)) keys.add(f);
  }
  return [...keys];
}

/** Letter rule: the first name or the surname typed starts with the letter. */
export function fitsLetter(typedKey: string, letter: string): boolean {
  const w = words(typedKey);
  if (!w.length) return false;
  const l = letter.toLowerCase();
  return w[0][0] === l || w[w.length - 1][0] === l;
}

/** "vague": a first name alone in a letter round; the player just has to add the surname. */
export type MissReason = "short" | "letter" | "used" | "miss" | "notfound" | "vague";

/** One option of "Querias dizer…?". Only the valid one fits the round. */
export interface Choice {
  idx: number;
  valid: boolean;
}

export type Resolution =
  /** idx null: several players share the name and all of them fit (letter rounds). */
  | { status: "ok"; idx: number | null; fuzzy: boolean }
  | { status: "invalid"; reason: MissReason; message: Text }
  /** The name is vague: the player picks which one they meant. */
  | { status: "choose"; options: Choice[] }
  /** Not in the database: ask Wikidata. */
  | { status: "unknown" };

/** Everything the matcher needs from the round. */
export interface RoundContext {
  prompt: Prompt;
  clubs: ClubRef[];
  /** QID numbers already said this round. */
  used: Set<number>;
  /** Typed names (folded) already accepted this round. */
  usedKeys?: Set<string>;
  rng?: () => number;
}

/** A fitting namesake this much less famous than the famous one still gets offered. */
export const OFFER_RATIO = 5;
export const MAX_OPTIONS = 3;

function titleCase(s: string) {
  return s.replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
}

function pickFamous(ids: number[], sl: (i: number) => number, lead = DOMINANCE): number | null {
  if (ids.length === 1) return ids[0];
  const [a, b] = [...ids].sort((x, y) => sl(y) - sl(x));
  return sl(a) >= lead * sl(b) ? a : null;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function resolveAnswer(db: PlayerDb, text: string, ctx: RoundContext): Resolution {
  const key = fold(text);
  if (key.replace(/ /g, "").length < 2) return { status: "invalid", reason: "short", message: tx("Escreve um nome.", "Type a name.") };
  const shown = titleCase(key);
  const { prompt } = ctx;
  const letter = prompt.kind === "letter";
  if (letter && !fitsLetter(key, prompt.letter))
    return { status: "invalid", reason: "letter", message: tx(`${shown} não começa por ${prompt.letter}`, `${shown} doesn't start with ${prompt.letter}`) };
  if (ctx.usedKeys?.has(key)) return { status: "invalid", reason: "used", message: tx(`${shown} já foi dito nesta ronda`, `${shown} was already said this round`) };

  const sl = (i: number) => db.sitelinks(i);
  const fits = (i: number) => satisfies(db.facts(i), prompt);
  const used = (i: number) => ctx.used.has(db.qid(i));
  const byFame = (a: number, b: number) => sl(b) - sl(a);
  const rng = ctx.rng ?? Math.random;

  // A single first name ("Tiago", "Lionel") is vague on its own, and never read as a typo.
  const given = !key.includes(" ") && db.isGivenName(key);
  let byKey = db.lookup(key);
  let fuzzy = false;
  if (!given) {
    // One typo away: used when nothing matches exactly, or when the near match is far more
    // famous than the exact ones ("Mesi" is someone's nickname, but it's surely Messi).
    const near = db.fuzzy(key).filter((i) => !byKey.includes(i));
    const top = byKey.length ? Math.max(...byKey.map(sl)) : 0;
    const typo = byKey.length ? near.filter((i) => sl(i) >= DOMINANCE * top) : near;
    if (typo.length) {
      byKey = [...typo, ...byKey].sort(byFame);
      fuzzy = true;
    }
  }
  const byFirst = given ? db.withFirstName(key).filter((i) => !byKey.includes(i)) : [];
  if (!byKey.length && !byFirst.length) return { status: "unknown" };

  const ask = (valid: number[], decoys: number[]): Resolution => ({
    status: "choose",
    options: shuffle([...valid.map((idx) => ({ idx, valid: true })), ...decoys.map((idx) => ({ idx, valid: false }))], rng),
  });

  // Players known by exactly this name ("Ronaldo" = Ronaldo Nazário, "Pepe").
  const knownAs = (ids: number[]): number | null => {
    const exact = ids.filter((i) => db.labels(i).some((l) => fold(cleanLabel(l)) === key));
    return exact.length ? pickFamous(exact, sl, EXACT_DOMINANCE) : null;
  };
  // Clearly the famous one ("Jota" = Diogo Jota), else the one known by exactly this name.
  const identify = (ids: number[]): number | null => {
    if (ids.length === 1) return ids[0];
    return pickFamous(ids, sl) ?? knownAs(ids);
  };

  // --- Letter rounds: the letter is checked on what was typed, so every namesake is right.
  if (letter) {
    if (byKey.length) {
      const one = identify(byKey);
      if (one !== null && !used(one)) return { status: "ok", idx: one, fuzzy };
      const free = byKey.filter((i) => !used(i));
      if (!free.length) return { status: "invalid", reason: "used", message: tx(`${db.name(byKey[0])} já foi dito nesta ronda`, `${db.name(byKey[0])} was already said this round`) };
      // Several namesakes ("Diomande"): the name itself is the answer.
      return { status: "ok", idx: free.length === 1 ? free[0] : null, fuzzy };
    }
    // "Lionel" on its own doesn't count for L: too vague.
    return { status: "invalid", reason: "vague", message: tx(`${shown} é só o nome próprio: junta o apelido`, `${shown} is just a first name: add the surname`) };
  }

  // --- Category rounds.
  const main = byKey.length ? pickFamous(byKey, sl) : null;
  if (main !== null && fits(main) && !used(main)) return { status: "ok", idx: main, fuzzy };
  const pool = [...byKey, ...byFirst];
  const fitting = pool.filter(fits).sort(byFame);
  const free = fitting.filter((i) => !used(i));
  if (!free.length) {
    if (fitting.length) return { status: "invalid", reason: "used", message: tx(`${db.name(fitting[0])} já foi dito nesta ronda`, `${db.name(fitting[0])} was already said this round`) };
    if (main !== null) return { status: "invalid", reason: "miss", message: explainMiss(db.facts(main), prompt, ctx.clubs, db.name(main)) };
    return { status: "invalid", reason: "miss", message: tx(`Nenhum ${shown} serve para esta ronda`, `No ${shown} fits this round`) };
  }
  const best = free[0];
  // "Messi" meaning an obscure namesake: that's Lionel Messi, judged as such.
  if (main !== null && !fits(main) && sl(best) * OFFER_RATIO < sl(main))
    return { status: "invalid", reason: "miss", message: explainMiss(db.facts(main), prompt, ctx.clubs, db.name(main)) };
  const keyFree = free.filter((i) => byKey.includes(i));
  const known = knownAs(keyFree);
  if (known !== null) return { status: "ok", idx: known, fuzzy };
  if (keyFree.length === free.length && main === null) {
    const one = identify(keyFree);
    if (one !== null) return { status: "ok", idx: one, fuzzy };
  }
  const decoys = [...(main !== null && !fits(main) ? [main] : []), ...pool.filter((i) => !fits(i) && i !== main).sort(byFame)].slice(0, MAX_OPTIONS - 1);
  // Every namesake fits ("Neville" at Manchester United): the name itself is the answer.
  if (!decoys.length && keyFree.length === free.length) return { status: "ok", idx: null, fuzzy };
  return ask([best], decoys);
}

/** A search result from Wikidata, for names that are not in the database. */
export interface LiveHit {
  qid: string;
  label: string;
}

/** Which live search results are known by the typed name (same key rules as the database). */
export function liveMatches(hits: LiveHit[], text: string): LiveHit[] {
  const key = fold(text);
  return hits.filter((h) => nameKeys([h.label], []).includes(key));
}

export type LiveVerdict =
  | { status: "ok"; hit: LiveHit }
  | { status: "invalid"; reason: MissReason; message: Text }
  | { status: "ambiguous"; message: Text };

/** Decides on live results once their facts are known. */
export function judgeLive(
  text: string,
  matches: { hit: LiveHit; facts: PlayerFacts | null }[],
  ctx: RoundContext,
): LiveVerdict {
  const shown = titleCase(fold(text));
  if (!matches.length) return { status: "invalid", reason: "notfound", message: tx(`Não conheço nenhum futebolista ${shown}`, `I don't know any footballer called ${shown}`) };
  const fits = matches.filter((m) => !m.facts || satisfies(m.facts, ctx.prompt));
  const free = fits.filter((m) => !ctx.used.has(Number(m.hit.qid.slice(1))));
  if (free.length === 1) return { status: "ok", hit: free[0].hit };
  if (free.length > 1) return { status: "ambiguous", message: tx(`Há vários ${shown}: sê mais específico`, `There are several ${shown}: be more specific`) };
  if (fits.length) return { status: "invalid", reason: "used", message: tx(`${fits[0].hit.label} já foi dito nesta ronda`, `${fits[0].hit.label} was already said this round`) };
  const m = matches[0];
  return {
    status: "invalid",
    reason: "miss",
    message: m.facts ? explainMiss(m.facts, ctx.prompt, ctx.clubs, m.hit.label) : tx(`${m.hit.label} não serve para esta ronda`, `${m.hit.label} doesn't fit this round`),
  };
}

/** The trump card: a random well-known player that fits the round and hasn't been said. */
export function pickTrumpAnswer(
  db: PlayerDb,
  prompt: Prompt,
  used: Set<number>,
  rng: () => number = Math.random,
  usedKeys: Set<string> = new Set(),
): number | null {
  const limit = Math.min(db.size, 40_000);
  const found: number[] = [];
  for (let i = 0; i < limit && found.length < 150; i++) {
    if (used.has(db.qid(i)) || usedKeys.has(fold(db.name(i)))) continue;
    if (prompt.kind === "letter" && !fitsLetter(fold(db.name(i)), prompt.letter)) continue;
    if (!satisfies(db.facts(i), prompt)) continue;
    found.push(i);
  }
  return found.length ? found[Math.floor(rng() * found.length)] : null;
}
