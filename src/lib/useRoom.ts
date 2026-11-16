import { tx, type Text } from "../../shared/i18n.ts";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientAction, GameView } from "../../shared/engine.ts";
import type { ClientMessage, ServerMessage } from "../../shared/protocol.ts";
import { getIdentity } from "./identity.ts";

export type ConnStatus = "connecting" | "open" | "closed" | "fatal";

let clockOffset = 0;
/** Current time on the server's clock. */
export const serverNow = () => Date.now() + clockOffset;

export interface Typing {
  playerId: string;
  text: string;
  at: number;
}

export function useRoom(code: string, name: string, solo: boolean) {
  const [view, setView] = useState<GameView | null>(null);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [error, setError] = useState<{ message: Text; at: number } | null>(null);
  const [typing, setTyping] = useState<Typing | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let stopped = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;

    const connect = () => {
      if (stopped) return;
      setStatus("connecting");
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/api/rooms/${code}/ws`);
      wsRef.current = ws;
      let fatal = false;

      ws.onopen = () => {
        retry = 0;
        setStatus("open");
        const { id, token } = getIdentity();
        const hello: ClientMessage = { type: "hello", playerId: id, token, name, solo };
        ws.send(JSON.stringify(hello));
        ws.send(JSON.stringify({ type: "ping" }));
        ping = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ type: "ping" })), 15000);
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as ServerMessage;
        if (msg.type === "state") {
          clockOffset = msg.view.serverNow - Date.now();
          setView(msg.view);
        } else if (msg.type === "typing") {
          setTyping({ playerId: msg.playerId, text: msg.text, at: Date.now() });
        } else if (msg.type === "pong") {
          clockOffset = msg.serverNow - Date.now();
        } else if (msg.type === "error") {
          setError({ message: msg.message, at: Date.now() });
          if (msg.fatal) fatal = true;
        }
      };
      ws.onclose = (ev) => {
        clearInterval(ping);
        if (stopped) return;
        if (fatal || ev.code === 4000 || ev.code === 4001) {
          setStatus("fatal");
          if (ev.code === 4001) setError({ message: tx("Sessão aberta noutro separador.", "Opened in another tab."), at: Date.now() });
          return;
        }
        setStatus("closed");
        retry = Math.min(retry + 1, 6);
        timer = setTimeout(connect, 400 * 2 ** retry);
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(ping);
      wsRef.current?.close();
    };
  }, [code, name, solo]);

  const raw = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);
  const send = useCallback((action: ClientAction) => raw({ type: "action", action }), [raw]);

  return { view, status, error, typing, send, raw };
}

export type RoomApi = ReturnType<typeof useRoom>;

/** Re-renders every `ms` milliseconds; returns server time. */
export function useNow(ms = 100) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
