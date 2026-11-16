import { describe, expect, it } from "vitest";
import { COUNTRY_INDEX, type Prompt } from "../shared/categories.ts";
import { withinOneEdit } from "../shared/db.ts";
import { fitsLetter, judgeLive, liveMatches, nameKeys, pickTrumpAnswer, resolveAnswer, type Resolution } from "../shared/match.ts";
import { fold } from "../shared/text.ts";
import { CLUBS, club, db, letter } from "./fixtures.ts";

function check(text: string, prompt: Prompt, used: number[] = [], usedKeys: string[] = []): Resolution {
  return resolveAnswer(db, text, { prompt, clubs: CLUBS, used: new Set(used), usedKeys: new Set(usedKeys), rng: () => 0.3 });
}

function okName(r: Resolution) {
  return r.status === "ok" ? (r.idx === null ? "(o nome)" : db.name(r.idx)) : r.status;
}

function options(r: Resolution) {
  return r.status === "choose" ? r.options.map((o) => `${db.name(o.idx)}${o.valid ? " ✓" : ""}`).sort() : [];
}

const L = (l: string) => letter(l).prompt;
const C = (k: string) => club(k).prompt;

describe("fold", () => {
  it("drops accents, apostrophes and punctuation", () => {
    expect(fold("Luís Figo")).toBe("luis figo");
    expect(fold("N'Golo Kanté")).toBe("ngolo kante");
    expect(fold("Pierre-Emerick Aubameyang")).toBe("pierre emerick aubameyang");
    expect(fold("  Ødegaard ")).toBe("odegaard");
    expect(fold("Gyökeres")).toBe("gyokeres");
  });
});

describe("name keys", () => {
  it("has the full name, the surname and nicknames, but never the first name alone", () => {
    const keys = nameKeys(["Lionel Messi"], ["La Pulga"]);
    expect(keys).toContain("lionel messi");
    expect(keys).toContain("messi");
    expect(keys).toContain("la pulga");
    expect(keys).not.toContain("lionel");
    expect(nameKeys(["Juan Román Riquelme"], [])).toEqual(expect.arrayContaining(["riquelme", "juan riquelme", "roman riquelme"]));
  });

  it("a one-word alias or label that is only a first name is not a key", () => {
    const ctx = (owns: string[] = [], familyFirst = false) => ({
      isFirstName: (w: string) => ["manu", "leo", "ricardinho", "kepa", "harry", "ruben", "ronaldo", "son"].includes(w),
      ownsFirstName: (w: string) => owns.includes(w),
      familyFirst,
    });
    // A short form of the player's own first name, or somebody else's first name.
    const neuer = nameKeys(["Manuel Neuer"], ["Manu", "Manuel Peter Neuer"], ctx());
    expect(neuer).not.toContain("manu");
    expect(neuer).toContain("manuel peter neuer");
    const messi = nameKeys(["Lionel Messi"], ["Leo", "Lío", "Leo Messi", "La Pulga"], ctx());
    expect(messi).not.toContain("leo");
    expect(messi).not.toContain("lio");
    expect(messi).toEqual(expect.arrayContaining(["leo messi", "la pulga"]));
    expect(nameKeys(["Louis van Hege"], ["Leo"], ctx())).not.toContain("leo");
    // The player's own first name: only for the best-known one with it.
    expect(nameKeys(["Kepa Arrizabalaga"], ["Kepa"], ctx(["kepa"]))).toContain("kepa");
    expect(nameKeys(["Harry Gregg"], ["Harry"], ctx())).not.toContain("harry");
    expect(nameKeys(["Rubén de la Red", "Rubén"], [], ctx())).not.toContain("ruben");
    expect(nameKeys(["Ronaldo Nazário", "Ronaldo"], [], ctx(["ronaldo"]))).toContain("ronaldo");
    // A family name that comes first is a surname.
    expect(nameKeys(["Son Heung-min"], [], ctx([], true))).toContain("son");
    expect(nameKeys(["Son Heung-min"], [], ctx())).not.toContain("son");
    // What a player goes by stays: the name shown, another label, a nickname, the alias of a legal name.
    expect(nameKeys(["Pepe", "Pepe Ferreira"], [], ctx())).toContain("pepe");
    expect(nameKeys(["Emanuel de Jesus Bonfim Evaristo", "Manú"], [], ctx())).toContain("manu");
    expect(nameKeys(["Javier Hernández", "Chicharito"], [], ctx())).toContain("chicharito");
    expect(nameKeys(["Cristiano Ronaldo"], ["CR7", "Ronaldo"], ctx())).toEqual(expect.arrayContaining(["cr7", "ronaldo"]));
    expect(nameKeys(["Ricardo Alexandre dos Santos"], ["Ricardinho"], ctx())).toContain("ricardinho");
  });
});

describe("letter rule: first name or surname", () => {
  it("accepts either initial of what was typed", () => {
    expect(fitsLetter("lionel messi", "L")).toBe(true);
    expect(fitsLetter("lionel messi", "M")).toBe(true);
    expect(fitsLetter("messi", "L")).toBe(false);
    expect(fitsLetter("van persie", "V")).toBe(true);
    expect(fitsLetter("robin van persie", "P")).toBe(true);
  });

  it("M: Messi and Lionel Messi", () => {
    expect(okName(check("Messi", L("M")))).toBe("Lionel Messi");
    expect(okName(check("Lionel Messi", L("M")))).toBe("Lionel Messi");
  });

  it("L: Lionel Messi yes, Messi no, Lionel alone no", () => {
    expect(okName(check("Lionel Messi", L("L")))).toBe("Lionel Messi");
    const lionel = check("Lionel", L("L"));
    expect(lionel.status === "invalid" && lionel.reason).toBe("vague");
    expect(lionel.status === "invalid" && lionel.message.pt).toMatch(/nome próprio/);
    expect(lionel.status === "invalid" && lionel.message.en).toMatch(/just a first name/);
    const messi = check("Messi", L("L"));
    expect(messi.status === "invalid" && messi.reason).toBe("letter");
  });

  it("namesakes all fit a letter: the name itself is accepted (Diomande)", () => {
    expect(okName(check("Diomande", L("D")))).toBe("(o nome)");
    const again = check("Diomande", L("D"), [], ["diomande"]);
    expect(again.status === "invalid" && again.reason).toBe("used");
    expect(okName(check("Ousmane Diomande", L("D"), [], ["diomande"]))).toBe("Ousmane Diomande");
  });

  it("R: Ronaldo is the Phenomenon", () => {
    expect(okName(check("Ronaldo", L("R")))).toBe("Ronaldo Nazário");
  });

  it("nicknames: Pepe, Deco, CR7", () => {
    const pepe = check("Pepe", L("P"));
    expect(okName(pepe)).toBe("Pepe");
    expect(pepe.status === "ok" && db.facts(pepe.idx).by).toBe(1983);
    expect(okName(check("Deco", L("D")))).toBe("Deco");
    expect(okName(check("CR7", L("C")))).toBe("Cristiano Ronaldo");
  });

  it("the clearly more famous namesake wins (Jota = Diogo Jota)", () => {
    expect(okName(check("Jota", L("J")))).toBe("Diogo Jota");
  });

  it("tolerates one typo", () => {
    const r = check("Mesi", L("M"));
    expect(okName(r)).toBe("Lionel Messi");
    expect(r.status === "ok" && r.fuzzy).toBe(true);
    expect(okName(check("Casilas", category("pos:GK", { kind: "position", pos: "GK" })))).toBe("Iker Casillas");
  });
});

function category(_id: string, prompt: Prompt) {
  return prompt;
}

describe("categories", () => {
  it("Ronaldo at Manchester United is Cristiano", () => {
    expect(okName(check("Ronaldo", C("manutd")))).toBe("Cristiano Ronaldo");
  });

  it("vague names offer options, with only one that fits", () => {
    expect(options(check("Silva", C("benfica")))).toEqual(["Bernardo Silva ✓", "David Silva"]);
    // Both Nevilles played for United: either way it's right.
    expect(okName(check("Neville", C("manutd")))).toBe("(o nome)");
  });

  it("a first name alone offers the players with that name (Tiago)", () => {
    expect(options(check("Tiago", C("benfica")))).toEqual(["Tiago Djaló", "Tiago Mendes ✓"]);
  });

  it("once one namesake was said, the other one is meant", () => {
    const gary = db.qid(db.lookup("gary neville")[0]);
    expect(okName(check("Neville", C("manutd"), [gary]))).toBe("Phil Neville");
  });

  it("explains a miss", () => {
    const r = check("Messi", C("benfica"));
    expect(r.status === "invalid" && r.message).toEqual({ pt: "Lionel Messi não jogou no Benfica", en: "Lionel Messi didn't play for Benfica" });
  });

  it("a famous name is judged as that player, not an obscure namesake", () => {
    const r = check("Cristiano Ronaldo", { kind: "caps", op: "lt", n: 10 });
    expect(r.status === "invalid" && r.message.pt).toMatch(/220 internacionalizações/);
    expect(r.status === "invalid" && r.message.en).toMatch(/220 caps/);
  });

  it("the same player can't be said twice in a round, but can in another", () => {
    const messi = db.qid(db.lookup("messi")[0]);
    const again = check("Messi", L("M"), [messi]);
    expect(again.status === "invalid" && again.reason).toBe("used");
    expect(okName(check("Messi", C("barcelona")))).toBe("Lionel Messi");
  });

  it("club periods, nationalities, decades and dual nationals", () => {
    const manutd = CLUBS.findIndex((c) => c.key === "manutd");
    expect(okName(check("Cristiano Ronaldo", { kind: "clubPeriod", club: manutd, from: 2000, to: 2010 }))).toBe("Cristiano Ronaldo");
    expect(check("Van Persie", { kind: "clubPeriod", club: manutd, from: 2000, to: 2010 }).status).toBe("invalid");
    expect(okName(check("Deco", { kind: "nationality", country: COUNTRY_INDEX.BR }))).toBe("Deco");
    expect(okName(check("Deco", { kind: "nationality", country: COUNTRY_INDEX.PT }))).toBe("Deco");
    expect(okName(check("Eusébio", { kind: "decade", from: 1940 }))).toBe("Eusébio");
    expect(okName(check("Rui Costa", { kind: "playedIn", countries: [COUNTRY_INDEX.PT, COUNTRY_INDEX.IT] }))).toBe("Rui Costa");
  });

  it("managers, MLS, the Arabias and continents", () => {
    expect(okName(check("Zidane", { kind: "coach" }))).toBe("Zinédine Zidane");
    expect(check("Messi", { kind: "coach" }).status).toBe("invalid");
    expect(okName(check("Messi", { kind: "mls" }))).toBe("Lionel Messi");
    const home = check("Landon Donovan", { kind: "mls" });
    expect(home.status === "invalid" && home.message.pt).toMatch(/não é estrangeiro/);
    expect(okName(check("Cristiano Ronaldo", { kind: "arabia" }))).toBe("Cristiano Ronaldo");
    expect(okName(check("Eto'o", { kind: "arabia" }))).toBe("Samuel Eto'o");
    expect(okName(check("Eto'o", { kind: "continent", cont: "AF" }))).toBe("Samuel Eto'o");
    expect(okName(check("Landon Donovan", { kind: "continent", cont: "NA" }))).toBe("Landon Donovan");
    expect(check("Zidane", { kind: "continent", cont: "AF" }).status).toBe("invalid");
  });

  it("unknown names go to Wikidata", () => {
    expect(check("Zé Ninguém Qualquer", L("Z")).status).toBe("unknown");
  });
});

describe("no autocomplete", () => {
  const GK: Prompt = { kind: "position", pos: "GK" };

  it("a short first name is not someone else's full name (Manu is not Manuel Neuer)", () => {
    expect(okName(check("Manu", L("M")))).toBe("Emanuel de Jesus Bonfim Evaristo");
    expect(check("Manu", GK).status).toBe("invalid");
    expect(okName(check("Manu", C("benfica")))).toBe("Emanuel de Jesus Bonfim Evaristo");
    expect(okName(check("Neuer", GK))).toBe("Manuel Neuer");
    expect(okName(check("Manuel Neuer", L("M")))).toBe("Manuel Neuer");
  });

  it("a first name that is a famous player's nickname is still just a first name (Leo)", () => {
    const leo = check("Leo", L("L"));
    expect(leo.status === "invalid" && leo.reason).toBe("vague");
    expect(okName(check("Lio", L("L")))).not.toBe("Lionel Messi");
    expect(okName(check("Leo Messi", L("L")))).toBe("Lionel Messi");
  });

  it("the name a player goes by still counts (Ricardinho)", () => {
    expect(okName(check("Ricardinho", L("R")))).toBe("Ricardo Alexandre dos Santos");
  });

  it("a first name alone is the best-known player who goes by it, or nobody (Kepa, not Harry)", () => {
    expect(okName(check("Kepa", L("K")))).toBe("Kepa Arrizabalaga");
    const harry = check("Harry", L("H"));
    expect(harry.status === "invalid" && harry.reason).toBe("vague");
    const ruben = check("Ruben", L("R"));
    expect(ruben.status === "invalid" && ruben.reason).toBe("vague");
    expect(okName(check("Harry Gregg", L("H")))).toBe("Harry Gregg");
    expect(options(check("Harry", C("manutd")))).toEqual(["Harry Gregg ✓", "Harry Kane"]);
  });

  it("a family name that comes first is a surname (Son)", () => {
    expect(okName(check("Son", L("S")))).toBe("Son Heung-min");
  });

  it("only fixes one letter, and never completes a name", () => {
    expect(okName(check("Neue", GK))).toBe("Manuel Neuer");
    expect(okName(check("Neuwr", GK))).toBe("Manuel Neuer");
    for (const partial of ["Neu", "Manuel Neu", "Manuel N", "Casil", "Casill", "Cristiano Ron", "Ronal"])
      expect(check(partial, L(partial[0])).status, partial).not.toBe("ok");
  });
});

describe("the name shown for an answer", () => {
  const shown = (text: string, prompt: Prompt) => {
    const r = check(text, prompt);
    return r.status === "ok" && r.idx !== null ? db.nameFor(r.idx, fold(text), r.fuzzy) : r.status;
  };

  it("is the usual name when it shows what was typed", () => {
    expect(shown("Messi", L("M"))).toBe("Lionel Messi");
    expect(shown("Mesi", L("M"))).toBe("Lionel Messi");
    expect(shown("Ronaldo", L("R"))).toBe("Ronaldo Nazário");
    expect(shown("Ronaldo Nazaro", L("R"))).toBe("Ronaldo Nazário");
    expect(shown("CR7", L("C"))).toBe("Cristiano Ronaldo");
    expect(shown("Leo Messi", L("L"))).toBe("Lionel Messi");
  });

  it("is the name the player was called by when the usual one is a legal name", () => {
    expect(shown("Manu", L("M"))).toBe("Manú");
    expect(shown("Pizzi", L("P"))).toBe("Pizzi");
    expect(shown("Pizi", L("P"))).toBe("Pizzi");
    expect(shown("Ricardinho", L("R"))).toBe("Ricardinho");
    expect(shown("Luís Fernandes", L("L"))).toBe("Luís Miguel Afonso Fernandes");
  });
});

describe("one-edit distance", () => {
  it("covers insert, delete, substitute and swap", () => {
    expect(withinOneEdit("mesi", "messi")).toBe(true);
    expect(withinOneEdit("messsi", "messi")).toBe(true);
    expect(withinOneEdit("mezsi", "messi")).toBe(true);
    expect(withinOneEdit("emssi", "messi")).toBe(true);
    expect(withinOneEdit("mes", "messi")).toBe(false);
    expect(withinOneEdit("masso", "messi")).toBe(false);
  });
});

describe("live Wikidata fallback", () => {
  const ctx = { prompt: L("K"), clubs: CLUBS, used: new Set<number>() };
  it("only keeps results known by the typed name", () => {
    const hits = [
      { qid: "Q1", label: "Kiko Kukuzinho" },
      { qid: "Q2", label: "Kukuzinho" },
      { qid: "Q3", label: "Karl Kukuzinhovic" },
    ];
    expect(liveMatches(hits, "Kukuzinho").map((h) => h.qid)).toEqual(["Q1", "Q2"]);
  });

  it("accepts a single match, asks to be specific for several, rejects none", () => {
    expect(judgeLive("Kukuzinho", [{ hit: { qid: "Q2", label: "Kukuzinho" }, facts: null }], ctx).status).toBe("ok");
    expect(
      judgeLive("Kukuzinho", [
        { hit: { qid: "Q1", label: "Kiko Kukuzinho" }, facts: null },
        { hit: { qid: "Q2", label: "Kukuzinho" }, facts: null },
      ], ctx).status,
    ).toBe("ambiguous");
    expect(judgeLive("Kukuzinho", [], ctx).status).toBe("invalid");
  });
});

describe("trump card", () => {
  it("picks an unused player that fits", () => {
    const used = new Set(db.lookup("rui costa").map((i) => db.qid(i)));
    for (let k = 0; k < 20; k++) {
      const i = pickTrumpAnswer(db, C("benfica"), used, Math.random)!;
      expect(db.facts(i).stints.some((s) => s.club === 0)).toBe(true);
      expect(db.name(i)).not.toBe("Rui Costa");
    }
    const m = pickTrumpAnswer(db, L("M"), new Set(), () => 0)!;
    expect(fitsLetter(fold(db.name(m)), "M")).toBe(true);
  });
});
