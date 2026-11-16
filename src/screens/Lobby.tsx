import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, Crown, Heart, Layers, Play, Repeat, Timer, UserX } from "lucide-react";
import { LIVES_OPTIONS, MAX_PLAYERS, ROUNDS_OPTIONS, SECONDS_OPTIONS, type ClientAction, type GameView, type Mode } from "../../shared/engine.ts";
import { unlockAudio } from "../lib/sound.ts";
import { NameTag } from "../components/Brand.tsx";
import { useI18n } from "../lib/i18n.tsx";

function Options<T extends string | number>({
  icon,
  label,
  options,
  value,
  disabled,
  onPick,
}: {
  icon: React.ReactNode;
  label: string;
  options: { value: T; label: string }[];
  value: T;
  disabled: boolean;
  onPick: (v: T) => void;
}) {
  return (
    <div className="setting">
      <span>
        {icon} {label}
      </span>
      <div className="chips">
        {options.map((o) => (
          <button type="button" key={String(o.value)} disabled={disabled} className={`chip-opt ${value === o.value ? "on" : ""}`} onClick={() => onPick(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Lobby({ view, send }: { view: GameView; send: (a: ClientAction) => void }) {
  const isHost = view.hostId === view.me;
  const { t } = useI18n();
  const MODES: { value: Mode; label: string }[] = [
    { value: "mixed", label: t.modeMixed },
    { value: "letters", label: t.modeLetters },
    { value: "categories", label: t.modeCategories },
  ];
  const solo = view.kind === "solo";
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}/sala/${view.code}`;
  const connected = view.players.filter((p) => p.connected);
  const st = view.settings;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  const settings = (
    <div className="panel">
      <div className="panel-title">{t.options} {!isHost && <span className="muted small">{t.hostPicks}</span>}</div>
      <Options
        icon={<Timer size={16} />}
        label={t.secondsLabel}
        options={SECONDS_OPTIONS.map((s) => ({ value: s as number, label: s === 60 ? "1 min" : `${s} s` }))}
        value={st.seconds}
        disabled={!isHost}
        onPick={(seconds) => send({ type: "settings", seconds })}
      />
      {solo ? (
        <Options
          icon={<Heart size={16} />}
          label={t.livesLabel}
          options={LIVES_OPTIONS.map((n) => ({ value: n as number, label: String(n) }))}
          value={st.lives}
          disabled={!isHost}
          onPick={(lives) => send({ type: "settings", lives })}
        />
      ) : (
        <Options
          icon={<Repeat size={16} />}
          label={t.roundsLabel}
          options={ROUNDS_OPTIONS.map((n) => ({ value: n as number, label: String(n) }))}
          value={st.rounds}
          disabled={!isHost}
          onPick={(rounds) => send({ type: "settings", rounds })}
        />
      )}
      <Options icon={<Layers size={16} />} label={t.modeLabel} options={MODES} value={st.mode} disabled={!isHost} onPick={(mode) => send({ type: "settings", mode })} />
    </div>
  );

  const start = () => {
    unlockAudio();
    send({ type: "start" });
  };

  if (solo) {
    return (
      <div className="lobby">
        <motion.div className="panel lobby-code" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="kicker">{t.soloGame}</div>
          <h2 style={{ fontFamily: "var(--display)", fontWeight: 400, fontSize: "2.2rem", margin: 0 }}>{t.soloHeadline}</h2>
          <p className="muted" style={{ margin: 0 }}>
            {t.soloIntro}
          </p>
        </motion.div>
        {settings}
        <motion.button type="button" className="btn btn-primary btn-lg btn-start" onClick={start} whileTap={{ scale: 0.96 }}>
          <Play size={22} /> {t.startGame}
        </motion.button>
      </div>
    );
  }

  return (
    <div className="lobby">
      <motion.div className="panel lobby-code" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="kicker">{t.roomCode}</div>
        <div className="big-code">
          {view.code.split("").map((l, i) => (
            <motion.span key={i} initial={{ rotateX: 90 }} animate={{ rotateX: 0 }} transition={{ delay: i * 0.08 }}>
              {l}
            </motion.span>
          ))}
        </div>
        <button type="button" className="btn" onClick={copy}>
          {copied ? <Check size={18} /> : <Copy size={18} />} {copied ? t.copied : t.copyLink}
        </button>
        <div className="muted small">{link}</div>
      </motion.div>

      <div className="panel">
        <div className="panel-title">
          {t.players} <span className="muted">{connected.length}/{MAX_PLAYERS}</span>
        </div>
        <ul className="lobby-players">
          <AnimatePresence>
            {view.players.map((p) => (
              <motion.li key={p.id} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: p.connected ? 1 : 0.45, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <span className="lp-name">
                  <NameTag name={p.name} color={p.color} />
                  {p.id === view.me && <span className="you"> {t.you}</span>}
                </span>
                {!p.connected && <span className="muted small">{t.offline}</span>}
                {view.hostId === p.id && (
                  <span className="tag">
                    <Crown size={12} /> {t.host}
                  </span>
                )}
                {isHost && p.id !== view.me && (
                  <button type="button" className="icon-btn" title={t.kick} onClick={() => send({ type: "kick", playerId: p.id })}>
                    <UserX size={16} />
                  </button>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        {connected.length < 2 && <div className="muted small" style={{ marginTop: 10 }}>{t.needTwo}</div>}
      </div>

      {settings}

      {isHost ? (
        <motion.button type="button" className="btn btn-primary btn-lg btn-start" disabled={connected.length < 2} onClick={start} whileTap={{ scale: 0.96 }}>
          <Play size={22} /> {t.startGame}
        </motion.button>
      ) : (
        <div className="muted center-text">{t.waitingHost}</div>
      )}
    </div>
  );
}
