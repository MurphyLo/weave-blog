import { ChatRoom } from "./chat-room";

export { ChatRoom };

interface Env {
  CHAT_ROOM: DurableObjectNamespace;
  ALLOWED_ORIGINS: string;
}

// Standalone chat backend for the weave blog (see ../README.md). One fixed
// room, one endpoint: GET /ws with a WebSocket upgrade. Browsers always send
// an Origin header on WebSocket requests; reject origins outside the
// allowlist so other sites can't embed this room.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/ws") {
      return new Response("not found", { status: 404 });
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const origin = request.headers.get("Origin") ?? "";
    const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
    if (!allowed.includes(origin)) {
      return new Response("forbidden origin", { status: 403 });
    }
    const room = env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName("lobby"));
    return room.fetch(request);
  },
} satisfies ExportedHandler<Env>;
