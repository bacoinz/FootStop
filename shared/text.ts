// Name normalisation shared by the data build, the matcher and the UI.

const SPECIAL: Record<string, string> = {
  ø: "o", ł: "l", ß: "ss", đ: "d", æ: "ae", œ: "oe", ı: "i", þ: "th", ð: "d", ħ: "h", ŀ: "l",
};

/** "Luís Figo" → "luis figo", "N'Golo Kanté" → "ngolo kante", "Pierre-Emerick" → "pierre emerick". */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/[øłßđæœıþðħŀ]/g, (c) => SPECIAL[c] ?? c)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’`´ʻ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function words(folded: string): string[] {
  return folded ? folded.split(" ") : [];
}

/** Drops disambiguation such as "Pepe (footballer, born 1983)". */
export function cleanLabel(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}
