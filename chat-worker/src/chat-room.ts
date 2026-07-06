import { DurableObject } from "cloudflare:workers";

import {
  HISTORY_LIMIT,
  MAX_MESSAGE_LEN,
  MIN_INTERVAL_MS,
  sanitizeName,
  type ChatMessage,
  type ClientEvent,
  type ServerEvent,
} from "./protocol";

interface Attachment {
  name: string;
  lastMsgTs: number;
}

// Single chat room. Uses the WebSocket Hibernation API so idle connections
// cost nothing, and SQLite storage so the last HISTORY_LIMIT messages
// survive hibernation/eviction. Per-connection state (name, rate-limit
// timestamp) lives in the WebSocket attachment, which also survives
// hibernation.
interface Env {
  CHAT_ROOM: DurableObjectNamespace;
  ALLOWED_ORIGINS: string;
}

export class ChatRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS messages (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         name TEXT NOT NULL,
         text TEXT NOT NULL,
         ts INTEGER NOT NULL
       )`,
    );
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const name = sanitizeName(
      new URL(request.url).searchParams.get("name") ?? "",
    );
    if (!name) {
      return new Response("invalid name", { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ name, lastMsgTs: 0 } satisfies Attachment);

    this.send(server, {
      type: "init",
      messages: this.history(),
      online: this.ctx.getWebSockets().length,
      self: name,
    });
    this.broadcast(
      {
        type: "presence",
        online: this.ctx.getWebSockets().length,
        event: { kind: "join", name },
      },
      server,
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string") return;
    let event: ClientEvent;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }
    if (event.type !== "message" || typeof event.text !== "string") return;

    const text = event.text.trim();
    if (text.length === 0) return;
    if (text.length > MAX_MESSAGE_LEN) {
      return this.send(ws, { type: "error", code: "too_long" });
    }

    const attachment = ws.deserializeAttachment() as Attachment;
    const now = Date.now();
    if (now - attachment.lastMsgTs < MIN_INTERVAL_MS) {
      return this.send(ws, { type: "error", code: "rate_limited" });
    }
    ws.serializeAttachment({ ...attachment, lastMsgTs: now } satisfies Attachment);

    const row = this.ctx.storage.sql
      .exec(
        "INSERT INTO messages (name, text, ts) VALUES (?, ?, ?) RETURNING id",
        attachment.name,
        text,
        now,
      )
      .one();
    this.ctx.storage.sql.exec(
      `DELETE FROM messages WHERE id NOT IN
         (SELECT id FROM messages ORDER BY id DESC LIMIT ?)`,
      HISTORY_LIMIT,
    );

    this.broadcast({
      type: "message",
      m: { id: Number(row.id), name: attachment.name, text, ts: now },
    });
  }

  async webSocketClose(ws: WebSocket) {
    this.announceLeave(ws);
  }

  async webSocketError(ws: WebSocket) {
    this.announceLeave(ws);
  }

  private announceLeave(ws: WebSocket) {
    const attachment = ws.deserializeAttachment() as Attachment | null;
    if (!attachment) return;
    this.broadcast(
      {
        type: "presence",
        online: this.ctx.getWebSockets().length - 1,
        event: { kind: "leave", name: attachment.name },
      },
      ws,
    );
  }

  private history(): ChatMessage[] {
    return this.ctx.storage.sql
      .exec(
        `SELECT id, name, text, ts FROM messages
         ORDER BY id DESC LIMIT ?`,
        HISTORY_LIMIT,
      )
      .toArray()
      .reverse() as unknown as ChatMessage[];
  }

  private send(ws: WebSocket, event: ServerEvent) {
    try {
      ws.send(JSON.stringify(event));
    } catch {
      // Connection already gone; close/error handler does the bookkeeping.
    }
  }

  private broadcast(event: ServerEvent, except?: WebSocket) {
    const payload = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try {
        ws.send(payload);
      } catch {
        // Skip dead sockets.
      }
    }
  }
}
