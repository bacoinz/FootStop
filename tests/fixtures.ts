// A tiny hand-made player database for tests.

import { COUNTRY_INDEX, POS, promptTitle, type Category, type Family, type Prompt } from "../shared/categories.ts";
import { CONT } from "../shared/categories.ts";
import { encodeCountries, FLAG_COACH, FLAG_FAMILY_FIRST, FLAG_MLS, PlayerDb, type DbClub, type DbFile } from "../shared/db.ts";

export const CLUBS: DbClub[] = [
  { q: "Q131499", key: "benfica", name: "Benfica", prep: "no", country: COUNTRY_INDEX.PT },
  { q: "Q18656", key: "manutd", name: "Manchester United", prep: "no", country: COUNTRY_INDEX.EN },
  { q: "Q7156", key: "barcelona", name: "Barcelona", prep: "no", country: COUNTRY_INDEX.ES },
  { q: "Q8682", key: "realmadrid", name: "Real Madrid", prep: "no", country: COUNTRY_INDEX.ES },
];
const CLUB = Object.fromEntries(CLUBS.map((c, i) => [c.key, i]));

interface P {
  q: number;
  name: string;
  alt?: string[];
  al?: string[];
  sl: number;
  by?: number;
  pos?: number;
  caps?: number;
  nat?: string[];
  played?: string[];
  clubs?: [string, number, number][];
  /** Continents (CONT bits), became a manager, played in the MLS. */
  cont?: number;
  coach?: boolean;
  mls?: boolean;
  /** The family name comes first (Korean, Chinese, Vietnamese names). */
  familyFirst?: boolean;
}

export const PLAYERS: P[] = [
  { q: 615, name: "Lionel Messi", al: ["Leo Messi", "La Pulga", "Leo", "Lío"], sl: 225, by: 1987, pos: POS.FW, caps: 190, nat: ["AR"], played: ["ES", "FR", "US"], clubs: [["barcelona", 2004, 2021]], mls: true },
  { q: 11571, name: "Cristiano Ronaldo", al: ["CR7", "Ronaldo"], sl: 215, by: 1985, pos: POS.FW, caps: 220, nat: ["PT"], played: ["PT", "EN", "ES", "IT", "SA"], clubs: [["manutd", 2003, 2009], ["realmadrid", 2009, 2018], ["manutd", 2021, 2022]] },
  { q: 311098, name: "Zinédine Zidane", sl: 145, by: 1972, pos: POS.MF, caps: 108, nat: ["FR"], played: ["FR", "IT", "ES"], clubs: [["realmadrid", 2001, 2006]], coach: true },
  { q: 311099, name: "Landon Donovan", sl: 60, by: 1982, pos: POS.FW, caps: 157, nat: ["US"], played: ["US", "DE", "EN"], mls: true, cont: CONT.NA },
  { q: 311100, name: "Samuel Eto'o", sl: 110, by: 1981, pos: POS.FW, caps: 118, nat: ["CM"], played: ["ES", "IT", "EN", "RU", "TR", "QA"], clubs: [["barcelona", 2004, 2009]], cont: CONT.AF },
  { q: 529207, name: "Ronaldo Nazário", alt: ["Ronaldo"], sl: 124, by: 1976, pos: POS.FW, caps: 98, nat: ["BR"], played: ["BR", "NL", "ES", "IT"], clubs: [["barcelona", 1996, 1997], ["realmadrid", 2002, 2007]] },
  { q: 70000001, name: "Cristiano Ronaldo Jr.", al: ["Cristiano Ronaldo"], sl: 13, by: 2010, pos: POS.FW, caps: 0, nat: ["PT"], played: ["SA"] },
  { q: 311078, name: "Pepe", sl: 76, by: 1983, pos: POS.DF, caps: 141, nat: ["PT", "BR"], played: ["PT", "ES", "TR"], clubs: [["realmadrid", 2007, 2017]] },
  { q: 311079, name: "Pepe", sl: 37, by: 1935, pos: POS.FW, caps: 34, nat: ["BR"], played: ["BR"] },
  { q: 311080, name: "Simone Pepe", sl: 49, by: 1983, pos: POS.MF, caps: 23, nat: ["IT"], played: ["IT"] },
  { q: 311081, name: "Deco", sl: 70, by: 1977, pos: POS.MF, caps: 75, nat: ["BR", "PT"], played: ["PT", "ES", "EN", "BR"], clubs: [["barcelona", 2004, 2008], ["benfica", 1997, 1998]] },
  { q: 311082, name: "Gary Neville", sl: 65, by: 1975, pos: POS.DF, caps: 85, nat: ["EN"], played: ["EN"], clubs: [["manutd", 1992, 2011]] },
  { q: 311083, name: "Phil Neville", sl: 48, by: 1977, pos: POS.DF, caps: 59, nat: ["EN"], played: ["EN"], clubs: [["manutd", 1994, 2005]] },
  { q: 311084, name: "Bernardo Silva", sl: 63, by: 1994, pos: POS.MF, caps: 90, nat: ["PT"], played: ["PT", "FR", "EN"], clubs: [["benfica", 2013, 2014]] },
  { q: 311085, name: "Rafa Silva", sl: 40, by: 1993, pos: POS.FW, caps: 25, nat: ["PT"], played: ["PT", "TR"], clubs: [["benfica", 2016, 2024]] },
  { q: 311086, name: "David Silva", sl: 76, by: 1986, pos: POS.MF, caps: 125, nat: ["ES"], played: ["ES", "EN"] },
  { q: 311087, name: "Rui Costa", sl: 58, by: 1972, pos: POS.MF, caps: 94, nat: ["PT"], played: ["PT", "IT"], clubs: [["benfica", 1990, 1994], ["benfica", 2006, 2008]] },
  { q: 311088, name: "Diogo Jota", sl: 72, by: 1996, pos: POS.FW, caps: 49, nat: ["PT"], played: ["PT", "ES", "EN"] },
  { q: 311089, name: "Jota Filipe", alt: ["Jota"], sl: 21, by: 1999, pos: POS.FW, caps: 1, nat: ["PT"], played: ["PT"], clubs: [["benfica", 2017, 2019]] },
  { q: 311090, name: "Lionel Scaloni", sl: 40, by: 1978, pos: POS.DF, caps: 7, nat: ["AR"], played: ["ES", "IT"] },
  { q: 311091, name: "Robin van Persie", sl: 97, by: 1983, pos: POS.FW, caps: 102, nat: ["NL"], played: ["NL", "EN", "TR"], clubs: [["manutd", 2012, 2015]] },
  { q: 311092, name: "Iker Casillas", sl: 100, by: 1981, pos: POS.GK, caps: 167, nat: ["ES"], played: ["ES", "PT"], clubs: [["realmadrid", 1999, 2015]] },
  { q: 311094, name: "Yan Diomandé", sl: 42, by: 2006, pos: POS.FW, caps: 2, nat: ["CI"], played: ["ES"], clubs: [["realmadrid", 2025, 0]] },
  { q: 311095, name: "Ousmane Diomande", sl: 30, by: 2003, pos: POS.DF, caps: 12, nat: ["CI"], played: ["PT"], clubs: [] },
  { q: 311096, name: "Tiago Mendes", sl: 48, by: 1981, pos: POS.MF, caps: 66, nat: ["PT"], played: ["PT", "EN", "FR", "IT", "ES"], clubs: [["benfica", 2002, 2004]] },
  { q: 311097, name: "Tiago Djaló", sl: 30, by: 2000, pos: POS.DF, caps: 0, nat: ["PT"], played: ["PT", "FR", "IT"], clubs: [] },
  // Wikidata lists "Manu" as a nickname of Manuel Neuer; Manú is the player known by that name.
  { q: 107365, name: "Manuel Neuer", al: ["Manuel Peter Neuer", "Manu"], sl: 99, by: 1986, pos: POS.GK, caps: 124, nat: ["DE"], played: ["DE"] },
  { q: 254823, name: "Emanuel de Jesus Bonfim Evaristo", alt: ["Manú"], sl: 15, by: 1982, pos: POS.FW, caps: 0, nat: ["PT"], played: ["PT", "GR"], clubs: [["benfica", 2003, 2007]] },
  { q: 311101, name: "Manu Trigueros", sl: 28, by: 1991, pos: POS.MF, caps: 1, nat: ["ES"], played: ["ES"] },
  { q: 311102, name: "Léo Jardim", sl: 18, by: 1995, pos: POS.GK, caps: 0, nat: ["BR"], played: ["BR", "PT", "FR"] },
  // Filed under the full legal name: the alias is the name he plays by.
  { q: 311103, name: "Ricardo Alexandre dos Santos", al: ["Ricardinho"], sl: 44, by: 1976, pos: POS.MF, caps: 23, nat: ["BR"], played: ["BR", "EN", "TR"] },
  { q: 311104, name: "Ricardinho Souza", sl: 8, by: 1990, pos: POS.MF, caps: 0, nat: ["BR"], played: ["BR"] },
  { q: 311112, name: "Luís Miguel Afonso Fernandes", alt: ["Pizzi"], sl: 30, by: 1989, pos: POS.MF, caps: 17, nat: ["PT"], played: ["PT", "ES", "TR"], clubs: [["benfica", 2014, 2021]] },
  // A first name alone: Kepa goes by it, Harry Gregg and Rubén de la Red are not the famous ones.
  { q: 311105, name: "Kepa Arrizabalaga", al: ["Kepa"], sl: 61, by: 1994, pos: POS.GK, caps: 13, nat: ["ES"], played: ["ES", "EN"] },
  { q: 311106, name: "Harry Kane", sl: 96, by: 1993, pos: POS.FW, caps: 100, nat: ["EN"], played: ["EN", "DE"] },
  { q: 311107, name: "Harry Gregg", al: ["Henry Gregg", "Harry"], sl: 35, by: 1932, pos: POS.GK, caps: 25, played: ["EN"], clubs: [["manutd", 1957, 1966]] },
  { q: 311108, name: "Rúben Dias", sl: 53, by: 1997, pos: POS.DF, caps: 60, nat: ["PT"], played: ["PT", "EN"], clubs: [["benfica", 2017, 2020]] },
  { q: 311109, name: "Rubén de la Red", alt: ["Rubén"], sl: 38, by: 1985, pos: POS.MF, caps: 3, nat: ["ES"], played: ["ES"], clubs: [["realmadrid", 2006, 2010]] },
  { q: 311110, name: "Son Heung-min", sl: 77, by: 1992, pos: POS.FW, caps: 130, nat: ["KR"], played: ["DE", "EN", "US"], familyFirst: true },
  { q: 311111, name: "Son Jun-ho", sl: 20, by: 1992, pos: POS.MF, caps: 20, nat: ["KR"], played: [], familyFirst: true },
  { q: 311093, name: "Eusébio", sl: 95, by: 1942, pos: POS.FW, caps: 64, nat: ["PT"], played: ["PT", "US"], clubs: [["benfica", 1960, 1975]] },
];

export function makeFile(players: P[] = PLAYERS, categories: Category[] = []): DbFile {
  return {
    v: 1,
    builtAt: "test",
    clubs: CLUBS,
    categories,
    q: players.map((p) => p.q),
    name: players.map((p) => p.name),
    alt: players.map((p) => (p.alt ?? []).join("|")),
    al: players.map((p) => (p.al ?? []).join("|")),
    sl: players.map((p) => p.sl),
    by: players.map((p) => p.by ?? 0),
    pos: players.map((p) => p.pos ?? 0),
    caps: players.map((p) => p.caps ?? 0),
    nat: players.map((p) => encodeCountries((p.nat ?? []).map((k) => COUNTRY_INDEX[k]))),
    cc: players.map((p) => encodeCountries((p.played ?? []).map((k) => COUNTRY_INDEX[k]))),
    cs: players.map((p) => (p.clubs?.length ? p.clubs.flatMap(([k, s, e]) => [CLUB[k], s, e]) : 0)),
    img: players.map(() => ""),
    cont: players.map((p) => p.cont ?? 0),
    flags: players.map((p) => (p.coach ? FLAG_COACH : 0) | (p.mls ? FLAG_MLS : 0) | (p.familyFirst ? FLAG_FAMILY_FIRST : 0)),
    contByCountry: {},
    mlsClubs: [],
  };
}

// Sorted by fame, like the real database.
export const db = new PlayerDb(makeFile([...PLAYERS].sort((a, b) => b.sl - a.sl)));

export function category(id: string, family: Family, prompt: Prompt): Category {
  return { id, family, prompt, ...promptTitle(prompt, CLUBS), answers: 100 };
}

export const letter = (l: string) => category(`letter:${l}`, "letter", { kind: "letter", letter: l });
export const club = (key: string) => category(`club:${key}`, "club", { kind: "club", club: CLUB[key] });
