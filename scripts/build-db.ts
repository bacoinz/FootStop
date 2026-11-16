// Builds public/data/players.bin (gzipped JSON) from Wikidata: footballers, the countries they
// played in, spells at the clubs used by the categories, national team caps, positions, birth year,
// plus the list of letters and categories that have enough possible answers.
//
//   node scripts/build-db.ts            (raw query results are cached in scripts/.cache)
//   rm -rf scripts/.cache && node scripts/build-db.ts   (to refresh the data)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { cleanLabel, fold, words } from "../shared/text.ts";
import {
  CLUBS,
  COUNTRIES,
  COUNTRY_BY_QID,
  COUNTRY_INDEX,
  CLUBS as CLUB_SPECS,
  CONT,
  NATIONALITIES,
  PLAYED_IN_PAIRS,
  PLAYED_IN_SINGLE,
  POS,
  positionBits,
  promptTitle,
  satisfies,
  shortTitle,
  type Category,
  type ClubRef,
  type Family,
  type PlayerFacts,
  type ContKey,
  type PosKey,
  type Prompt,
} from "../shared/categories.ts";
import { same } from "../shared/i18n.ts";
import { encodeCountries, FLAG_COACH, FLAG_FAMILY_FIRST, FLAG_MLS, type DbFile, type DbClub } from "../shared/db.ts";

const MIN_SITELINKS = Number(process.env.MIN_SITELINKS ?? 6);
/** Players that count when measuring how many answers a category has. */
const NOTABLE = 12;
const MIN_ANSWERS = 40;
const MIN_ANSWERS_COMBO = 25;
const MIN_ANSWERS_LETTER = 60;
const BATCH = 1500;
const CONCURRENCY = 4;

const ROOT = new URL("..", import.meta.url);
const CACHE = new URL("scripts/.cache/", ROOT);
const OUT = new URL("public/data/players.bin", ROOT);
const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "Footstop/1.0 (https://footstop.fc-intel.workers.dev; football party game, data build script)";

mkdirSync(CACHE, { recursive: true });
mkdirSync(new URL("public/data/", ROOT), { recursive: true });

// --- SPARQL -------------------------------------------------------------------

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sparql(name: string, query: string): Promise<string[][]> {
  const file = new URL(`${name}.csv`, CACHE);
  if (existsSync(file)) return parseCsv(readFileSync(file, "utf8")).slice(1);
  for (let attempt = 1; ; attempt++) {
    const started = Date.now();
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "User-Agent": UA, Accept: "text/csv", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ query }),
        signal: AbortSignal.timeout(120_000),
      });
      if (res.ok) {
        const text = await res.text();
        writeFileSync(file, text);
        console.log(`  ${name}: ${((Date.now() - started) / 1000).toFixed(1)}s`);
        return parseCsv(text).slice(1);
      }
      const wait = Number(res.headers.get("retry-after") ?? 0) * 1000 || 5000 * attempt;
      console.warn(`  ${name}: HTTP ${res.status}, retrying in ${wait / 1000}s`);
      if (attempt >= 6) throw new Error(`${name}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
      await sleep(wait);
    } catch (e) {
      if (attempt >= 6) throw e;
      console.warn(`  ${name}: ${e}, retrying`);
      await sleep(5000 * attempt);
    }
  }
}

async function pool<T>(items: T[], n: number, fn: (item: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    }),
  );
}

const qidOf = (uri: string) => uri.slice(uri.lastIndexOf("/") + 1);
const values = (qids: string[]) => qids.map((q) => `wd:${q}`).join(" ");
function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// --- 1. Player list -------------------------------------------------------------

console.log(`Footballers with ≥ ${MIN_SITELINKS} sitelinks…`);
const listRows = await sparql(
  `list-${MIN_SITELINKS}`,
  `SELECT ?p ?sl WHERE { ?p wdt:P106 wd:Q937857 ; wikibase:sitelinks ?sl . FILTER(?sl >= ${MIN_SITELINKS}) }`,
);
const sitelinks = new Map<string, number>();
for (const [uri, sl] of listRows) if (uri) sitelinks.set(qidOf(uri), Math.max(Number(sl), sitelinks.get(qidOf(uri)) ?? 0));
// Most famous first: candidate lists come out ordered by fame.
const qids = [...sitelinks.keys()].sort((a, b) => sitelinks.get(b)! - sitelinks.get(a)!);
console.log(`  ${qids.length} players`);

interface Raw {
  labels: string[];
  aliases: string[];
  by: number;
  img: string;
  pos: Set<string>;
  nat: Set<string>;
  teams: { club: string; start: number; end: number; apps: number | null }[];
  coach: boolean;
}
const raw = new Map<string, Raw>(qids.map((q) => [q, { labels: [], aliases: [], by: 0, img: "", pos: new Set(), nat: new Set(), teams: [], coach: false }]));

// --- 2. Player details, in batches ------------------------------------------------

const batches = chunks(qids, BATCH);
console.log(`Details in ${batches.length} batches…`);
await pool(batches, CONCURRENCY, async (batch, i) => {
  const v = values(batch);
  const basic = await sparql(
    `basic-${MIN_SITELINKS}-${i}`,
    `SELECT ?q ?en ?pt ?mul ?by ?img WHERE {
      VALUES ?p { ${v} }
      BIND(STRAFTER(STR(?p), "entity/") AS ?q)
      OPTIONAL { ?p rdfs:label ?en . FILTER(LANG(?en) = "en") }
      OPTIONAL { ?p rdfs:label ?pt . FILTER(LANG(?pt) = "pt") }
      OPTIONAL { ?p rdfs:label ?mul . FILTER(LANG(?mul) = "mul") }
      OPTIONAL { ?p wdt:P569 ?b . BIND(YEAR(?b) AS ?by) }
      OPTIONAL { ?p wdt:P18 ?img }
    }`,
  );
  for (const [q, en, pt, mul, by, img] of basic) {
    const r = raw.get(q);
    if (!r) continue;
    // Portuguese label first: it is the one shown in the game.
    for (const l of [pt, en, mul]) if (l && !r.labels.includes(l)) r.labels.push(l);
    if (by && !r.by) r.by = Number(by);
    if (img && !r.img) r.img = img.slice(img.lastIndexOf("/") + 1);
  }
  const multi = await sparql(
    `multi-${MIN_SITELINKS}-${i}`,
    `SELECT ?q ?k ?v WHERE {
      VALUES ?p { ${v} }
      BIND(STRAFTER(STR(?p), "entity/") AS ?q)
      { ?p skos:altLabel ?v . FILTER(LANG(?v) IN ("en", "pt", "mul")) BIND("a" AS ?k) }
      UNION { ?p wdt:P413 ?x . BIND("pos" AS ?k) BIND(STRAFTER(STR(?x), "entity/") AS ?v) }
      UNION { ?p wdt:P27 ?x . BIND("nat" AS ?k) BIND(STRAFTER(STR(?x), "entity/") AS ?v) }
      UNION { ?p wdt:P1532 ?x . BIND("nat" AS ?k) BIND(STRAFTER(STR(?x), "entity/") AS ?v) }
    }`,
  );
  for (const [q, k, val] of multi) {
    const r = raw.get(q);
    if (!r || !val) continue;
    if (k === "a") r.aliases.push(val);
    else if (k === "pos") r.pos.add(val);
    else if (k === "nat") r.nat.add(val);
  }
  // Nicknames and short names ("CR7", "Leo Messi") count as aliases too.
  const nicks = await sparql(
    `nicks-${MIN_SITELINKS}-${i}`,
    `SELECT ?q ?v WHERE {
      VALUES ?p { ${v} }
      BIND(STRAFTER(STR(?p), "entity/") AS ?q)
      { ?p wdt:P1449 ?v } UNION { ?p wdt:P1813 ?v }
    }`,
  );
  for (const [q, val] of nicks) {
    const r = raw.get(q);
    if (r && val) r.aliases.push(val);
  }
  // Players who became managers.
  const coaches = await sparql(
    `coaches-${MIN_SITELINKS}-${i}`,
    `SELECT ?q WHERE {
      VALUES ?p { ${v} }
      BIND(STRAFTER(STR(?p), "entity/") AS ?q)
      ?p wdt:P106 wd:Q628099 .
    }`,
  );
  for (const [q] of coaches) {
    const r = raw.get(q);
    if (r) r.coach = true;
  }
  const teams = await sparql(
    `teams-${MIN_SITELINKS}-${i}`,
    `SELECT ?q ?c ?s ?e ?m WHERE {
      VALUES ?p { ${v} }
      BIND(STRAFTER(STR(?p), "entity/") AS ?q)
      ?p p:P54 ?st . ?st ps:P54 ?club .
      BIND(STRAFTER(STR(?club), "entity/") AS ?c)
      OPTIONAL { ?st pq:P580 ?sd . BIND(YEAR(?sd) AS ?s) }
      OPTIONAL { ?st pq:P582 ?ed . BIND(YEAR(?ed) AS ?e) }
      OPTIONAL { ?st pq:P1350 ?m }
    }`,
  );
  for (const [q, c, s, e, m] of teams) {
    const r = raw.get(q);
    if (!r || !c) continue;
    r.teams.push({ club: c, start: Number(s) || 0, end: Number(e) || 0, apps: m ? Number(m) : null });
  }
});

// --- 3. Clubs ------------------------------------------------------------------------

const clubIds = [...new Set([...raw.values()].flatMap((r) => r.teams.map((t) => t.club)))].sort();
console.log(`${clubIds.length} clubs…`);
interface ClubInfo {
  en: string;
  pt: string;
  countries: string[];
  desc: string;
  nt: boolean;
}
const clubInfo = new Map<string, ClubInfo>();
await pool(chunks(clubIds, 3000), CONCURRENCY, async (batch, i) => {
  const rows = await sparql(
    `clubs-${MIN_SITELINKS}-${i}`,
    `SELECT ?c ?en ?pt ?country ?desc ?nt WHERE {
      VALUES ?club { ${values(batch)} }
      BIND(STRAFTER(STR(?club), "entity/") AS ?c)
      OPTIONAL { ?club rdfs:label ?en . FILTER(LANG(?en) = "en") }
      OPTIONAL { ?club rdfs:label ?pt . FILTER(LANG(?pt) = "pt") }
      OPTIONAL { ?club wdt:P17 ?cc . BIND(STRAFTER(STR(?cc), "entity/") AS ?country) }
      OPTIONAL { ?club schema:description ?desc . FILTER(LANG(?desc) = "en") }
      OPTIONAL { ?club wdt:P31 wd:Q6979593 . BIND(1 AS ?nt) }
    }`,
  );
  for (const [c, en, pt, country, desc, nt] of rows) {
    let info = clubInfo.get(c);
    if (!info) clubInfo.set(c, (info = { en: en ?? "", pt: pt ?? "", countries: [], desc: desc ?? "", nt: false }));
    if (country && !info.countries.includes(country)) info.countries.push(country);
    if (nt) info.nt = true;
  }
});

// MLS clubs (any time in the league).
const mlsRows = await sparql(
  "mls-clubs",
  `SELECT DISTINCT ?c WHERE { ?club p:P118/ps:P118 wd:Q18543 . BIND(STRAFTER(STR(?club), "entity/") AS ?c) }`,
);
// Only clubs players actually played for (the query also finds seasons, matches…).
const MLS_CLUBS = new Set(mlsRows.map(([c]) => c).filter((c) => c && clubInfo.has(c) && !isNationalTeamName(clubInfo.get(c)!.en)));
console.log(`  ${MLS_CLUBS.size} MLS clubs: ${[...MLS_CLUBS].map((c) => clubInfo.get(c)!.en).join(", ")}`);

function isNationalTeamName(en: string) {
  return /national .*team|national (football|soccer)/i.test(en);
}

// Continents of every nationality, for Africans / Asians / North Americans. Countries that are
// (also) in Europe count as European only (Turkey, Russia, the Kingdom of Denmark…).
const natIds = [...new Set([...[...raw.values()].flatMap((r) => [...r.nat]), ...COUNTRIES.flatMap((c) => c.qids)])];
const contRows: string[][] = [];
for (const [i, batch] of chunks(natIds, 800).entries()) {
  contRows.push(
    ...(await sparql(
      `continents-${i}`,
      `SELECT ?x ?c WHERE { VALUES ?country { ${values(batch)} } BIND(STRAFTER(STR(?country), "entity/") AS ?x)
        ?country wdt:P30 ?cc . BIND(STRAFTER(STR(?cc), "entity/") AS ?c) }`,
    )),
  );
}
const continentsOf = new Map<string, Set<string>>();
for (const [x, c] of contRows) {
  if (!continentsOf.has(x)) continentsOf.set(x, new Set());
  continentsOf.get(x)!.add(c);
}
const contByCountry: Record<string, number> = {};
for (const [x, set] of continentsOf) {
  if (set.has("Q46")) continue; // Europe
  let bits = 0;
  if (set.has("Q15")) bits |= CONT.AF;
  else if (set.has("Q48")) bits |= CONT.AS;
  if (set.has("Q49")) bits |= CONT.NA;
  if (bits) contByCountry[x] = bits;
}
console.log(`  ${Object.keys(contByCountry).length} countries outside Europe mapped to a continent`);

// --- 4. Position labels and a sanity check of the country table -----------------------------

const positionIds = [...new Set([...raw.values()].flatMap((r) => [...r.pos]))];
const posRows = await sparql(
  `positions-${MIN_SITELINKS}`,
  `SELECT ?x ?en WHERE { VALUES ?pos { ${values(positionIds)} } BIND(STRAFTER(STR(?pos), "entity/") AS ?x)
    ?pos rdfs:label ?en . FILTER(LANG(?en) = "en") }`,
);
const posBits = new Map<string, number>();
for (const [x, en] of posRows) posBits.set(x, (posBits.get(x) ?? 0) | positionBits(en));
const unknownPositions = posRows.filter(([x]) => !posBits.get(x)).map(([, en]) => en);
if (unknownPositions.length) console.log(`  positions without a group: ${unknownPositions.slice(0, 30).join(", ")}`);

const countryRows = await sparql(
  "countries",
  `SELECT ?x ?en WHERE { VALUES ?c { ${values(COUNTRIES.flatMap((c) => c.qids))} } BIND(STRAFTER(STR(?c), "entity/") AS ?x)
    ?c rdfs:label ?en . FILTER(LANG(?en) = "en") }`,
);
for (const [x, en] of countryRows) {
  const c = COUNTRIES[COUNTRY_BY_QID[x]];
  if (!c.en.some((n) => en.includes(n)) && !en.includes(c.en[0].split(" ")[0])) console.warn(`  check country ${c.key}: ${x} is "${en}"`);
}

// --- 5. Derived facts ---------------------------------------------------------------------

const UK = "Q145";
const UK_NATIONS: [RegExp, string][] = [
  [/northern ireland|northern irish/i, "Q26"],
  [/scotland|scottish/i, "Q22"],
  [/wales|welsh/i, "Q25"],
  [/england|english|london|manchester|liverpool|birmingham/i, "Q21"],
];
const YOUTH_RE = /under[- ]?\d|\bu-?\d\d\b|olympic|youth|amateur|\bB\b|\bC\b|futsal|beach|universi|military|reserve|junior|schoolboy|semi-pro|\bXI\b|league XI|select/i;
const NT_RE = /^(.*?) (men's |women's )?national (association )?(football|soccer) team/i;

function clubCountry(c: ClubInfo | undefined): number {
  if (!c) return -1;
  for (const q of c.countries) {
    if (q === UK) {
      for (const [re, nation] of UK_NATIONS) if (re.test(c.desc) || re.test(c.en)) return COUNTRY_BY_QID[nation];
      continue;
    }
    if (COUNTRY_BY_QID[q] !== undefined) return COUNTRY_BY_QID[q];
  }
  return -1;
}

function isNationalTeam(c: ClubInfo | undefined): boolean {
  if (!c) return false;
  return c.nt || /national .*team|national (football|soccer)/i.test(c.en);
}

/** Senior national team → country index (or -1). */
function nationalTeamCountry(c: ClubInfo): number {
  if (YOUTH_RE.test(c.en)) return -1;
  const m = NT_RE.exec(c.en);
  if (!m) return -1;
  const name = m[1].trim();
  const idx = COUNTRIES.findIndex((k) => k.en.includes(name));
  return idx;
}

function isSeniorNationalTeam(c: ClubInfo): boolean {
  return !YOUTH_RE.test(c.en) && NT_RE.test(c.en);
}

// Resolve the curated clubs: among clubs whose English label contains the text (and in the right
// country), the one with most players in the database.
const clubPlayers = new Map<string, number>();
for (const r of raw.values()) for (const c of new Set(r.teams.map((t) => t.club))) clubPlayers.set(c, (clubPlayers.get(c) ?? 0) + 1);
const dbClubs: DbClub[] = [];
const curatedIdx = new Map<string, number>();
for (const spec of CLUBS) {
  const needle = fold(spec.match);
  let best: string | null = null;
  for (const [q, info] of clubInfo) {
    if (isNationalTeam(info)) continue;
    if (!fold(info.en).includes(needle)) continue;
    if (spec.country && clubCountry(info) !== COUNTRY_INDEX[spec.country]) continue;
    if (!best || (clubPlayers.get(q) ?? 0) > (clubPlayers.get(best) ?? 0)) best = q;
  }
  if (!best) {
    console.warn(`  club not found: ${spec.key} (${spec.match})`);
    continue;
  }
  const info = clubInfo.get(best)!;
  console.log(`  ${spec.key.padEnd(14)} → ${best.padEnd(10)} ${info.en} (${clubPlayers.get(best)} players)`);
  curatedIdx.set(best, dbClubs.length);
  dbClubs.push({ q: best, key: spec.key, name: spec.name, prep: spec.prep, country: clubCountry(info) });
}

// Family name first: the Koreas, China, Taiwan (and Chinese Taipei, the old Republic) and Vietnam.
const EAST_ASIAN = new Set(["Q884", "Q423", "Q148", "Q865", "Q216923", "Q13426199", "Q881"]);

interface Built {
  q: string;
  name: string;
  alt: string[];
  aliases: string[];
  familyFirst: boolean;
  sl: number;
  facts: PlayerFacts;
  img: string;
}

const built: Built[] = [];
let capsKnown = 0;
for (const q of qids) {
  const r = raw.get(q)!;
  const labels = r.labels.map(cleanLabel).filter((l) => l && !/^Q\d+$/.test(l));
  if (!labels.length) continue;
  const name = labels[0];
  const nameKey = fold(name);
  const alt = labels.slice(1).filter((l, i, a) => fold(l) !== nameKey && a.findIndex((x) => fold(x) === fold(l)) === i);
  const seen = new Set([nameKey, ...alt.map(fold)]);
  const aliases: string[] = [];
  for (const a of r.aliases.map(cleanLabel)) {
    const k = fold(a);
    if (!k || seen.has(k) || words(k).length > 6 || k.length > 48) continue;
    seen.add(k);
    aliases.push(a);
  }
  // Korean/Chinese names: the family name comes first ("Son Heung-min" → "Son"). Not for players
  // with another nationality too: the naturalised ones keep their own order ("Jens Castrop").
  const familyFirst = r.nat.size > 0 && [...r.nat].every((n) => EAST_ASIAN.has(n));

  const nats = new Set<number>();
  for (const n of r.nat) if (COUNTRY_BY_QID[n] !== undefined) nats.add(COUNTRY_BY_QID[n]);
  let cont = 0;
  for (const n of r.nat) cont |= contByCountry[n] ?? 0;
  let mls = false;
  let caps = 0;
  let hasSenior = false;
  let capsSeen = false;
  const played = new Set<number>();
  const stints: PlayerFacts["stints"] = [];
  for (const t of r.teams) {
    const info = clubInfo.get(t.club);
    if (isNationalTeam(info)) {
      if (info && isSeniorNationalTeam(info)) {
        hasSenior = true;
        const c = nationalTeamCountry(info);
        if (c >= 0) nats.add(c);
        if (t.apps !== null && !isNaN(t.apps)) {
          caps += t.apps;
          capsSeen = true;
        }
      }
      continue;
    }
    const country = clubCountry(info);
    if (country >= 0) played.add(country);
    if (MLS_CLUBS.has(t.club)) mls = true;
    const idx = curatedIdx.get(t.club);
    if (idx !== undefined) stints.push({ club: idx, country: dbClubs[idx].country, start: t.start, end: t.end });
  }
  if (hasSenior && !capsSeen) caps = -1;
  // The country of a senior national team played for counts too.
  for (const c of nats) for (const q of COUNTRIES[c].qids) cont |= contByCountry[q] ?? 0;
  if (capsSeen) capsKnown++;
  for (const c of played) stints.push({ club: -1, country: c, start: 0, end: 0 });
  let pos = 0;
  for (const p of r.pos) pos |= posBits.get(p) ?? 0;
  built.push({
    q,
    name,
    alt,
    aliases,
    familyFirst,
    sl: sitelinks.get(q)!,
    facts: { nats: [...nats], pos, caps, by: r.by, stints, cont, coach: r.coach, mls },
    img: r.img,
  });
}
console.log(`${built.length} players with a label, ${capsKnown} with known caps`);

// --- 6. Categories ----------------------------------------------------------------------

const notable = built.filter((b) => b.sl >= NOTABLE);
const clubRefs: ClubRef[] = dbClubs;
const categories: Category[] = [];
function consider(id: string, family: Family, prompt: Prompt, min: number) {
  const answers = notable.filter((b) => satisfies(b.facts, prompt)).length;
  if (answers < min) {
    console.log(`  skip ${id}: ${answers}`);
    return;
  }
  categories.push({ id, family, prompt, ...promptTitle(prompt, clubRefs), short: shortTitle(prompt, clubRefs), answers });
}

// Letters: first or last word of the name.
for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
  const l = letter.toLowerCase();
  const answers = notable.filter((b) => {
    const w = words(fold(b.name));
    return w.length && (w[0][0] === l || w[w.length - 1][0] === l);
  }).length;
  if (answers < MIN_ANSWERS_LETTER) {
    console.log(`  skip letter ${letter}: ${answers}`);
    continue;
  }
  categories.push({ id: `letter:${letter}`, family: "letter", prompt: { kind: "letter", letter }, ...promptTitle({ kind: "letter", letter }, clubRefs), short: same(letter), answers });
}

const roundsOf = (key: string) => CLUB_SPECS.find((c) => c.key === key)?.rounds ?? [];
dbClubs.forEach((c, club) => {
  if (roundsOf(c.key).includes("club")) consider(`club:${c.key}`, "club", { kind: "club", club }, MIN_ANSWERS);
});
dbClubs.forEach((c, club) => {
  if (!roundsOf(c.key).includes("period")) return;
  for (const [from, to] of [[1990, 2000], [2000, 2010], [2010, 2020]])
    consider(`period:${c.key}:${from}`, "period", { kind: "clubPeriod", club, from, to }, MIN_ANSWERS_COMBO);
});
dbClubs.forEach((c, club) => {
  if (!roundsOf(c.key).includes("position")) return;
  // No goalkeepers here: too few of them per club.
  for (const pos of ["DF", "MF", "FW"] as PosKey[])
    consider(`posclub:${pos}:${c.key}`, "position", { kind: "positionClub", pos, club }, MIN_ANSWERS_COMBO);
});
for (const k of NATIONALITIES) consider(`nat:${k}`, "country", { kind: "nationality", country: COUNTRY_INDEX[k] }, MIN_ANSWERS);
for (const cont of Object.keys(CONT) as ContKey[]) consider(`cont:${cont}`, "country", { kind: "continent", cont }, MIN_ANSWERS);
for (const k of PLAYED_IN_SINGLE) consider(`in:${k}`, "country", { kind: "playedIn", countries: [COUNTRY_INDEX[k]] }, MIN_ANSWERS);
for (const [a, b] of PLAYED_IN_PAIRS)
  consider(`in:${a}+${b}`, "country", { kind: "playedIn", countries: [COUNTRY_INDEX[a], COUNTRY_INDEX[b]] }, MIN_ANSWERS_COMBO);
consider("caps:lt10", "national", { kind: "caps", op: "lt", n: 10 }, MIN_ANSWERS);
consider("caps:gt50", "national", { kind: "caps", op: "gt", n: 50 }, MIN_ANSWERS);
for (const pos of Object.keys(POS) as PosKey[]) consider(`pos:${pos}`, "position", { kind: "position", pos }, MIN_ANSWERS);
for (let from = 1970; from <= 2000; from += 10) consider(`decade:${from}`, "decade", { kind: "decade", from }, MIN_ANSWERS);
consider("career:coach", "career", { kind: "coach" }, MIN_ANSWERS);
consider("career:mls", "career", { kind: "mls" }, MIN_ANSWERS);
consider("career:arabia", "career", { kind: "arabia" }, MIN_ANSWERS);

const byFamily = new Map<string, number>();
for (const c of categories) byFamily.set(c.family, (byFamily.get(c.family) ?? 0) + 1);
console.log(`${categories.length} prompts: ${[...byFamily].map(([f, n]) => `${f} ${n}`).join(", ")}`);

// --- 7. Output ------------------------------------------------------------------------------

const db: DbFile = {
  v: 1,
  builtAt: new Date().toISOString().slice(0, 10),
  clubs: dbClubs,
  categories,
  q: built.map((b) => Number(b.q.slice(1))),
  name: built.map((b) => b.name),
  alt: built.map((b) => b.alt.join("|")),
  al: built.map((b) => b.aliases.join("|")),
  sl: built.map((b) => b.sl),
  by: built.map((b) => b.facts.by),
  pos: built.map((b) => b.facts.pos),
  caps: built.map((b) => b.facts.caps),
  nat: built.map((b) => encodeCountries(b.facts.nats)),
  cc: built.map((b) => encodeCountries(b.facts.stints.filter((s) => s.club < 0).map((s) => s.country))),
  cs: built.map((b) => {
    const cur = b.facts.stints.filter((s) => s.club >= 0);
    return cur.length ? cur.flatMap((s) => [s.club, s.start, s.end]) : 0;
  }),
  img: built.map((b) => b.img),
  cont: built.map((b) => b.facts.cont),
  flags: built.map((b) => (b.facts.coach ? FLAG_COACH : 0) | (b.facts.mls ? FLAG_MLS : 0) | (b.familyFirst ? FLAG_FAMILY_FIRST : 0)),
  contByCountry,
  mlsClubs: [...MLS_CLUBS],
};
const json = JSON.stringify(db);
const gz = gzipSync(json, { level: 9 });
writeFileSync(OUT, gz);
console.log(`Wrote ${OUT.pathname}: ${(json.length / 1e6).toFixed(1)} MB JSON, ${(gz.length / 1e6).toFixed(1)} MB gzip`);
