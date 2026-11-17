// Wikidata lookups: footballer search (autocomplete) and fact gathering for hints.

import type { ClubFact, Facts } from "./facts.ts";

const API = "https://www.wikidata.org/w/api.php";
const UA = "Footstop/1.0 (https://footstop.bacoinz.workers.dev; football party game)";
const HOME_NATIONS = new Set(["Q21", "Q22", "Q25", "Q26"]);
const NOT_PLAYER_RE =
  /(^|[^a-zà-ú])(club|clube|team|equipa|seleção|stadium|estádio|season|temporada|rivalidade|rivalry|derby|dérbi|clássico|match|jogo|final|award|prémio|statue|estátua|film|filme|documentário|documentary|album|álbum|song|canção|book|livro|mural|museum|museu|family|família)($|[^a-zà-ú])/i;
const FOOTBALL_RE =/futebol|football|soccer|guarda-redes|goalkeeper|futbolista|fußball|calcio/i;

export interface SearchHit {
  qid: string;
  label: string;
  description?: string;
  /** Small photo thumbnail (from the item's image, P18). */
  image?: string;
}

async function getJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": UA, Accept: "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Wikidata ${res.status}`);
  return res.json();
}

// Per-isolate memo so repeated lookups don't hit Wikidata's rate limits.
const memo = new Map<string, { at: number; value: Promise<unknown> }>();
function remember<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.value as Promise<T>;
  const value = fn();
  memo.set(key, { at: Date.now(), value });
  // Forget failures and empty results: they may be transient (rate limits).
  value.then((v) => (Array.isArray(v) && !v.length) || v == null ? memo.delete(key) : undefined, () => memo.delete(key));
  if (memo.size > 500) memo.delete(memo.keys().next().value!);
  return value;
}

export function searchFootballers(q: string, withImages = true): Promise<SearchHit[]> {
  return remember(`s:${withImages ? "i" : "n"}:${q.toLowerCase()}`, () => searchUncached(q, withImages));
}

export function getFacts(qid: string): Promise<Facts | null> {
  return remember(`f:${qid}`, () => getFactsUncached(qid));
}

async function searchUncached(q: string, withImages: boolean): Promise<SearchHit[]> {
  // Two searches in parallel: full-text by occupation (finds surnames and middle names, e.g.
  // "Maldini" → Paolo Maldini) and label-prefix (best while typing a first name).
  const [text, prefix] = await Promise.allSettled([searchByOccupation(q), searchByPrefix(q)]);
  // Both failing (e.g. Wikidata rate limit) is an error, not "no results", so it isn't cached.
  if (text.status === "rejected" && prefix.status === "rejected") throw text.reason;
  const byText = text.status === "fulfilled" ? text.value : [];
  const byPrefix = prefix.status === "fulfilled" ? prefix.value : [];
  const unique: SearchHit[] = [];
  for (const h of [...byText, ...byPrefix]) if (!unique.some((x) => x.qid === h.qid)) unique.push(h);
  // An exact name match goes first (e.g. "Pepe"); otherwise keep the search's relevance order.
  const nq = fold(q);
  const hits = unique
    .map((h, i) => ({ h, i }))
    .sort((a, b) => Number(fold(b.h.label) === nq) - Number(fold(a.h.label) === nq) || a.i - b.i)
    .map((x) => x.h)
    .slice(0, 8);
  if (!withImages) return hits;
  // Full-text hits already carry photos; fetch the rest in one request (failure = no photos).
  const missing = hits.filter((h) => !h.image).map((h) => h.qid);
  const images = await thumbnails(missing).catch(() => ({}) as Record<string, string>);
  return hits.map((h) => (images[h.qid] ? { ...h, image: images[h.qid] } : h));
}

/** One request for the photo thumbnails of several items (Wikidata's page image is the P18 image). */
async function thumbnails(qids: string[]): Promise<Record<string, string>> {
  if (!qids.length) return {};
  const params = new URLSearchParams({
    action: "query",
    titles: qids.join("|"),
    prop: "pageimages",
    pithumbsize: "96",
    format: "json",
    formatversion: "2",
  });
  const data = await getJson(`${API}?${params}`);
  const out: Record<string, string> = {};
  for (const page of data.query?.pages ?? []) {
    const src: string | undefined = page.thumbnail?.source;
    if (src) out[page.title] = src.split("?")[0];
  }
  return out;
}

function fold(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

async function searchByPrefix(q: string): Promise<SearchHit[]> {
  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: q,
    language: "en",
    uselang: "pt",
    type: "item",
    limit: "25",
    format: "json",
  });
  const data = await getJson(`${API}?${params}`);
  const hits: SearchHit[] = [];
  for (const r of data.search ?? []) {
    const description: string | undefined = r.description;
    if (!description || !FOOTBALL_RE.test(description)) continue;
    if (NOT_PLAYER_RE.test(description)) continue;
    hits.push({ qid: r.id, label: r.label ?? r.display?.label?.value ?? q, description });
    if (hits.length >= 8) break;
  }
  return hits;
}

const FOOTBALLER = "Q937857"; // occupation: association football player
const COACH = "Q628099"; // occupation: association football manager

/** Words from the query, the last one as a prefix ("Maldin" → "Maldin*") so it works while typing. */
function textQuery(q: string): string {
  const words = q.replace(/[^\p{L}\p{N}' -]/gu, " ").split(/\s+/).filter(Boolean);
  const last = words.pop();
  if (last) words.push(last.length >= 3 ? `${last}*` : last);
  return words.join(" ");
}

async function searchByOccupation(q: string): Promise<SearchHit[]> {
  // One request: ranked search + labels/descriptions (entityterms) + photos (pageimages).
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `${textQuery(q)} haswbstatement:P106=${FOOTBALLER}|P106=${COACH}`,
    gsrlimit: "8",
    gsrnamespace: "0",
    prop: "pageimages|entityterms",
    piprop: "thumbnail",
    pithumbsize: "96",
    wbetterms: "label|description",
    wbetlanguage: "pt",
    format: "json",
    formatversion: "2",
  });
  const data = await getJson(`${API}?${params}`);
  const pages = ((data.query?.pages ?? []) as any[])
    .filter((p) => /^Q\d+$/.test(p.title))
    .sort((a, b) => a.index - b.index);
  // entityterms is sometimes cut short (continuation) or missing a Portuguese label: fill those in.
  const missing = pages.filter((p) => !p.entityterms?.label?.[0]).map((p) => p.title as string);
  const ents = missing.length ? await getEntities(missing, "labels|descriptions").catch(() => ({})) : {};
  return pages
    .map((p) => {
      const ent = (ents as Record<string, any>)[p.title];
      return {
        qid: p.title as string,
        label: p.entityterms?.label?.[0] ?? (ent ? label(ent) : ""),
        description:
          p.entityterms?.description?.[0] ??
          ent?.descriptions?.pt?.value ??
          ent?.descriptions?.en?.value ??
          "futebolista",
        image: p.thumbnail?.source?.split("?")[0] as string | undefined,
      };
    })
    .filter((h) => h.label && !/^Q\d+$/.test(h.label) && !NOT_PLAYER_RE.test(h.description));
}

function claimIds(claims: any, prop: string): string[] {
  return (claims?.[prop] ?? [])
    .map((c: any) => c.mainsnak?.datavalue?.value?.id)
    .filter(Boolean);
}

function claimString(claims: any, prop: string): string | undefined {
  const v = claims?.[prop]?.[0]?.mainsnak?.datavalue?.value;
  return typeof v === "string" && /^[\w-]+$/.test(v) ? v : undefined;
}

function wikipediaUrl(sitelinks: any): string | undefined {
  const link = sitelinks?.enwiki ?? sitelinks?.ptwiki;
  if (!link?.title) return undefined;
  const lang = link.site === "enwiki" ? "en" : "pt";
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(link.title).replace(/ /g, "_"))}`;
}

function claimTime(claims: any, prop: string): string | undefined {
  const t: string | undefined = claims?.[prop]?.[0]?.mainsnak?.datavalue?.value?.time;
  return t ? toIso(t) : undefined;
}

function toIso(t: string): string {
  // "+1985-02-05T00:00:00Z" → "1985-02-05"; month/day 00 when precision is year.
  const m = /^[+-]?(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (!m) return t;
  return `${m[1]}-${m[2] === "00" ? "01" : m[2]}-${m[3] === "00" ? "01" : m[3]}`;
}

function qualTime(stmt: any, prop: string): string | undefined {
  const t = stmt.qualifiers?.[prop]?.[0]?.datavalue?.value?.time;
  return t ? toIso(t) : undefined;
}

function label(entity: any): string {
  return entity?.labels?.pt?.value ?? entity?.labels?.en?.value ?? entity?.id ?? "";
}

async function getEntities(ids: string[], props: string, languages = "pt|en"): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const params = new URLSearchParams({
      action: "wbgetentities",
      ids: ids.slice(i, i + 50).join("|"),
      props,
      languages,
      format: "json",
    });
    if (props.includes("sitelinks")) params.set("sitefilter", "enwiki|ptwiki");
    const data = await getJson(`${API}?${params}`);
    Object.assign(out, data.entities ?? {});
  }
  return out;
}

const CITY_TEXT: [RegExp, string][] = [
  [/\blondon\b|\blondres\b/, "Q84"],
  [/\bmanchester\b/, "Q18125"],
  [/\blisbon\b|\blisboa\b/, "Q597"],
  [/\bmadrid\b/, "Q2807"],
  [/\bseville\b|\bsevilla\b|\bsevilha\b/, "Q8717"],
  [/\bmilan\b|\bmilano\b|\bmilão\b/, "Q490"],
  [/\brome\b|\broma\b/, "Q220"],
  [/\bs[ãa]o paulo\b/, "Q174"],
  [/\brio de janeiro\b/, "Q8678"],
];

// Regions named after a city (e.g. "Greater Manchester", "Community of Madrid") must not count as the city.
const REGION_RE =
  /greater manchester|(community|comunidad|comunidade|province|provincia|província|metropolitan city|città metropolitana|state|estado|region) (of|de|do|di) [a-zãáéíóúç ]+|[a-zãáéíóúç ]+ (state|province)\b/g;

const UK_NATIONS: [RegExp, string][] = [
  [/england|english|inglaterra|inglês/, "Q21"],
  [/scotland|scottish|escócia|escocês/, "Q22"],
  [/wales|welsh|país de gales|galês/, "Q25"],
  [/northern ireland|irlanda do norte/, "Q26"],
];

/** Where a club is: its "located in"/HQ/country claims plus place names in its descriptions. */
function clubPlaces(ent: any): string[] {
  const claims = ent?.claims;
  const places = new Set([...claimIds(claims, "P131"), ...claimIds(claims, "P159"), ...claimIds(claims, "P17")]);
  const text = [ent?.descriptions?.en?.value, ent?.descriptions?.pt?.value]
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();
  const cityText = text.replace(REGION_RE, " ");
  for (const [re, qid] of CITY_TEXT) if (re.test(cityText)) places.add(qid);
  if (places.has("Q145")) for (const [re, qid] of UK_NATIONS) if (re.test(text)) places.add(qid);
  if (places.has("Q18125") || places.has("Q84")) places.add("Q21");
  return [...places];
}

async function getFactsUncached(qid: string): Promise<Facts | null> {
  if (!/^Q\d+$/.test(qid)) return null;
  const main = (await getEntities([qid], "labels|descriptions|claims|sitelinks"))[qid];
  if (!main || main.missing !== undefined) return null;
  const claims = main.claims ?? {};

  const teamStmts: any[] = claims.P54 ?? [];
  const clubIds = [...new Set(teamStmts.map((s) => s.mainsnak?.datavalue?.value?.id).filter(Boolean))] as string[];
  const positionIds = claimIds(claims, "P413");

  const related = await getEntities([...clubIds, ...positionIds], "labels|descriptions|claims", "en|pt");

  const clubs: ClubFact[] = teamStmts
    .map((s): ClubFact | null => {
      const id = s.mainsnak?.datavalue?.value?.id;
      if (!id) return null;
      const ent = related[id];
      const enLabel: string = ent?.labels?.en?.value ?? "";
      const national =
        /national|olympic/i.test(enLabel) || claimIds(ent?.claims, "P31").includes("Q6979593");
      const locs = clubPlaces(ent);
      const home = locs.find((l) => HOME_NATIONS.has(l));
      const numbers = (s.qualifiers?.P1618 ?? [])
        .map((q: any) => parseInt(q.datavalue?.value, 10))
        .filter((n: number) => !isNaN(n));
      return {
        qid: id,
        label: label(ent) || id,
        national,
        start: qualTime(s, "P580"),
        end: qualTime(s, "P582"),
        numbers,
        locations: locs,
        country: home ?? claimIds(ent?.claims, "P17")[0],
      };
    })
    .filter((c): c is ClubFact => !!c);

  const image: string | undefined = claims.P18?.[0]?.mainsnak?.datavalue?.value;

  return {
    qid,
    label: label(main),
    description: main.descriptions?.pt?.value ?? main.descriptions?.en?.value,
    image: image
      ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image)}?width=240`
      : undefined,
    birth: claimTime(claims, "P569"),
    death: claimTime(claims, "P570"),
    nationalities: [
      ...new Set([
        ...claimIds(claims, "P1532"),
        ...claimIds(claims, "P27"),
        // Senior national teams represented (e.g. England rather than UK).
        ...clubs.filter((c) => c.national && c.country).map((c) => c.country!),
      ]),
    ],
    positions: positionIds.map((id) => related[id]?.labels?.en?.value ?? "").filter(Boolean),
    occupations: claimIds(claims, "P106"),
    clubs,
    transfermarktId: claimString(claims, "P2446"),
    zerozeroId: claimString(claims, "P3047"),
    wikipediaUrl: wikipediaUrl(main.sitelinks),
  };
}
