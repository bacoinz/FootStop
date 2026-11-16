import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, SkipForward } from "lucide-react";
import { PASS_PENALTY_MS, REVEAL_MS, SPIN_MS, type GameView } from "../../shared/engine.ts";
import { sfx } from "../lib/sound.ts";
import type { Typing } from "../lib/useRoom.ts";
import { Face } from "./Brand.tsx";
import { CenterWheel } from "./CenterWheel.tsx";
import type { PitchLayout } from "./Pitch.tsx";
import { useI18n } from "../lib/i18n.tsx";

/** The last thing that happened at the table, shown briefly (no list of names, ever). */
function Flash({ view, now }: { view: GameView; now: number }) {
  const ev = view.event;
  const who = (id: string) => view.players.find((p) => p.id === id)?.name ?? "?";
  const { t, tr } = useI18n();
  let content: React.ReactNode = null;
  if (ev && now - ev.at < 2400) {
    if (ev.kind === "ok")
      content = (
        <span className="flash flash-ok">
          {ev.image ? <Face src={ev.image} size={22} /> : <Check size={15} />} {ev.name}
          {ev.delta ? <b> +{ev.delta} s</b> : null}
        </span>
      );
    else if (ev.kind === "trump")
      content = (
        <span className="flash flash-trump">
          <span className="trump-mini">T</span> {t.trumpOf(who(ev.playerId))} {ev.name}
        </span>
      );
    else if (ev.kind === "pass") content = <span className="flash flash-bad">{t.passed(who(ev.playerId), PASS_PENALTY_MS / 1000)}</span>;
    else if (ev.kind === "out") content = <span className="flash flash-bad">{t.ranOut(who(ev.playerId))}</span>;
    else if (ev.kind === "choose" && ev.playerId !== view.me) content = <span className="flash flash-muted">{t.choosing(who(ev.playerId))}</span>;
    else if ((ev.kind === "miss" || ev.kind === "ambiguous") && ev.playerId !== view.me) content = <span className="flash flash-muted">{tr(ev.message)}</span>;
  }
  return (
    <AnimatePresence mode="popLayout">
      {content && (
        <motion.div key={ev!.id} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          {content}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Inside the centre circle: the wheel during the draw, then the countdown, then the answer box
 * with the pass button below. Enter answers, Esc passes, 1-3 picks an option.
 */
export function Center({
  view,
  now,
  layout,
  typing,
  onAnswer,
  onChoose,
  onPass,
  onTrump,
  onTyping,
}: {
  view: GameView;
  now: number;
  layout: PitchLayout;
  typing: Typing | null;
  onAnswer: (text: string) => void;
  onChoose: (qid: number) => void;
  onPass: () => void;
  onTrump: () => void;
  onTyping: (text: string) => void;
}) {
  const r = view.round!;
  const solo = view.kind === "solo";
  const { t: tt, tr } = useI18n();
  const me = view.players.find((p) => p.id === view.me);
  const turn = r.turn;
  const current = view.players.find((p) => p.id === turn?.playerId);
  const myTurn = view.phase === "round" && turn?.playerId === view.me;
  const started = now >= r.startAt;
  const t = now - r.introAt;
  const spinning = !started && t < SPIN_MS + REVEAL_MS;
  const count = Math.max(1, Math.ceil((r.startAt - now) / 1000));
  const checking = !!turn?.checking;
  const choice = myTurn ? turn?.choice : null;
  const canType = myTurn && started && !checking && !!me?.alive;
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; amb: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 5-4-3-2-1 beeps once the wheel has stopped.
  const lastCount = useRef(0);
  useEffect(() => {
    if (started || t < SPIN_MS || count === lastCount.current) return;
    lastCount.current = count;
    sfx.count();
  }, [started, t, count]);

  // New turn for me: empty box, focus.
  const turnKey = myTurn ? `${turn!.seq}` : "";
  useEffect(() => {
    if (!turnKey) return;
    setText("");
    setMessage(null);
    setPending(false);
  }, [turnKey]);
  useEffect(() => {
    if (canType) inputRef.current?.focus();
  }, [canType, turnKey]);

  // Results of my answers.
  const ev = view.event;
  useEffect(() => {
    if (!ev || ev.playerId !== view.me) return;
    setPending(false);
    if (ev.kind === "miss" || ev.kind === "ambiguous") {
      setMessage({ text: ev.message ? tr(ev.message) : tt.notValid, amb: ev.kind === "ambiguous" });
      inputRef.current?.animate(
        [{ transform: "translateX(0)" }, { transform: "translateX(-9px)" }, { transform: "translateX(8px)" }, { transform: "translateX(-5px)" }, { transform: "translateX(0)" }],
        { duration: 320 },
      );
      requestAnimationFrame(() => inputRef.current?.select());
    } else if (ev.kind === "choose") {
      setMessage(null);
    } else if (ev.kind === "ok" || ev.kind === "trump") {
      setText("");
      setMessage(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev?.id]);

  // Safety net if an answer never comes back.
  useEffect(() => {
    if (!pending) return;
    const tm = setTimeout(() => setPending(false), 4000);
    return () => clearTimeout(tm);
  }, [pending]);

  const relay = (value: string) => {
    clearTimeout(typingTimer.current);
    const wait = 70 - (Date.now() - lastTyping.current);
    const fire = () => {
      lastTyping.current = Date.now();
      onTyping(value);
    };
    if (wait <= 0) fire();
    else typingTimer.current = setTimeout(fire, wait);
  };

  const submit = () => {
    const value = text.trim();
    if (!canType || pending || !value) return;
    setPending(true);
    setMessage(null);
    onAnswer(value);
  };

  const pick = (qid: number) => {
    if (!canType || pending) return;
    setPending(true);
    onChoose(qid);
  };

  if (!started) {
    return (
      <div className="cc cc-intro">
        {spinning ? (
          <CenterWheel round={r} d={layout.d} stopped={t >= SPIN_MS} />
        ) : (
          <AnimatePresence mode="popLayout">
            <motion.div key={count} className="countdown" initial={{ scale: 1.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.25 }}>
              {count}
            </motion.div>
          </AnimatePresence>
        )}
        {!spinning && <div className="cc-ready">{r.turn?.playerId === view.me ? tt.youStart : tt.starts(current?.name ?? "…")}</div>}
      </div>
    );
  }

  const live = typing && typing.playerId === turn?.playerId && !myTurn ? typing.text : "";
  const value = myTurn ? text : live;
  const placeholder = !me?.inRound
    ? tt.nextRound
    : !me.alive && !solo
      ? tt.youreOut(current?.name ?? "…")
      : myTurn
        ? tt.typePlayer
        : tt.turnOf(current?.name ?? "…");

  return (
    <div className="cc" style={{ ["--d" as string]: `${layout.d}px` }}>
      <div className="cc-who">{myTurn ? tt.itsYourTurn : current ? tt.isPlaying(current.name) : ""}</div>
      <div className="paper-strip">
        <input
          ref={inputRef}
          className={`cc-input ${canType ? "mine" : ""} ${live ? "live" : ""}`}
          style={live && current ? { color: current.color } : undefined}
          value={value}
          readOnly={!canType}
          placeholder={placeholder}
          maxLength={60}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="send"
          aria-label={tt.playerName}
          onChange={(e) => {
            if (!canType) return;
            setText(e.target.value);
            setMessage(null);
            relay(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape" && canType) {
              e.preventDefault();
              onPass();
            } else if (choice && /^[1-3]$/.test(e.key)) {
              e.preventDefault();
              const o = choice.options[Number(e.key) - 1];
              if (o) pick(o.qid);
            }
          }}
        />
        {pending && <span className="spinner cc-spinner" />}
      </div>

      <div className="cc-msg">
        {checking ? (
          <span className="flash flash-muted">
            <Loader2 size={14} className="spin" /> {tt.checking(turn!.checking!)}
          </span>
        ) : choice ? (
          <span className="choose-q">{tt.didYouMean}</span>
        ) : message && myTurn ? (
          <span className={`turn-msg ${message.amb ? "amb" : ""}`}>{message.text}</span>
        ) : (
          <Flash view={view} now={now} />
        )}
      </div>

      {choice && (
        <div className="choices">
          {choice.options.map((o, i) => (
            <button type="button" key={o.qid} className="choice" onClick={() => pick(o.qid)} disabled={!canType}>
              <span className="choice-key">{i + 1}</span>
              <Face src={o.image} size={30} />
              <span className="choice-text">
                <b>{o.name}</b>
                {o.hint && <small>{tr(o.hint)}</small>}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="cc-actions" style={{ visibility: myTurn ? "visible" : "hidden" }}>
        <button type="button" className="btn btn-sm btn-paper" disabled={!canType} onClick={onPass}>
          <SkipForward size={16} /> {solo ? tt.giveUp : tt.pass(PASS_PENALTY_MS / 1000)}
        </button>
        {me?.trump && !solo && (
          <button type="button" className="btn btn-sm btn-trump" disabled={!canType} onClick={onTrump} title={tt.trumpHint}>
            <span className="trump-mini">T</span> {tt.trump}
          </button>
        )}
      </div>
    </div>
  );
}
