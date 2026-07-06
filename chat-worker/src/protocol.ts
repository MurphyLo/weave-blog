// Wire contract shared between the ChatRoom Durable Object and the blog's
// <Chat> client component (which imports this file directly). Pure types and
// constants — no worker or DOM dependencies, safe for the client bundle.

export const MAX_MESSAGE_LEN = 280;
export const MAX_NAME_LEN = 24;
export const HISTORY_LIMIT = 100;
export const MIN_INTERVAL_MS = 1000;

export interface ChatMessage {
  id: number;
  name: string;
  text: string;
  ts: number;
}

export type ServerEvent =
  | { type: "init"; messages: ChatMessage[]; online: number; self: string }
  | { type: "message"; m: ChatMessage }
  | {
      type: "presence";
      online: number;
      event: { kind: "join" | "leave"; name: string };
    }
  | { type: "error"; code: "rate_limited" | "too_long" };

export type ClientEvent = { type: "message"; text: string };

// Trim, strip control/zero-width characters, cap length. Returns null when
// nothing usable remains — both sides treat that as an invalid name.
export function sanitizeName(raw: string): string | null {
  const name = raw
    .replace(/[\u0000-\u001f\u007f\u200b-\u200d\u2060\ufeff]/g, "")
    .trim()
    .slice(0, MAX_NAME_LEN);
  return name.length > 0 ? name : null;
}
