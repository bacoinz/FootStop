// The player database: file format (written by scripts/build-db.ts) and the in-memory index.

import type { Category, PlayerFacts } from "./categories.ts";
import { isLegalName, nameKeys, type NameContext } from "./match.ts";
import { cleanLabel, fold } from "./text.ts";

export interface DbClub {
  q: string;
  key: string;
  name: string;
  prep: "no" | "na";
  /** COUNTRIES index, -1 if unknown. */
  country: number;
}

/** PlayerFacts flags, as bits. */
export const FLAG_COACH = 1;
export const FLAG_MLS = 2;
/** Not a fact: the name has the family name first ("Son Heung-min"). */
export const FLAG_FAMILY_FIRST = 4;

/** Column-oriented, so it stays small in memory once parsed. */
export interface DbFile {
  v: 1;
  builtAt: string;
  clubs: DbClub[];
  categories: Category[];
  /** Wikidata QID numbers (Q123 → 123), most famous first. */
  q: number[];
  /** Name shown in the game (Portuguese label when there is one). */
  name: string[];
  /** Other labels, "|"-separated. */
  alt: string[];
  /** Aliases and nicknames, "|"-separated. */
  al: string[];
  sl: number[];
  by: number[];
  pos: number[];
  caps: number[];
  /** Nationalities, encoded with encodeCountries. */
  nat: string[];
  /** Countries played in (club countries), encoded with encodeCountries. */
  cc: string[];
  /** Spells at the category clubs: flat [club, start, end, …] or 0. */
  cs: (number[] | 0)[];
  /** Commons file name of the photo, or "". */
  img: string[];
  /** Continents of the nationalities (CONT bits). */
  cont: number[];
  /** FLAG_* bits: became a manager, played in the MLS, family name first. */
  flags: number[];
  /** Country item → CONT bits, for players checked live on Wikidata. */
  contByCountry: Record<string, number>;
  /** MLS club items, for players checked live on Wikidata. */
  mlsClubs: string[];
}

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

export function encodeCountries(idx: number[]): string {
  return [...new Set(idx)].map((i) => ALPHABET[i]).join("");
}

export function decodeCountries(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) out.push(ALPHABET.indexOf(ch));
  return out;
}

export function commonsThumb(file: string, width = 120): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${file}?width=${width}`;
}

/** Name → players index, with a one-typo fallback. */
export class PlayerDb {
  readonly file: DbFile;
  private keys = new Map<string, number | number[]>();
  private byLength = new Map<number, string[]>();
  private byQid = new Map<number, number>();
  /** Players by first name, for names with more than one word ("tiago" → Tiago Mendes…). */
  private firstNames = new Map<string, number[]>();
  readonly clubByQid = new Map<string, number>();

  constructor(file: DbFile) {
    this.file = file;
    const n = file.q.length;
    // First names go first: they tell which aliases are names of their own (see nameKeys).
    for (let i = 0; i < n; i++) {
      this.byQid.set(file.q[i], i);
      const w = fold(file.name[i]).split(" ");
      if (w.length >= 2) {
        const list = this.firstNames.get(w[0]);
        if (list) list.push(i);
        else this.firstNames.set(w[0], [i]);
      }
    }
    const isFirstName = (word: string) => this.firstNames.has(word);
    for (let i = 0; i < n; i++) {
      const labels = file.alt[i] ? [file.name[i], ...file.alt[i].split("|")] : [file.name[i]];
      const aliases = file.al[i] ? file.al[i].split("|") : [];
      const ctx: NameContext = {
        isFirstName,
        // Lists are in file order: most famous first.
        ownsFirstName: (word) => this.firstNames.get(word)?.[0] === i,
        familyFirst: ((file.flags?.[i] ?? 0) & FLAG_FAMILY_FIRST) !== 0,
      };
      for (const k of nameKeys(labels, aliases, ctx)) {
        const cur = this.keys.get(k);
        if (cur === undefined) this.keys.set(k, i);
        else if (typeof cur === "number") {
          if (cur !== i) this.keys.set(k, [cur, i]);
        } else if (cur[cur.length - 1] !== i) cur.push(i);
      }
    }
    for (const k of this.keys.keys()) {
      let list = this.byLength.get(k.length);
      if (!list) this.byLength.set(k.length, (list = []));
      list.push(k);
    }
    file.clubs.forEach((c, i) => this.clubByQid.set(c.q, i));
  }

  get size() {
    return this.file.q.length;
  }

  /** Players with exactly this (folded) name key, most famous first. */
  lookup(key: string): number[] {
    const v = this.keys.get(key);
    return v === undefined ? [] : typeof v === "number" ? [v] : v;
  }

  /** Players whose name key is one edit (insert, delete, substitute, swap) away. Keys ≥ 5 letters. */
  fuzzy(key: string): number[] {
    if (key.length < 4) return [];
    const out = new Set<number>();
    for (let len = key.length - 1; len <= key.length + 1; len++) {
      if (len < 5) continue;
      for (const k of this.byLength.get(len) ?? []) if (withinOneEdit(key, k)) for (const i of this.lookup(k)) out.add(i);
    }
    return [...out].sort((a, b) => a - b);
  }

  isGivenName(key: string): boolean {
    return this.firstNames.has(key);
  }

  /** Players whose name starts with this first name, most famous first. */
  withFirstName(key: string): number[] {
    return this.firstNames.get(key) ?? [];
  }

  indexOfQid(qid: number): number | undefined {
    return this.byQid.get(qid);
  }

  qid(i: number): number {
    return this.file.q[i];
  }

  name(i: number): string {
    return this.file.name[i];
  }

  /**
   * The name to show when the player was called `key` (folded, maybe with a typo): a name of
   * their own that the usual one doesn't show ("Pizzi", not "Luís Miguel Afonso Fernandes"),
   * else the usual one.
   */
  nameFor(i: number, key: string, typo = false): string {
    const name = this.file.name[i];
    const near = (a: string, b: string) => (typo ? withinOneEdit(a, b) : a === b);
    const own = fold(name).split(" ");
    if (key.split(" ").every((w) => own.some((o) => near(o, w)))) return name;
    const same = (l: string) => near(fold(cleanLabel(l)), key);
    const called = this.labels(i).slice(1).find(same) ?? (isLegalName(name) ? this.aliases(i).find(same) : undefined);
    return called ? cleanLabel(called) : name;
  }

  labels(i: number): string[] {
    const alt = this.file.alt[i];
    return alt ? [this.file.name[i], ...alt.split("|")] : [this.file.name[i]];
  }

  aliases(i: number): string[] {
    const al = this.file.al[i];
    return al ? al.split("|") : [];
  }

  sitelinks(i: number): number {
    return this.file.sl[i];
  }

  image(i: number): string | undefined {
    const f = this.file.img[i];
    return f ? commonsThumb(f) : undefined;
  }

  facts(i: number): PlayerFacts {
    const f = this.file;
    const stints: PlayerFacts["stints"] = [];
    const cs = f.cs[i];
    if (cs) for (let j = 0; j < cs.length; j += 3) stints.push({ club: cs[j], country: f.clubs[cs[j]]?.country ?? -1, start: cs[j + 1], end: cs[j + 2] });
    for (const c of decodeCountries(f.cc[i])) stints.push({ club: -1, country: c, start: 0, end: 0 });
    const flags = f.flags?.[i] ?? 0;
    return {
      nats: decodeCountries(f.nat[i]),
      pos: f.pos[i],
      caps: f.caps[i],
      by: f.by[i],
      stints,
      cont: f.cont?.[i] ?? 0,
      coach: (flags & FLAG_COACH) !== 0,
      mls: (flags & FLAG_MLS) !== 0,
    };
  }
}

/** Optimal string alignment distance ≤ 1. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    // One substitution, or one swap of neighbours.
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}
