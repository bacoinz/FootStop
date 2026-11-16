// Round prompts (letters and categories) and the rules that decide whether a player fits one.
// Shared by the data build (to count possible answers), the server (to check answers) and tests.

import { both, type Lang, type Text } from "./i18n.ts";

export const POS = { GK: 1, DF: 2, MF: 4, FW: 8 } as const;
export type PosKey = keyof typeof POS;

export const POS_NAMES: Record<Lang, Record<PosKey, { one: string; many: string }>> = {
  pt: {
    GK: { one: "guarda-redes", many: "Guarda-redes" },
    DF: { one: "defesa", many: "Defesas" },
    MF: { one: "médio", many: "Médios" },
    FW: { one: "avançado", many: "Avançados" },
  },
  en: {
    GK: { one: "a goalkeeper", many: "Goalkeepers" },
    DF: { one: "a defender", many: "Defenders" },
    MF: { one: "a midfielder", many: "Midfielders" },
    FW: { one: "a forward", many: "Forwards" },
  },
};

export interface Country {
  key: string;
  /** Wikidata items that count as this country (e.g. West Germany for Germany). */
  qids: string[];
  name: string;
  /** "Jogou em Itália", "Jogou na Alemanha", "Jogou nos EUA". */
  in: "em" | "no" | "na" | "nos";
  /** Plural demonym for nationality rounds ("Brasileiros"). */
  many: string;
  /** Singular demonym for messages ("não é brasileiro"). */
  one: string;
  /** English name as used in "<name> national football team" (the first one is shown). */
  en: string[];
  /** English demonyms, for nationality rounds ("Brazilians", "not Brazilian"). */
  enMany?: string;
  enOne?: string;
  flag: string;
}

export const COUNTRIES: Country[] = [
  { key: "PT", qids: ["Q45"], name: "Portugal", in: "em", many: "Portugueses", one: "português", en: ["Portugal"], flag: "pt", enMany: "Portuguese", enOne: "Portuguese" },
  { key: "BR", qids: ["Q155"], name: "Brasil", in: "no", many: "Brasileiros", one: "brasileiro", en: ["Brazil"], flag: "br", enMany: "Brazilians", enOne: "Brazilian" },
  { key: "ES", qids: ["Q29"], name: "Espanha", in: "em", many: "Espanhóis", one: "espanhol", en: ["Spain"], flag: "es", enMany: "Spaniards", enOne: "Spanish" },
  { key: "FR", qids: ["Q142"], name: "França", in: "em", many: "Franceses", one: "francês", en: ["France"], flag: "fr", enMany: "French", enOne: "French" },
  { key: "EN", qids: ["Q21"], name: "Inglaterra", in: "em", many: "Ingleses", one: "inglês", en: ["England"], flag: "gb-eng", enMany: "English", enOne: "English" },
  { key: "DE", qids: ["Q183", "Q713750"], name: "Alemanha", in: "na", many: "Alemães", one: "alemão", en: ["Germany", "West Germany"], flag: "de", enMany: "Germans", enOne: "German" },
  { key: "IT", qids: ["Q38"], name: "Itália", in: "em", many: "Italianos", one: "italiano", en: ["Italy"], flag: "it", enMany: "Italians", enOne: "Italian" },
  { key: "AR", qids: ["Q414"], name: "Argentina", in: "na", many: "Argentinos", one: "argentino", en: ["Argentina"], flag: "ar", enMany: "Argentines", enOne: "Argentine" },
  { key: "NL", qids: ["Q55", "Q29999"], name: "Países Baixos", in: "nos", many: "Neerlandeses", one: "neerlandês", en: ["Netherlands"], flag: "nl", enMany: "Dutch", enOne: "Dutch" },
  { key: "BE", qids: ["Q31"], name: "Bélgica", in: "na", many: "Belgas", one: "belga", en: ["Belgium"], flag: "be", enMany: "Belgians", enOne: "Belgian" },
  { key: "UY", qids: ["Q77"], name: "Uruguai", in: "no", many: "Uruguaios", one: "uruguaio", en: ["Uruguay"], flag: "uy", enMany: "Uruguayans", enOne: "Uruguayan" },
  { key: "HR", qids: ["Q224"], name: "Croácia", in: "na", many: "Croatas", one: "croata", en: ["Croatia"], flag: "hr", enMany: "Croatians", enOne: "Croatian" },
  { key: "CO", qids: ["Q739"], name: "Colômbia", in: "na", many: "Colombianos", one: "colombiano", en: ["Colombia"], flag: "co", enMany: "Colombians", enOne: "Colombian" },
  { key: "CL", qids: ["Q298"], name: "Chile", in: "no", many: "Chilenos", one: "chileno", en: ["Chile"], flag: "cl" },
  { key: "PY", qids: ["Q733"], name: "Paraguai", in: "no", many: "Paraguaios", one: "paraguaio", en: ["Paraguay"], flag: "py" },
  { key: "MX", qids: ["Q96"], name: "México", in: "no", many: "Mexicanos", one: "mexicano", en: ["Mexico"], flag: "mx", enMany: "Mexicans", enOne: "Mexican" },
  { key: "US", qids: ["Q30"], name: "EUA", in: "nos", many: "Norte-americanos", one: "norte-americano", en: ["United States"], flag: "us" },
  { key: "NG", qids: ["Q1033"], name: "Nigéria", in: "na", many: "Nigerianos", one: "nigeriano", en: ["Nigeria"], flag: "ng" },
  { key: "SN", qids: ["Q1041"], name: "Senegal", in: "no", many: "Senegaleses", one: "senegalês", en: ["Senegal"], flag: "sn" },
  { key: "CI", qids: ["Q1008"], name: "Costa do Marfim", in: "na", many: "Marfinenses", one: "marfinense", en: ["Ivory Coast"], flag: "ci" },
  { key: "CM", qids: ["Q1009"], name: "Camarões", in: "nos", many: "Camaroneses", one: "camaronês", en: ["Cameroon"], flag: "cm" },
  { key: "GH", qids: ["Q117"], name: "Gana", in: "no", many: "Ganeses", one: "ganês", en: ["Ghana"], flag: "gh" },
  { key: "MA", qids: ["Q1028"], name: "Marrocos", in: "em", many: "Marroquinos", one: "marroquino", en: ["Morocco"], flag: "ma" },
  { key: "DZ", qids: ["Q262"], name: "Argélia", in: "na", many: "Argelinos", one: "argelino", en: ["Algeria"], flag: "dz" },
  { key: "EG", qids: ["Q79"], name: "Egito", in: "no", many: "Egípcios", one: "egípcio", en: ["Egypt"], flag: "eg" },
  { key: "AO", qids: ["Q916"], name: "Angola", in: "em", many: "Angolanos", one: "angolano", en: ["Angola"], flag: "ao" },
  { key: "CV", qids: ["Q1011"], name: "Cabo Verde", in: "em", many: "Cabo-verdianos", one: "cabo-verdiano", en: ["Cape Verde"], flag: "cv" },
  { key: "DK", qids: ["Q35", "Q756617"], name: "Dinamarca", in: "na", many: "Dinamarqueses", one: "dinamarquês", en: ["Denmark"], flag: "dk", enMany: "Danes", enOne: "Danish" },
  { key: "SE", qids: ["Q34"], name: "Suécia", in: "na", many: "Suecos", one: "sueco", en: ["Sweden"], flag: "se", enMany: "Swedes", enOne: "Swedish" },
  { key: "NO", qids: ["Q20"], name: "Noruega", in: "na", many: "Noruegueses", one: "norueguês", en: ["Norway"], flag: "no", enMany: "Norwegians", enOne: "Norwegian" },
  { key: "SC", qids: ["Q22"], name: "Escócia", in: "na", many: "Escoceses", one: "escocês", en: ["Scotland"], flag: "gb-sct", enMany: "Scots", enOne: "Scottish" },
  { key: "WA", qids: ["Q25"], name: "País de Gales", in: "no", many: "Galeses", one: "galês", en: ["Wales"], flag: "gb-wls" },
  { key: "IE", qids: ["Q27"], name: "Irlanda", in: "na", many: "Irlandeses", one: "irlandês", en: ["Republic of Ireland", "Ireland"], flag: "ie" },
  { key: "CH", qids: ["Q39"], name: "Suíça", in: "na", many: "Suíços", one: "suíço", en: ["Switzerland"], flag: "ch" },
  { key: "AT", qids: ["Q40"], name: "Áustria", in: "na", many: "Austríacos", one: "austríaco", en: ["Austria"], flag: "at" },
  { key: "CZ", qids: ["Q213"], name: "Chéquia", in: "na", many: "Checos", one: "checo", en: ["Czech Republic", "Czechia"], flag: "cz" },
  { key: "PL", qids: ["Q36"], name: "Polónia", in: "na", many: "Polacos", one: "polaco", en: ["Poland"], flag: "pl", enMany: "Poles", enOne: "Polish" },
  { key: "RS", qids: ["Q403"], name: "Sérvia", in: "na", many: "Sérvios", one: "sérvio", en: ["Serbia"], flag: "rs" },
  { key: "RO", qids: ["Q218"], name: "Roménia", in: "na", many: "Romenos", one: "romeno", en: ["Romania"], flag: "ro" },
  { key: "HU", qids: ["Q28"], name: "Hungria", in: "na", many: "Húngaros", one: "húngaro", en: ["Hungary"], flag: "hu" },
  { key: "GR", qids: ["Q41"], name: "Grécia", in: "na", many: "Gregos", one: "grego", en: ["Greece"], flag: "gr", enMany: "Greeks", enOne: "Greek" },
  { key: "TR", qids: ["Q43"], name: "Turquia", in: "na", many: "Turcos", one: "turco", en: ["Turkey"], flag: "tr", enMany: "Turks", enOne: "Turkish" },
  { key: "RU", qids: ["Q159"], name: "Rússia", in: "na", many: "Russos", one: "russo", en: ["Russia"], flag: "ru" },
  { key: "UA", qids: ["Q212"], name: "Ucrânia", in: "na", many: "Ucranianos", one: "ucraniano", en: ["Ukraine"], flag: "ua" },
  { key: "JP", qids: ["Q17"], name: "Japão", in: "no", many: "Japoneses", one: "japonês", en: ["Japan"], flag: "jp" },
  { key: "KR", qids: ["Q884"], name: "Coreia do Sul", in: "na", many: "Sul-coreanos", one: "sul-coreano", en: ["South Korea"], flag: "kr" },
  { key: "AU", qids: ["Q408"], name: "Austrália", in: "na", many: "Australianos", one: "australiano", en: ["Australia"], flag: "au" },
  { key: "SA", qids: ["Q851"], name: "Arábia Saudita", in: "na", many: "Sauditas", one: "saudita", en: ["Saudi Arabia"], flag: "sa" },
  { key: "CA", qids: ["Q16"], name: "Canadá", in: "no", many: "Canadianos", one: "canadiano", en: ["Canada"], flag: "ca" },
  { key: "AE", qids: ["Q878"], name: "Emirados Árabes Unidos", in: "nos", many: "Emiratenses", one: "emiratense", en: ["United Arab Emirates"], flag: "ae" },
  { key: "QA", qids: ["Q846"], name: "Catar", in: "no", many: "Catarianos", one: "catariano", en: ["Qatar"], flag: "qa" },
  { key: "KW", qids: ["Q817"], name: "Kuwait", in: "no", many: "Kuwaitianos", one: "kuwaitiano", en: ["Kuwait"], flag: "kw" },
  { key: "BH", qids: ["Q398"], name: "Barém", in: "no", many: "Bareinitas", one: "bareinita", en: ["Bahrain"], flag: "bh" },
  { key: "OM", qids: ["Q842"], name: "Omã", in: "em", many: "Omanitas", one: "omanita", en: ["Oman"], flag: "om" },
];

export const COUNTRY_INDEX: Record<string, number> = Object.fromEntries(COUNTRIES.map((c, i) => [c.key, i]));
/** Wikidata country item → index in COUNTRIES. */
export const COUNTRY_BY_QID: Record<string, number> = Object.fromEntries(
  COUNTRIES.flatMap((c, i) => c.qids.map((q) => [q, i] as const)),
);

export interface ClubSpec {
  key: string;
  /** Text that the club's English Wikidata label contains; the club with most players wins. */
  match: string;
  /** Country key, to tell "Barcelona" (Spain) from "Barcelona SC" (Ecuador). */
  country?: string;
  name: string;
  /** "Jogou no Benfica", "Jogou na Juventus". */
  prep: "no" | "na";
  /** English name, when it differs ("Inter Milan"). */
  en?: string;
  /** Which rounds the club appears in: "Jogou no…", "…entre 2000 e 2010", "Avançados que jogaram no…". */
  rounds: ("club" | "period" | "position")[];
}

const ALL: ClubSpec["rounds"] = ["club", "period", "position"];

export const CLUBS: ClubSpec[] = [
  { key: "benfica", match: "Benfica", country: "PT", name: "Benfica", prep: "no", rounds: ALL },
  { key: "porto", match: "FC Porto", country: "PT", name: "FC Porto", prep: "no", rounds: ALL },
  { key: "sporting", match: "Sporting CP", country: "PT", name: "Sporting", prep: "no", rounds: ALL },
  { key: "realmadrid", match: "Real Madrid", country: "ES", name: "Real Madrid", prep: "no", rounds: ALL },
  { key: "barcelona", match: "FC Barcelona", country: "ES", name: "Barcelona", prep: "no", rounds: ALL },
  { key: "atletico", match: "Atlético Madrid", country: "ES", name: "Atlético de Madrid", en: "Atlético Madrid", prep: "no", rounds: ALL },
  { key: "manutd", match: "Manchester United", country: "EN", name: "Manchester United", prep: "no", rounds: ALL },
  { key: "mancity", match: "Manchester City", country: "EN", name: "Manchester City", prep: "no", rounds: ALL },
  { key: "liverpool", match: "Liverpool F.C.", country: "EN", name: "Liverpool", prep: "no", rounds: ALL },
  { key: "chelsea", match: "Chelsea F.C.", country: "EN", name: "Chelsea", prep: "no", rounds: ALL },
  { key: "arsenal", match: "Arsenal F.C.", country: "EN", name: "Arsenal", prep: "no", rounds: ALL },
  { key: "tottenham", match: "Tottenham Hotspur", country: "EN", name: "Tottenham", prep: "no", rounds: ALL },
  { key: "juventus", match: "Juventus", country: "IT", name: "Juventus", prep: "na", rounds: ALL },
  { key: "milan", match: "AC Milan", country: "IT", name: "AC Milan", prep: "no", rounds: ALL },
  { key: "inter", match: "Inter Milan", country: "IT", name: "Inter de Milão", en: "Inter Milan", prep: "no", rounds: ALL },
  { key: "roma", match: "AS Roma", country: "IT", name: "Roma", prep: "na", rounds: ALL },
  { key: "napoli", match: "Napoli", country: "IT", name: "Nápoles", en: "Napoli", prep: "no", rounds: ["club"] },
  { key: "fiorentina", match: "Fiorentina", country: "IT", name: "Fiorentina", prep: "na", rounds: ["club"] },
  { key: "bayern", match: "Bayern Munich", country: "DE", name: "Bayern de Munique", en: "Bayern Munich", prep: "no", rounds: ALL },
  { key: "dortmund", match: "Borussia Dortmund", country: "DE", name: "Borussia Dortmund", prep: "no", rounds: ["club"] },
  { key: "psg", match: "Paris Saint-Germain", country: "FR", name: "PSG", prep: "no", rounds: ALL },
  { key: "ajax", match: "Ajax", country: "NL", name: "Ajax", prep: "no", rounds: ["club"] },
];

/** Nationality rounds. */
export const NATIONALITIES = ["PT", "BR", "ES", "FR", "EN", "DE", "IT", "AR", "NL", "BE", "UY", "HR", "CO", "MX", "DK", "SE", "NO", "SC", "PL", "GR", "TR"];

/** Leagues are approximated by the country of the club, which Wikidata records reliably. */
export const PLAYED_IN_SINGLE = ["PT", "ES", "IT", "EN", "DE", "FR", "NL", "TR", "BR"];
export const PLAYED_IN_PAIRS: [string, string][] = [
  ["PT", "ES"], ["PT", "EN"], ["PT", "IT"], ["PT", "FR"], ["PT", "BR"], ["ES", "IT"], ["ES", "EN"],
  ["EN", "IT"], ["IT", "DE"], ["FR", "EN"], ["DE", "EN"], ["NL", "EN"], ["ES", "FR"], ["BR", "ES"],
];

/** "The Arabias": the Gulf leagues. */
export const GULF = ["SA", "AE", "QA", "KW", "BH", "OM"];
/** Leagues where players from these countries aren't foreigners (MLS: USA and Canada). */
export const MLS_HOME = ["US", "CA"];

/** Continents, as bits of PlayerFacts.cont. */
export const CONT = { AF: 1, AS: 2, NA: 4 } as const;
export type ContKey = keyof typeof CONT;
export const CONT_NAMES: Record<Lang, Record<ContKey, { many: string; one: string; sub: string }>> = {
  pt: {
    AF: { many: "Africanos", one: "africano", sub: "Nacionalidade de um país de África" },
    AS: { many: "Asiáticos", one: "asiático", sub: "Nacionalidade de um país da Ásia" },
    NA: { many: "Norte-americanos", one: "norte-americano", sub: "EUA, Canadá, México, América Central e Caraíbas" },
  },
  en: {
    AF: { many: "Africans", one: "African", sub: "Nationality of an African country" },
    AS: { many: "Asians", one: "Asian", sub: "Nationality of an Asian country" },
    NA: { many: "North Americans", one: "North American", sub: "USA, Canada, Mexico, Central America and the Caribbean" },
  },
};

// --- Prompts -----------------------------------------------------------------

export type Prompt =
  | { kind: "letter"; letter: string }
  | { kind: "club"; club: number }
  | { kind: "clubPeriod"; club: number; from: number; to: number }
  | { kind: "nationality"; country: number }
  | { kind: "playedIn"; countries: number[] }
  | { kind: "caps"; op: "lt" | "gt"; n: number }
  | { kind: "position"; pos: PosKey }
  | { kind: "decade"; from: number }
  | { kind: "positionClub"; pos: PosKey; club: number }
  | { kind: "continent"; cont: ContKey }
  /** Players who later became managers. */
  | { kind: "coach" }
  /** Foreign players who played in the MLS. */
  | { kind: "mls" }
  /** Foreign players who played in the Gulf ("nas Arábias"). */
  | { kind: "arabia" };

export type Family = "letter" | "club" | "period" | "country" | "national" | "position" | "decade" | "career";

/** A prompt ready to be drawn: what the wheel shows and how many answers it has. */
export interface Category {
  id: string;
  family: Family;
  prompt: Prompt;
  title: Text;
  subtitle?: Text;
  flag?: string;
  /** Short label for a slice of the wheel ("Benfica", "Anos 80", "M"). */
  short?: Text;
  /** Possible answers among well-known players (sitelinks ≥ NOTABLE). */
  answers: number;
}

/** Clubs referenced by prompts, as stored in the database. */
export interface ClubRef {
  /** CLUBS key, for the English name. */
  key?: string;
  name: string;
  prep: "no" | "na";
}

/** Everything a prompt needs to know about a player. */
export interface PlayerFacts {
  /** Country indices (COUNTRIES) of the player's nationalities. */
  nats: number[];
  /** Position bitmask (POS); 0 = unknown. */
  pos: number;
  /** Senior national team caps; -1 = played for a national team but the count is unknown. */
  caps: number;
  /** Birth year; 0 = unknown. */
  by: number;
  /** Club spells. `country` is the COUNTRIES index of the club (-1 unknown); years 0 = unknown. */
  stints: { club: number; country: number; start: number; end: number }[];
  /** Continents of the player's nationalities (CONT bits). */
  cont: number;
  /** Became a manager. */
  coach: boolean;
  /** Played for an MLS club. */
  mls: boolean;
}

const idx = (keys: string[]) => keys.map((k) => COUNTRY_INDEX[k]);
const GULF_IDX = idx(GULF);
const MLS_HOME_IDX = idx(MLS_HOME);

export const CURRENT_YEAR = 2026;

function inPeriod(s: { start: number; end: number }, from: number, to: number): boolean {
  // Missing dates: benefit of the doubt.
  if (!s.start && !s.end) return true;
  const start = s.start || -Infinity;
  const end = s.end || (s.start ? Math.max(s.start, CURRENT_YEAR) : Infinity);
  return start <= to && end >= from;
}

export function playedFor(f: PlayerFacts, club: number): boolean {
  return f.stints.some((s) => s.club === club);
}

/** Does the player fit the category? (Letters are checked on the typed text, see match.ts.) */
export function satisfies(f: PlayerFacts, p: Prompt): boolean {
  switch (p.kind) {
    case "letter":
      return true;
    case "club":
      return playedFor(f, p.club);
    case "clubPeriod":
      return f.stints.some((s) => s.club === p.club && inPeriod(s, p.from, p.to));
    case "nationality":
      return f.nats.includes(p.country);
    case "playedIn":
      return p.countries.every((c) => f.stints.some((s) => s.country === c));
    case "caps":
      if (p.op === "lt") return f.caps < 0 || f.caps < p.n;
      return f.caps > p.n;
    case "position":
      return (f.pos & POS[p.pos]) !== 0;
    case "decade":
      return f.by >= p.from && f.by < p.from + 10;
    case "positionClub":
      return (f.pos & POS[p.pos]) !== 0 && playedFor(f, p.club);
    case "continent":
      return (f.cont & CONT[p.cont]) !== 0;
    case "coach":
      return f.coach;
    case "mls":
      return f.mls && !f.nats.some((n) => MLS_HOME_IDX.includes(n));
    case "arabia":
      return f.stints.some((s) => GULF_IDX.includes(s.country)) && !f.nats.some((n) => GULF_IDX.includes(n));
  }
}

function clubName(clubs: ClubRef[], idx: number, lang: Lang): string {
  const c = clubs[idx];
  if (!c) return lang === "pt" ? "nesse clube" : "that club";
  return lang === "en" ? (CLUBS.find((k) => k.key === c.key)?.en ?? c.name) : c.name;
}

/** "no Benfica" / "for Benfica". */
function clubPhrase(clubs: ClubRef[], idx: number, lang: Lang) {
  const c = clubs[idx];
  if (lang === "en") return `for ${clubName(clubs, idx, lang)}`;
  return c ? `${c.prep} ${c.name}` : "nesse clube";
}

function countryName(idx: number, lang: Lang) {
  const c = COUNTRIES[idx];
  return lang === "pt" ? c.name : c.en[0];
}

/** "em Itália" / "in Italy". */
function countryPhrase(idx: number, lang: Lang) {
  return lang === "pt" ? `${COUNTRIES[idx].in} ${COUNTRIES[idx].name}` : `in ${countryName(idx, lang)}`;
}

function demonym(idx: number, lang: Lang, many: boolean) {
  const c = COUNTRIES[idx];
  if (lang === "pt") return many ? c.many : c.one;
  return (many ? c.enMany : c.enOne) ?? c.en[0];
}

const yy = (year: number) => String(year % 100).padStart(2, "0");

function promptTitleIn(p: Prompt, clubs: ClubRef[], lang: Lang): { title: string; subtitle?: string } {
  const pt = lang === "pt";
  switch (p.kind) {
    case "letter":
      return { title: p.letter, subtitle: pt ? `Nome próprio ou apelido começado por ${p.letter}` : `First name or surname starting with ${p.letter}` };
    case "club":
      return { title: `${pt ? "Jogou" : "Played"} ${clubPhrase(clubs, p.club, lang)}` };
    case "clubPeriod":
      return { title: `${pt ? "Jogou" : "Played"} ${clubPhrase(clubs, p.club, lang)}`, subtitle: pt ? `entre ${p.from} e ${p.to}` : `between ${p.from} and ${p.to}` };
    case "nationality":
      return { title: demonym(p.country, lang, true), subtitle: pt ? "Nacionalidade" : "Nationality" };
    case "playedIn":
      return {
        title: `${pt ? "Jogou" : "Played"} ${p.countries.map((c) => countryPhrase(c, lang)).join(pt ? " e " : " and ")}`,
        subtitle:
          p.countries.length > 1 ? (pt ? "Em clubes dos dois países" : "At clubs in both countries") : pt ? "Num clube deste país" : "At a club in this country",
      };
    case "caps":
      if (pt)
        return {
          title: `${p.op === "lt" ? "Menos" : "Mais"} de ${p.n} internacionalizações`,
          subtitle: p.op === "lt" ? "Pela seleção A (nunca ter jogado também conta)" : "Pela seleção A",
        };
      return {
        title: `${p.op === "lt" ? "Fewer" : "More"} than ${p.n} caps`,
        subtitle: p.op === "lt" ? "For the senior national team (never playing counts too)" : "For the senior national team",
      };
    case "position":
      return { title: POS_NAMES[lang][p.pos].many, subtitle: pt ? "Posição" : "Position" };
    case "decade":
      return pt
        ? { title: `Nascidos nos anos ${yy(p.from)}`, subtitle: `Entre ${p.from} e ${p.from + 9}` }
        : { title: `Born in the ${yy(p.from)}s`, subtitle: `Between ${p.from} and ${p.from + 9}` };
    case "positionClub":
      return { title: `${POS_NAMES[lang][p.pos].many} ${pt ? "que jogaram" : "who played"} ${clubPhrase(clubs, p.club, lang)}` };
    case "continent":
      return { title: CONT_NAMES[lang][p.cont].many, subtitle: CONT_NAMES[lang][p.cont].sub };
    case "coach":
      return pt
        ? { title: "Viraram treinadores", subtitle: "Jogadores que depois foram treinadores" }
        : { title: "Became managers", subtitle: "Players who later became managers" };
    case "mls":
      return pt
        ? { title: "Estrangeiros que jogaram na MLS", subtitle: "Sem nacionalidade dos EUA ou do Canadá" }
        : { title: "Foreigners who played in MLS", subtitle: "Not US or Canadian nationals" };
    case "arabia":
      return pt
        ? { title: "Estrangeiros que jogaram nas Arábias", subtitle: "Arábia Saudita, Emirados, Catar, Kuwait, Barém ou Omã" }
        : { title: "Foreigners who played in the Gulf", subtitle: "Saudi Arabia, UAE, Qatar, Kuwait, Bahrain or Oman" };
  }
}

/** Title shown on the wheel for a category prompt, in every language. */
export function promptTitle(p: Prompt, clubs: ClubRef[]): { title: Text; subtitle?: Text; flag?: string } {
  const pt = promptTitleIn(p, clubs, "pt");
  const en = promptTitleIn(p, clubs, "en");
  const flag =
    p.kind === "nationality" ? COUNTRIES[p.country].flag : p.kind === "playedIn" && p.countries.length === 1 ? COUNTRIES[p.countries[0]].flag : undefined;
  return { title: { pt: pt.title, en: en.title }, subtitle: pt.subtitle && en.subtitle ? { pt: pt.subtitle, en: en.subtitle } : undefined, flag };
}

const POS_SHORT: Record<Lang, Record<PosKey, string>> = {
  pt: { GK: "GR", DF: "Defesas", MF: "Médios", FW: "Avançados" },
  en: { GK: "GK", DF: "DF", MF: "MF", FW: "FW" },
};

/** A few words for a slice of the wheel. */
export function shortTitle(p: Prompt, clubs: ClubRef[]): Text {
  return both((lang) => {
    const pt = lang === "pt";
    const club = (i: number) => (clubs[i] ? clubName(clubs, i, lang) : "?");
    switch (p.kind) {
      case "letter":
        return p.letter;
      case "club":
        return club(p.club);
      case "clubPeriod":
        return `${club(p.club)} ${yy(p.from)}-${yy(p.to)}`;
      case "nationality":
        return demonym(p.country, lang, true);
      case "playedIn":
        return p.countries.map((c) => countryName(c, lang)).join(" + ");
      case "caps":
        return `${p.op === "lt" ? "−" : "+"}${p.n} ${pt ? "internac." : "caps"}`;
      case "position":
        return POS_NAMES[lang][p.pos].many;
      case "decade":
        return pt ? `Anos ${yy(p.from)}` : `${yy(p.from)}s`;
      case "positionClub":
        return `${POS_SHORT[lang][p.pos]} ${club(p.club)}`;
      case "continent":
        return CONT_NAMES[lang][p.cont].many;
      case "coach":
        return pt ? "Treinadores" : "Managers";
      case "mls":
        return "MLS";
      case "arabia":
        return pt ? "Arábias" : "Gulf";
    }
  });
}

function explainMissIn(f: PlayerFacts, p: Prompt, clubs: ClubRef[], name: string, lang: Lang): string {
  const pt = lang === "pt";
  const club = clubPhrase(clubs, "club" in p ? p.club : -1, lang);
  const notPos = (pos: PosKey) =>
    f.pos ? (pt ? `${name} não é ${POS_NAMES.pt[pos].one}` : `${name} isn't ${POS_NAMES.en[pos].one}`) : pt ? `Não há registo da posição de ${name}` : `No record of ${name}'s position`;
  switch (p.kind) {
    case "letter":
      return pt ? `${name} não começa por ${p.letter}` : `${name} doesn't start with ${p.letter}`;
    case "club":
      return pt ? `${name} não jogou ${club}` : `${name} didn't play ${club}`;
    case "clubPeriod":
      if (!playedFor(f, p.club)) return pt ? `${name} não jogou ${club}` : `${name} didn't play ${club}`;
      return pt ? `${name} não jogou ${club} entre ${p.from} e ${p.to}` : `${name} didn't play ${club} between ${p.from} and ${p.to}`;
    case "nationality":
      return pt ? `${name} não é ${demonym(p.country, lang, false)}` : `${name} isn't ${demonym(p.country, lang, false)}`;
    case "playedIn": {
      const missing = p.countries.filter((c) => !f.stints.some((s) => s.country === c)).map((c) => countryPhrase(c, lang));
      return pt ? `${name} não jogou ${missing.join(" nem ")}` : `${name} didn't play ${missing.join(" or ")}`;
    }
    case "caps":
      if (p.op === "lt") return pt ? `${name} tem ${f.caps} internacionalizações` : `${name} has ${f.caps} caps`;
      if (f.caps > 0) return pt ? `${name} só tem ${f.caps} internacionalizações` : `${name} only has ${f.caps} caps`;
      return pt ? `Não há registo de mais de ${p.n} internacionalizações de ${name}` : `No record of more than ${p.n} caps for ${name}`;
    case "position":
      return notPos(p.pos);
    case "decade":
      if (f.by) return pt ? `${name} nasceu em ${f.by}` : `${name} was born in ${f.by}`;
      return pt ? `Não há registo do ano de nascimento de ${name}` : `No record of ${name}'s year of birth`;
    case "positionClub":
      if (!((f.pos & POS[p.pos]) !== 0)) return notPos(p.pos);
      return pt ? `${name} não jogou ${club}` : `${name} didn't play ${club}`;
    case "continent":
      return pt ? `${name} não é ${CONT_NAMES.pt[p.cont].one}` : `${name} isn't ${CONT_NAMES.en[p.cont].one}`;
    case "coach":
      return pt ? `Não há registo de ${name} como treinador` : `No record of ${name} as a manager`;
    case "mls":
      if (f.mls) return pt ? `${name} não é estrangeiro na MLS` : `${name} isn't a foreigner in MLS`;
      return pt ? `${name} não jogou na MLS` : `${name} didn't play in MLS`;
    case "arabia":
      if (f.stints.some((s) => GULF_IDX.includes(s.country))) return pt ? `${name} não é estrangeiro nas Arábias` : `${name} isn't a foreigner in the Gulf`;
      return pt ? `${name} não jogou nas Arábias` : `${name} didn't play in the Gulf`;
  }
}

/** Why a player does not fit (for the "try again" message). */
export function explainMiss(f: PlayerFacts, p: Prompt, clubs: ClubRef[], name: string): Text {
  return both((lang) => explainMissIn(f, p, clubs, name, lang));
}

/** Maps a Wikidata position label (English) to position bits. */
export function positionBits(label: string): number {
  const l = label.toLowerCase();
  let bits = 0;
  if (/goalkeeper/.test(l)) bits |= POS.GK;
  if (/defender|cent(re|er)[- ]back|full[- ]?back|wing[- ]?back|left[- ]back|right[- ]back|sweeper|libero|stopper/.test(l)) bits |= POS.DF;
  if (/midfield|wing[- ]half|half[- ]back|playmaker|winger|inside forward|regista|mezzala|trequartista/.test(l)) bits |= POS.MF;
  if (/forward|striker|winger|attacker|false nine/.test(l)) bits |= POS.FW;
  return bits;
}
