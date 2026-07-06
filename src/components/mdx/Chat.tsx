"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import NumberFlow from "@number-flow/react";

import {
  MAX_MESSAGE_LEN,
  MAX_NAME_LEN,
  sanitizeName,
  type ChatMessage,
  type ServerEvent,
} from "../../../chat-worker/src/protocol";

// Live chat room backed by the standalone `weave-chat` worker (see
// chat-worker/): one Durable Object holds the room, this component only
// draws the UI and keeps a WebSocket open. Embed inside <Demo> for the
// data-atomic contract.

const CHAT_ORIGIN =
  process.env.NEXT_PUBLIC_CHAT_ORIGIN ??
  (process.env.NODE_ENV === "development"
    ? "http://localhost:8788"
    : "https://chat.xinghan.me");

type Entry =
  | { kind: "msg"; m: ChatMessage }
  | { kind: "sys"; key: string; text: string };

type Phase = "gate" | "connecting" | "open" | "reconnecting" | "offline";

const MAX_RECONNECT_DELAY_MS = 8000;

export function Chat() {
  const [phase, setPhase] = useState<Phase>("gate");
  const [nameDraft, setNameDraft] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [online, setOnline] = useState(0);
  const [draft, setDraft] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(false);

  const selfRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const attemptsRef = useRef(0);
  const everOpenedRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const lastSentRef = useRef("");

  useEffect(() => {
    setNameDraft(localStorage.getItem("chat:name") ?? "");
    return () => {
      unmountedRef.current = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      wsRef.current?.close();
    };
  }, []);

  const flashHint = (text: string) => {
    setHint(text);
    setTimeout(() => setHint(null), 1600);
  };

  const connect = useCallback((name: string) => {
    if (unmountedRef.current) return;
    setPhase(everOpenedRef.current ? "reconnecting" : "connecting");
    const ws = new WebSocket(
      `${CHAT_ORIGIN.replace(/^http/, "ws")}/ws?name=${encodeURIComponent(name)}`,
    );
    wsRef.current = ws;

    ws.onmessage = (e) => {
      let event: ServerEvent;
      try {
        event = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (event.type === "init") {
        everOpenedRef.current = true;
        attemptsRef.current = 0;
        selfRef.current = event.self;
        setEntries(event.messages.map((m) => ({ kind: "msg", m })));
        setOnline(event.online);
        setPhase("open");
      } else if (event.type === "message") {
        const m = event.m;
        setEntries((prev) => [...prev, { kind: "msg", m }]);
      } else if (event.type === "presence") {
        const { name: who, kind } = event.event;
        setOnline(event.online);
        setEntries((prev) => [
          ...prev,
          {
            kind: "sys",
            key: `sys-${Date.now()}-${Math.random()}`,
            text: `${who} ${kind === "join" ? "joined" : "left"}`,
          },
        ]);
      } else if (event.type === "error") {
        if (event.code === "rate_limited") {
          setDraft((d) => d || lastSentRef.current);
          flashHint("Slow down — one message per second.");
        } else {
          flashHint(`Messages are capped at ${MAX_MESSAGE_LEN} characters.`);
        }
      }
    };

    ws.onclose = () => {
      if (unmountedRef.current || wsRef.current !== ws) return;
      wsRef.current = null;
      if (!everOpenedRef.current && attemptsRef.current >= 2) {
        setPhase("offline");
        return;
      }
      const delay = Math.min(
        MAX_RECONNECT_DELAY_MS,
        1000 * 2 ** attemptsRef.current,
      );
      attemptsRef.current += 1;
      setPhase(everOpenedRef.current ? "reconnecting" : "connecting");
      retryTimerRef.current = setTimeout(() => connect(name), delay);
    };
  }, []);

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const name = sanitizeName(nameDraft);
    if (!name) return;
    localStorage.setItem("chat:name", name);
    attemptsRef.current = 0;
    everOpenedRef.current = false;
    connect(name);
  };

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    const ws = wsRef.current;
    if (!text || cooldown || phase !== "open" || ws?.readyState !== 1) return;
    ws.send(JSON.stringify({ type: "message", text }));
    lastSentRef.current = text;
    setDraft("");
    setCooldown(true);
    setTimeout(() => setCooldown(false), 1000);
  };

  // Follow new messages unless the reader scrolled up.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const nearBottom =
      list.scrollHeight - list.scrollTop - list.clientHeight < 64;
    if (nearBottom) list.scrollTop = list.scrollHeight;
  }, [entries]);
  useEffect(() => {
    const list = listRef.current;
    if (phase === "open" && list) list.scrollTop = list.scrollHeight;
  }, [phase]);

  const status =
    phase === "open" ? null : phase === "offline"
      ? "Chat backend is offline."
      : phase === "gate"
        ? null
        : phase === "reconnecting"
          ? "Reconnecting…"
          : "Connecting…";

  return (
    <div className="chat">
      <div className="chat-header">
        <span className="chat-title">lobby</span>
        {phase === "open" ? (
          <span className="chat-status">
            <span className="chat-dot" />
            <NumberFlow value={online} /> online
          </span>
        ) : (
          <span className="chat-status">{status}</span>
        )}
      </div>

      {phase === "gate" || phase === "offline" ? (
        <div className="chat-gate">
          {phase === "offline" ? (
            <>
              <p className="chat-gate-note">
                Chat backend is offline right now.
              </p>
              <button
                type="button"
                className="chat-join-button"
                onClick={() => {
                  attemptsRef.current = 0;
                  const name = sanitizeName(nameDraft);
                  if (name) connect(name);
                  else setPhase("gate");
                }}
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <p className="chat-gate-note">Pick a name to join the chat.</p>
              <form className="chat-gate-form" onSubmit={join}>
                <input
                  className="chat-name-input"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  maxLength={MAX_NAME_LEN}
                  placeholder="Your name"
                  aria-label="Nickname"
                />
                <button
                  type="submit"
                  className="chat-join-button"
                  disabled={!sanitizeName(nameDraft)}
                >
                  Join
                </button>
              </form>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="chat-messages" ref={listRef}>
            {entries.length === 0 && (
              <p className="chat-empty">No one has said anything yet.</p>
            )}
            {entries.map((entry) =>
              entry.kind === "sys" ? (
                <p key={entry.key} className="chat-sys">
                  {entry.text}
                </p>
              ) : (
                <motion.p
                  key={entry.m.id}
                  className="chat-msg"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  title={new Date(entry.m.ts).toLocaleTimeString()}
                >
                  <span
                    className="chat-msg-name"
                    data-self={String(entry.m.name === selfRef.current)}
                  >
                    {entry.m.name}
                  </span>
                  {entry.m.text}
                </motion.p>
              ),
            )}
          </div>
          <form className="chat-input-row" onSubmit={send}>
            <input
              className="chat-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={MAX_MESSAGE_LEN}
              placeholder="Say something…"
              disabled={phase !== "open"}
              aria-label="Message"
            />
            <span className="chat-meta" data-hint={String(hint !== null)}>
              {hint ??
                (draft.length > MAX_MESSAGE_LEN - 40
                  ? `${MAX_MESSAGE_LEN - draft.length}`
                  : "")}
            </span>
            <motion.button
              type="submit"
              className="chat-send"
              disabled={!draft.trim() || cooldown || phase !== "open"}
              whileTap={{ scale: 0.92 }}
              aria-label="Send"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </motion.button>
          </form>
        </>
      )}
    </div>
  );
}
