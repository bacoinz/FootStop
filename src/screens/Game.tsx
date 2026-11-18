import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import confetti from "canvas-confetti";
import { FastForward, LogOut, RotateCcw, Trophy } from "lucide-react";
import type { GameView } from "../../shared/engine.ts";
import { getRecord, setRecord } from "../lib/identity.ts";
import { sfx } from "../lib/sound.ts";
import { serverNow, useNow, type RoomApi } from "../lib/useRoom.ts";
import { clockOf } from "../lib/clock.ts";
import { NameTag } from "../components/Brand.tsx";
import { Pitch } from "../components/Pitch.tsx";
import { Center } from "../components/Center.tsx";
import { CategoryCard, Lives, MiniTable, MyClock, roundLabel } from "../components/RoundSide.tsx";
import { KofiButton } from "./Home.tsx";
import { useI18n } from "../lib/i18n.tsx";
import { LeagueTable, StatCards, standings } from "../components/Board.tsx";

/** Sounds for what happens at the table. */
function useGameSounds(view: GameView, now: number) {
  const { t } = useI18n();
  const ev = view.event;
  const lastEvent = useRef(ev?.id ?? 0);
  useEffect(() => {
    if (!ev || ev.id === lastEvent.current) return;
    lastEvent.current = ev.id;
    if (serverNow() - ev.at > 4000) return;
    const mine = ev.playerId === view.me;
    if (ev.kind === "ok") sfx.pass();
    else if (ev.kind === "trump") sfx.trump();
    else if (ev.kind === "pass") sfx.skip();
    else if (ev.kind === "out") sfx.out();
    else if (ev.kind === "life") sfx.life();
    else if (ev.kind === "miss" && mine) sfx.wrong();
    else if (ev.kind === "ambiguous" && mine) sfx.ambiguous();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev?.id]);

  // Whistle at kick-off, a ping when it's my turn.
  const turn = view.round?.turn;
  const started = !!view.round && now >= view.round.startAt;
  const kicked = useRef<number | null>(null);
  useEffect(() => {
    if (view.phase !== "round" || !view.round || !started) return;
    if (kicked.current === view.round.introAt) return;
    kicked.current = view.round.introAt;
    if (now - view.round.startAt < 1500) sfx.kickoff();
  }, [started, view.phase, view.round, now]);
  const lastTurn = useRef<number | null>(null);
  useEffect(() => {
    if (!turn || view.phase !== "round" || !started) return;
    if (lastTurn.current === turn.seq) return;
    lastTurn.current = turn.seq;
    if (turn.playerId === view.me && view.kind === "multi") {
      sfx.turn();
      if (document.hidden) document.title = t.yourTurnTitle;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, started, view.phase, view.me, view.kind]);

  // Accelerating tick-tock in the last 5 seconds.
  const active = view.players.find((p) => p.id === turn?.playerId);
  const left = active && started && !turn?.pausedAt ? clockOf(view, active, now) : null;
  const bucket = left === null || left > 5000 || left <= 0 ? null : left > 3000 ? Math.floor(left / 1000) : left > 1000 ? 100 + Math.floor(left / 500) : 200 + Math.floor(left / 250);
  const lastBucket = useRef<number | null>(null);
  useEffect(() => {
    if (bucket === null) {
      lastBucket.current = null;
      return;
    }
    if (bucket !== lastBucket.current) {
      if (lastBucket.current !== null) sfx.tick();
      lastBucket.current = bucket;
    }
  }, [bucket]);

  // Goal and final whistle at the end of a round.
  const endedAt = view.round?.endedAt;
  const lastEnd = useRef(endedAt);
  useEffect(() => {
    if (!endedAt || endedAt === lastEnd.current) return;
    lastEnd.current = endedAt;
    if (view.kind === "multi") sfx.goal();
  }, [endedAt, view.kind]);

  useEffect(() => {
    const onVis = () => !document.hidden && (document.title = "Footstop");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
}

function Round({ view, api, now }: { view: GameView; api: RoomApi; now: number }) {
  const solo = view.kind === "solo";
  // The ball spins each time a name is accepted.
  const ev = view.event;
  const hop = ev && (ev.kind === "ok" || ev.kind === "trump") ? ev.id : 0;
  return (
    <div className="stage">
      <Pitch
        view={view}
        now={now}
        hop={hop}
        left={(layout) => <CategoryCard view={view} now={now} layout={layout} />}
        right={(layout) => <MyClock view={view} now={now} layout={layout} />}
        below={() => <MiniTable view={view} />}
        center={(layout) => (
          <Center
            view={view}
            now={now}
            layout={layout}
            typing={api.typing}
            onAnswer={(text) => api.raw({ type: "answer", text })}
            onChoose={(qid) => api.raw({ type: "choose", qid })}
            onPass={() => api.send({ type: "pass" })}
            onTrump={() => api.raw({ type: "trump" })}
            onTyping={(text) => !solo && api.raw({ type: "typing", text })}
          />
        )}
      />
    </div>
  );
}

function NextBar({ view, now, total }: { view: GameView; now: number; total: number }) {
  const left = view.roundEndAt ? Math.max(0, view.roundEndAt - now) : 0;
  return (
    <div className="next-bar" aria-hidden>
      <div style={{ width: `${100 - (left / total) * 100}%` }} />
    </div>
  );
}

function RoundEnd({ view, api, now }: { view: GameView; api: RoomApi; now: number }) {
  const r = view.round!;
  const isHost = view.hostId === view.me;
  const { t, tr } = useI18n();
  const promptName = r.prompt.family === "letter" ? t.letterX(tr(r.prompt.title)) : tr(r.prompt.title);
  if (view.kind === "solo") {
    const ev = view.event;
    const why =
      ev?.kind === "life"
        ? ev.reason === "time"
          ? t.timeUp
          : ev.reason === "pass"
            ? t.gaveUp
            : ev.message
              ? tr(ev.message)
              : t.wrongName
        : t.roundLost;
    const lives = view.solo!.lives;
    return (
      <div className="board">
        <motion.div className="winner-banner" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <div className="kicker">{promptName}</div>
          <h2>{why}</h2>
          <div className="round-title">
            {t.soloRoundSummary(r.answers, view.solo!.score)}
          </div>
          <Lives left={lives} total={view.settings.lives} />
          <div className="muted">{t.roundsLeft(lives)}</div>
        </motion.div>
        <NextBar view={view} now={now} total={3500} />
      </div>
    );
  }
  const winner = view.players.find((p) => p.id === r.placements?.[0]);
  const played = view.history.filter((h) => !h.sudden).length;
  const rows = standings(view.players);
  const tieAhead = !r.sudden && played >= view.settings.rounds && rows.length > 1 && rows[1].rank === 1;
  return (
    <div className="board">
      <motion.div className="winner-banner" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <div className="kicker">{roundLabel(view, t)} · {promptName}</div>
        {winner && <NameTag name={winner.name} color={winner.color} />}
        <h2>
          {winner ? (
            <>
              <em>{winner.name}</em> {r.sudden ? t.isChampion : t.winsRound}
            </>
          ) : (
            t.roundOver
          )}
        </h2>
        <div className="round-title">
          {t.namesSaid(r.answers)}
        </div>
      </motion.div>
      {!r.sudden && (
        <div className="paper sheet">
          <span className="tape" />
          <div className="sheet-title">
            {t.table} <small>{played < view.settings.rounds ? t.roundsToPlay(view.settings.rounds - played) : t.lastRound}</small>
          </div>
          <LeagueTable view={view} />
        </div>
      )}
      {tieAhead && <div className="center-text" style={{ fontWeight: 800 }}>{t.tieAhead}</div>}
      <NextBar view={view} now={now} total={12000} />
      <div className="board-actions">
        {isHost ? (
          <button type="button" className="btn btn-white" onClick={() => api.send({ type: "next" })}>
            <FastForward size={18} /> {played >= view.settings.rounds || r.sudden ? t.continue : t.nextRoundBtn}
          </button>
        ) : (
          <span className="muted small">{t.nextSoon}</span>
        )}
      </div>
    </div>
  );
}

function GameEnd({ view, api, leave }: { view: GameView; api: RoomApi; leave: () => void }) {
  const solo = view.kind === "solo";
  const { t } = useI18n();
  const champ = view.players.find((p) => p.id === view.championId);
  const [record, setRec] = useState<{ best: number; isNew: boolean } | null>(null);
  const recordKey = `${view.settings.seconds}-${view.settings.lives}-${view.settings.mode}`;
  const score = view.solo?.score ?? 0;

  useEffect(() => {
    sfx.win();
    if (solo) {
      const prev = getRecord(recordKey);
      const isNew = score > prev;
      if (isNew) setRecord(recordKey, score);
      setRec({ best: Math.max(prev, score), isNew });
      if (!isNew) return;
    }
    const end = Date.now() + 1600;
    const colors = ["#b3122e", "#f1d58a", "#141414", "#f6f0df"];
    const frame = () => {
      confetti({ particleCount: 5, angle: 60, spread: 60, origin: { x: 0 }, colors });
      confetti({ particleCount: 5, angle: 120, spread: 60, origin: { x: 1 }, colors });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.gameNo]);

  const buttons = (
    <div className="board-actions">
      <button type="button" className="btn btn-primary btn-lg" onClick={() => api.send({ type: "rematch" })}>
        <RotateCcw size={18} /> {t.playAgain}
      </button>
      <button type="button" className="btn btn-ghost" onClick={leave}>
        <LogOut size={18} /> {t.leave}
      </button>
    </div>
  );

  if (solo) {
    return (
      <div className="board">
        <motion.div className="winner-banner" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <div className="kicker">{t.gameOver}</div>
          <div className="solo-score">{score}</div>
          <h2>{t.nameWord(score)}</h2>
          {record && (
            <div className="record">
              <Trophy size={18} color="#fff" />
              {record.isNew ? <b>{t.newRecord}</b> : <span className="muted">{t.record(record.best)}</span>}
            </div>
          )}
          <div className="muted small">
            {t.soloSettings(view.settings.seconds, view.settings.lives, t.modeName[view.settings.mode])}
          </div>
        </motion.div>
        {view.stats && view.stats.cards.length > 0 && <StatCards stats={view.stats} view={view} />}
        {buttons}
      </div>
    );
  }

  const top3 = standings(view.players).slice(0, 3);
  const order = [top3[1], top3[0], top3[2]].filter(Boolean);
  return (
    <div className="board">
      <motion.div className="winner-banner" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <div className="kicker">{t.gameOver}</div>
        <h2>
          {champ ? (
            <>
              <em>{champ.name}</em> {t.isChampion}
            </>
          ) : (
            t.gameOver
          )}
        </h2>
      </motion.div>
      <div className="podium">
        {order.map(({ p }) => {
          const place = p.id === top3[0].p.id ? 1 : p.id === top3[1]?.p.id ? 2 : 3;
          return (
            <motion.div key={p.id} className={`podium-col p${place}`} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 + (3 - place) * 0.15 }}>
              <NameTag name={p.name} color={p.color} size={place === 1 ? "md" : "sm"} />
              <span className="podium-name">{p.name}</span>
              <span className="podium-pts">{p.points} {t.pts}</span>
              <div className="podium-block">{place}</div>
            </motion.div>
          );
        })}
      </div>
      <div className="paper sheet">
        <span className="tape" />
        <div className="sheet-title">{t.finalTable}</div>
        <LeagueTable view={view} showMoves={false} />
      </div>
      {view.stats && view.stats.cards.length > 0 && (
        <>
          <div className="kicker center-text">{t.statsTitle}</div>
          <StatCards stats={view.stats} view={view} />
        </>
      )}
      <div className="end-kofi">
        <span>{t.enjoyedIt}</span>
        <KofiButton />
      </div>
      {buttons}
    </div>
  );
}

export function Game({ view, api, leave }: { view: GameView; api: RoomApi; leave: () => void }) {
  const now = useNow(50);
  useGameSounds(view, now);
  // Warn before leaving a game in progress.
  useEffect(() => {
    if (view.phase === "lobby" || view.phase === "gameEnd") return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [view.phase]);

  if (view.phase === "round" && view.round) return <Round view={view} api={api} now={now} />;
  if (view.phase === "roundEnd" && view.round) return <RoundEnd view={view} api={api} now={now} />;
  if (view.phase === "gameEnd") return <GameEnd view={view} api={api} leave={leave} />;
  return null;
}
