function randomId(len = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, len);
}

// "?p=2" gives a separate identity so one browser can play as several people (handy for testing).
const slot = new URLSearchParams(location.search).get("p") ?? "";

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key + slot);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key + slot, value);
  } catch {}
}

let memoryId: { id: string; token: string } | null = null;

export function getIdentity(): { id: string; token: string } {
  const id = safeGet("fst.id");
  const token = safeGet("fst.token");
  if (id && token) return { id, token };
  memoryId ??= { id: randomId(), token: randomId(24) };
  safeSet("fst.id", memoryId.id);
  safeSet("fst.token", memoryId.token);
  return memoryId;
}

export function getName(): string {
  return safeGet("fst.name") ?? "";
}

export function setName(name: string) {
  safeSet("fst.name", name);
}

export function getMuted(): boolean {
  return safeGet("fst.muted") === "1";
}

export function setMuted(m: boolean) {
  safeSet("fst.muted", m ? "1" : "0");
}

export function newRoomCode(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => letters[b % letters.length]).join("");
}

/** Solo record per settings combination (seconds/lives/mode). */
export function getRecord(key: string): number {
  return Number(safeGet(`fst.record.${key}`) ?? 0) || 0;
}

export function setRecord(key: string, score: number) {
  safeSet(`fst.record.${key}`, String(score));
}
