// Facts fetched live from Wikidata (for names missing from the database), in the shape the
// category rules understand.

import { COUNTRY_BY_QID, positionBits, type PlayerFacts } from "../shared/categories.ts";
import type { PlayerDb } from "../shared/db.ts";

export interface ClubFact {
  qid: string;
  label: string;
  national: boolean;
  start?: string;
  end?: string;
  numbers: number[];
  /** Every location QID the club sits in (city, region, country…). */
  locations: string[];
  /** Best country-level QID (England/Scotland take precedence over UK). */
  country?: string;
}

export interface Facts {
  qid: string;
  label: string;
  description?: string;
  image?: string;
  birth?: string;
  death?: string;
  nationalities: string[];
  positions: string[];
  /** Occupation items (P106), to spot managers. */
  occupations?: string[];
  clubs: ClubFact[];
  transfermarktId?: string;
  zerozeroId?: string;
  wikipediaUrl?: string;
}

const year = (iso?: string) => (iso ? Number(iso.slice(0, 4)) || 0 : 0);

export function toPlayerFacts(f: Facts, db: PlayerDb): PlayerFacts {
  const stints: PlayerFacts["stints"] = [];
  const mlsClubs = new Set(db.file.mlsClubs ?? []);
  let mls = false;
  let senior = false;
  for (const c of f.clubs) {
    if (c.national) {
      if (!/under|u-?\d\d|olympic|youth|\bB\b/i.test(c.label)) senior = true;
      continue;
    }
    if (mlsClubs.has(c.qid)) mls = true;
    const country = c.country ? (COUNTRY_BY_QID[c.country] ?? -1) : -1;
    const club = db.clubByQid.get(c.qid) ?? -1;
    stints.push({ club, country: club >= 0 ? db.file.clubs[club].country : country, start: year(c.start), end: year(c.end) });
  }
  const nats = [...new Set(f.nationalities.map((q) => COUNTRY_BY_QID[q]).filter((i) => i !== undefined))];
  let pos = 0;
  for (const p of f.positions) pos |= positionBits(p);
  let cont = 0;
  for (const q of f.nationalities) cont |= db.file.contByCountry?.[q] ?? 0;
  const coach = (f.occupations ?? []).includes("Q628099");
  return { nats, pos, caps: senior ? -1 : 0, by: year(f.birth), stints, cont, coach, mls };
}
