import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { getName, newRoomCode, setName } from "../lib/identity.ts";
import { unlockAudio } from "../lib/sound.ts";
import { useI18n } from "../lib/i18n.tsx";
import { StopSign } from "../components/Brand.tsx";
import { LangSelect } from "../components/LangSelect.tsx";
import { RulesModal } from "../components/Rules.tsx";

export const VERSION = "1.0";
export const REPO = "https://github.com/bacoinz/footstop";
const MORE = "https://bacoinz.github.io/";
const KOFI = "https://ko-fi.com/bacoinz";

export function KofiButton() {
  const { t } = useI18n();
  return (
    <a className="kofi-btn" href={KOFI} target="_blank" rel="noopener">
      <KofiCup />
      <span>{t.support}</span>
    </a>
  );
}

function KofiCup() {
  return (
    <svg viewBox="0 0 32 24" width="26" height="20" aria-hidden>
      <path
        fill="#fff"
        d="M2 2.5C2 1.7 2.7 1 3.5 1h19c.8 0 1.5.7 1.5 1.5V5h1.6C28.6 5 31 7.4 31 10.4s-2.4 5.4-5.4 5.4H23.6C22.4 19.9 18.7 23 14.3 23h-3C6.1 23 2 18.9 2 13.7V2.5zm22 5.7v4.4h1.6c1.2 0 2.2-1 2.2-2.2s-1-2.2-2.2-2.2H24z"
      />
      <path fill="#ff5e5b" d="M13 18.2l-4.6-4.3C6.6 12.2 6.9 9.3 9 8.4c1.4-.6 2.9 0 4 1.2 1.1-1.2 2.6-1.8 4-1.2 2.1.9 2.4 3.8.6 5.5L13 18.2z" />
    </svg>
  );
}

function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden>
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}

/** GitHub, version and bug reports. */
export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="home-footer">
      <a className="foot-link" href={REPO} target="_blank" rel="noopener">
        <GithubMark />
        <span>GitHub</span>
      </a>
      <span className="foot-version">v{VERSION}</span>
      <a className="foot-link" href={`${REPO}/issues/new/choose`} target="_blank" rel="noopener">
        {t.foundBug}
      </a>
    </footer>
  );
}

export function Home({ go, initialCode }: { go: (code: string, solo: boolean) => void; initialCode?: string }) {
  const { t } = useI18n();
  const [name, setNameState] = useState(getName());
  const [code, setCode] = useState(initialCode ?? "");
  const [rules, setRules] = useState(false);
  const [error, setError] = useState(false);
  const valid = name.trim().length > 0;

  const enter = (c: string, solo = false) => {
    if (!valid) {
      setError(true);
      document.getElementById("home-name")?.focus();
      return;
    }
    unlockAudio();
    setName(name.trim());
    go(c, solo);
  };

  return (
    <main className="home">
      <div className="home-lang">
        <LangSelect />
      </div>
      <motion.header className="home-brand" initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }}>
        <span className="home-sign">
          <StopSign size={72} />
        </span>
        <h1 className="home-title">
          <span>Foot</span>
          <span className="home-red">Stop</span>
        </h1>
        <p className="home-sub">{t.tagline}</p>
      </motion.header>

      <motion.section className="home-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <label className="home-label" htmlFor="home-name">
          {t.yourName}
        </label>
        <input
          id="home-name"
          className={`home-input ${error && !valid ? "bad" : ""}`}
          value={name}
          maxLength={16}
          placeholder={t.namePlaceholder}
          autoComplete="nickname"
          spellCheck={false}
          onChange={(e) => {
            setNameState(e.target.value);
            setError(false);
          }}
          onKeyDown={(e) => e.key === "Enter" && (code.length === 4 ? enter(code) : enter(newRoomCode()))}
        />
        <button type="button" className="home-btn home-btn-main" onClick={() => enter(newRoomCode())}>
          <span aria-hidden>＋</span> {t.createRoom}
        </button>
        <p className="home-sep">{t.orJoin}</p>
        <form
          className="home-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === 4) enter(code);
          }}
        >
          <input
            className="home-input home-code"
            value={code}
            maxLength={4}
            placeholder={t.code}
            aria-label={t.roomCode}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
          />
          <button type="submit" className="home-btn home-btn-ghost" disabled={code.length !== 4}>
            {t.join}
          </button>
        </form>
      </motion.section>

      <div className="home-buttons">
        <button type="button" className="home-btn home-btn-outline" onClick={() => enter(newRoomCode(), true)}>
          {t.playSolo}
        </button>
        <button type="button" className="home-btn home-btn-outline" onClick={() => setRules(true)}>
          {t.howToPlay}
        </button>
      </div>

      <div className="home-support">
        <KofiButton />
        <a className="home-more" href={MORE} target="_blank" rel="noopener">
          {t.otherGames}
          <ArrowUpRight size={14} aria-hidden />
        </a>
      </div>

      <Footer />
      <AnimatePresence>{rules && <RulesModal onClose={() => setRules(false)} />}</AnimatePresence>
    </main>
  );
}
