// Samples from the real database (skipped until scripts/build-db.ts has run).
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PlayerDb } from "../shared/db.ts";
import { resolveAnswer } from "../shared/match.ts";

const file = new URL("../public/data/players.bin", import.meta.url);
const db = existsSync(file) ? new PlayerDb(JSON.parse(gunzipSync(readFileSync(file)).toString())) : null;

describe.skipIf(!db)("real database", () => {
  const cat = (id: string) => db!.file.categories.find((c) => c.id === id)!;
  const check = (id: string, text: string) => resolveAnswer(db!, text, { prompt: cat(id).prompt, clubs: db!.file.clubs, used: new Set() });
  const name = (id: string, text: string) => {
    const r = check(id, text);
    return r.status === "ok" ? (r.idx === null ? "ok (o nome)" : db!.name(r.idx)) : `${r.status}: ${"message" in r ? r.message : ""}`;
  };

  it("has the categories of the plan", () => {
    for (const id of ["letter:M", "club:benfica", "period:manutd:2000", "caps:lt10", "caps:gt50", "pos:GK", "decade:1980", "nat:BR", "in:IT", "in:PT+ES", "cont:AF", "cont:AS", "cont:NA", "career:coach", "career:mls", "career:arabia", "posclub:FW:benfica"])
      expect(cat(id), id).toBeTruthy();
  });

  it("has only the chosen rounds", () => {
    const ids = db!.file.categories.map((c) => c.id);
    for (const gone of ["club:braga", "club:boca", "period:ajax:2000", "posclub:GK:benfica", "posclub:FW:ajax", "posclub:FW:boca", "nat:JP", "nat:CH", "nat:AT", "in:AR", "in:AR+ES", "caps:gt100", "decade:1960"])
      expect(ids, gone).not.toContain(gone);
  });

  it("knows the classics", () => {
    expect(name("club:benfica", "Rui Costa")).toBe("Rui Costa");
    expect(name("period:manutd:2000", "Cristiano Ronaldo")).toBe("Cristiano Ronaldo");
    expect(name("club:benfica", "Eusébio")).toBe("Eusébio");
    expect(name("career:mls", "Beckham")).toBe("David Beckham");
    expect(name("career:arabia", "Cristiano Ronaldo")).toBe("Cristiano Ronaldo");
    expect(name("career:coach", "Zidane")).toBe("Zinédine Zidane");
    expect(name("cont:NA", "Christian Eriksen")).toMatch(/^invalid/);
    expect(name("letter:R", "Ronaldo")).toBe("Ronaldo Nazário");
    expect(name("club:manutd", "Ronaldo")).toBe("Cristiano Ronaldo");
    expect(name("letter:P", "Pepe")).toBe("Pepe");
    expect(name("letter:D", "Deco")).toBe("Deco");
    expect(name("letter:M", "Mesi")).toBe("Lionel Messi");
    expect(name("letter:D", "Diomande")).toMatch(/^ok|^Yan|^Ousmane/);
    expect(name("club:sporting", "Diomande")).toBe("Ousmane Diomande");
  });

  it("doesn't complete a first name into a player (Manu is not Manuel Neuer)", () => {
    // Whatever the round, never accepted as that player nor offered as an option.
    const never = (text: string, player: string) => {
      for (const c of db!.file.categories) {
        const r = check(c.id, text);
        const got = r.status === "ok" && r.idx !== null ? [db!.name(r.idx)] : r.status === "choose" ? r.options.map((o) => db!.name(o.idx)) : [];
        expect(got, `${text} em ${c.id}`).not.toContain(player);
      }
    };
    never("Manu", "Manuel Neuer");
    never("Leo", "Lionel Messi");
    never("Lio", "Lionel Messi");
    never("Dino", "Jan Koller");
    never("Zlatan", "Serdar Dursun");
    never("Kristian", "Christian Noboa");
    // A first name alone is vague, as "Lionel" is: no Harry Gregg, Jens Castrop or Nico Yennaris.
    for (const first of ["Harry", "Zlatan", "Gelson", "Jens", "Nico", "Lionel"]) {
      const r = check(`letter:${first[0]}`, first);
      expect(r.status === "invalid" && r.reason, first).toBe("vague");
    }
    // Unless it is somebody's surname: then it is that player, not a more famous one filed by first name.
    expect(name("letter:R", "Ruben")).toBe("Marco Rubén");
    expect(name("letter:C", "Christian")).not.toBe("Christian Noboa");
  });

  it("keeps surnames, nicknames and the names players go by", () => {
    expect(name("pos:GK", "Neuer")).toBe("Manuel Neuer");
    expect(name("letter:M", "Manuel Neuer")).toBe("Manuel Neuer");
    expect(name("letter:C", "CR7")).toBe("Cristiano Ronaldo");
    expect(name("letter:Z", "Zizou")).toBe("Zinédine Zidane");
    expect(name("letter:K", "Kepa")).toBe("Kepa Arrizabalaga");
    expect(name("letter:M", "Marcelo")).toBe("Marcelo Vieira da Silva Júnior");
    expect(name("letter:M", "Marcelinho")).toBe("Marcelo Nascimento da Costa");
    expect(name("letter:S", "Son")).toBe("Son Heung-min");
    expect(name("letter:R", "Ronaldo")).toBe("Ronaldo Nazário");
    expect(name("letter:P", "Pedro")).toBe("Pedro Rodríguez Ledesma");
    expect(name("letter:B", "Bojan")).toBe("Bojan Krkić");
    // Family names that come first are surnames: every Park counts, the non-Asian ones are the decoys.
    const park = check("cont:AS", "Park");
    expect(park.status === "choose" && park.options.filter((o) => o.valid).map((o) => db!.name(o.idx))).toEqual(["Park Ji-Sung"]);
    expect(name("letter:P", "Park")).toBe("ok (o nome)");
  });

  it("asks which one when a name is vague, with only one right option", () => {
    const valid = (id: string, text: string) => {
      const r = check(id, text);
      return r.status === "choose" ? r.options.filter((o) => o.valid).map((o) => db!.name(o.idx)) : r.status;
    };
    expect(valid("club:benfica", "Silva")).toHaveLength(1);
    expect(valid("club:benfica", "Tiago")).toEqual(["Tiago Mendes"]);
    expect(valid("club:atletico", "Tiago")).toEqual(["Tiago Mendes"]);
  });

  it("answers in a few milliseconds", () => {
    const t = performance.now();
    for (let i = 0; i < 50; i++) check("letter:M", i % 2 ? "Messi" : "Mesi");
    expect((performance.now() - t) / 50).toBeLessThan(20);
  });
});
