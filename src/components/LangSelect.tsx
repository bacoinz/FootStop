import { LANGS, type Lang } from "../../shared/i18n.ts";
import { useI18n } from "../lib/i18n.tsx";

const NAMES: Record<Lang, string> = { pt: "Português", en: "English" };

/** Language picker (top right of the home screen, and in the room's top bar). */
export function LangSelect({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useI18n();
  return (
    <select className="lang-select" value={lang} aria-label={`${t.language} / Language`} title={t.language} onChange={(e) => setLang(e.target.value as Lang)}>
      {LANGS.map((l) => (
        <option key={l} value={l}>
          {compact ? l.toUpperCase() : NAMES[l]}
        </option>
      ))}
    </select>
  );
}
