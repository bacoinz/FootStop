import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BookOpen, Loader2, LogOut, Volume2, VolumeX, WifiOff } from "lucide-react";
import { getMuted, getName, setMuted } from "./lib/identity.ts";
import { setSoundMuted } from "./lib/sound.ts";
import { useRoom } from "./lib/useRoom.ts";
import { Home } from "./screens/Home.tsx";
import { Lobby } from "./screens/Lobby.tsx";
import { Game } from "./screens/Game.tsx";
import { roundLabel } from "./components/RoundSide.tsx";
import { RulesModal } from "./components/Rules.tsx";
import { Logo } from "./components/Brand.tsx";
import { LangSelect } from "./components/LangSelect.tsx";
import { useI18n } from "./lib/i18n.tsx";

interface Route {
  code: string;
  solo: boolean;
}

function parseRoute(): Route | null {
  const m = /^\/(sala|room|solo)\/([A-Za-z]{4})\/?$/.exec(location.pathname);
  return m ? { code: m[2].toUpperCase(), solo: m[1] === "solo" } : null;
}

export default function App() {
  const [route, setRoute] = useState<Route | null>(parseRoute);
  const [name, setNameState] = useState(getName());

  useEffect(() => {
    const onPop = () => setRoute(parseRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = (r: Route | null) => {
    history.pushState(null, "", (r ? `/${r.solo ? "solo" : "sala"}/${r.code}` : "/") + location.search);
    setNameState(getName());
    setRoute(r);
  };

  if (!route || !name) return <Home go={(code, solo) => go({ code, solo })} initialCode={route && !route.solo ? route.code : undefined} />;
  return <Room key={`${route.code}-${route.solo}`} code={route.code} solo={route.solo} name={name} leave={() => go(null)} />;
}

function Room({ code, solo, name, leave }: { code: string; solo: boolean; name: string; leave: () => void }) {
  const api = useRoom(code, name, solo);
  const { t, tr } = useI18n();
  const { view, status, error } = api;
  const [muted, setMutedState] = useState(getMuted());
  const [rules, setRules] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    setToast(tr(error.message));
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [error]);

  const toggleMute = () => {
    setMuted(!muted);
    setSoundMuted(!muted);
    setMutedState(!muted);
  };

  const inGame = view && view.phase !== "lobby";
  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="brand-sm" onClick={leave} title={t.leave}>
          <Logo size={30} />
        </button>
        <div className="pill">{view?.kind === "solo" || solo ? t.solo : <>{t.room} <b>{code}</b></>}</div>
        {inGame && view.round && view.phase !== "gameEnd" && <div className="pill hide-sm">{roundLabel(view, t)}</div>}
        <div className="top-actions">
          {status !== "open" && status !== "fatal" && (
            <span className="conn">
              <WifiOff size={16} /> {t.connecting}
            </span>
          )}
          <LangSelect compact />
          <button type="button" className="icon-btn" onClick={() => setRules(true)} title={t.howToPlay}>
            <BookOpen size={20} />
          </button>
          <button type="button" className="icon-btn" onClick={toggleMute} title={muted ? t.soundOn : t.soundOff}>
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
          <button type="button" className="icon-btn" onClick={leave} title={t.leaveRoom}>
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {status === "fatal" ? (
        <div className="fatal panel">
          <h2>{t.cantJoin}</h2>
          <p>{tr(error?.message)}</p>
          <button type="button" className="btn btn-primary" onClick={leave}>
            {t.backHome}
          </button>
        </div>
      ) : !view ? (
        <div className="loading">
          <Loader2 className="spin" size={40} />
          <span>{t.entering(solo, code)}</span>
        </div>
      ) : view.phase === "lobby" ? (
        <Lobby view={view} send={api.send} />
      ) : (
        <Game view={view} api={api} leave={leave} />
      )}

      <AnimatePresence>
        {toast && (
          <motion.div className="toast" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{rules && <RulesModal onClose={() => setRules(false)} />}</AnimatePresence>
    </div>
  );
}
