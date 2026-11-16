// Loads the player database (a static asset) once per isolate.

import { PlayerDb, type DbFile } from "../shared/db.ts";

let loading: Promise<PlayerDb> | null = null;

export function loadDb(assets: Fetcher): Promise<PlayerDb> {
  if (!loading) {
    loading = (async () => {
      const started = Date.now();
      // Any host works for the binding; "localhost" also passes the dev server's host check.
      const res = await assets.fetch("http://localhost/data/players.bin");
      if (!res.ok || !res.body) throw new Error(`players.bin: HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      // Gzip magic number: the file is stored compressed (some servers may already have inflated it).
      const body = bytes[0] === 0x1f && bytes[1] === 0x8b ? new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")) : new Blob([bytes]).stream();
      const file = (await new Response(body).json()) as DbFile;
      const db = new PlayerDb(file);
      console.log(`player db: ${db.size} players, ${file.categories.length} prompts, ${Date.now() - started} ms`);
      return db;
    })();
    loading.catch((e) => {
      console.error("player db failed", e);
      loading = null;
    });
  }
  return loading;
}
