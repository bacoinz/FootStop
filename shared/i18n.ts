// Languages. Everything the server says to players goes out in both, and each player reads their own.

export const LANGS = ["pt", "en"] as const;
export type Lang = (typeof LANGS)[number];

/** A message in every language. */
export type Text = Record<Lang, string>;

export function tx(pt: string, en: string): Text {
  return { pt, en };
}

/** Builds a message by running the same template once per language. */
export function both(f: (lang: Lang) => string): Text {
  return { pt: f("pt"), en: f("en") };
}

/** The same text in every language (names, letters). */
export function same(s: string): Text {
  return { pt: s, en: s };
}
