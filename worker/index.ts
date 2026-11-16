export { GameRoom } from "./room.ts";

const CODE_RE = /^[A-Z]{4}$/;

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    // /api/rooms/:code/ws
    if (parts[0] === "api" && parts[1] === "rooms" && parts[3] === "ws") {
      const code = parts[2]?.toUpperCase();
      if (!CODE_RE.test(code)) return new Response("Código inválido", { status: 400 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      const forward = new URL(request.url);
      forward.searchParams.set("code", code);
      return stub.fetch(new Request(forward, request));
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
