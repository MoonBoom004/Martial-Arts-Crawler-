import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { safePublicUrl } from "./event-data.mjs";

export function receiverHeaders(token, siteAccessToken) {
  return { "content-type": "application/json", authorization: `Bearer ${token}`, ...(siteAccessToken ? { "OAI-Sites-Authorization": `Bearer ${siteAccessToken}` } : {}) };
}

export async function receiverRequest(url, headers, body, fetcher = fetch) {
  if (!safePublicUrl(url) || new URL(url).protocol !== "https:") throw new Error("The receiver must use a public HTTPS URL");
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try {
      response = await fetcher(url, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined, redirect: "error", signal: AbortSignal.timeout(30_000) });
    } catch {
      if (attempt < 2) { await delay(1000 * 2 ** attempt); continue; }
      throw new Error("Receiver could not be reached. Check the host and private-site access token; saved batches remain in the outbox.");
    }
    if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) { await delay(1000 * 2 ** attempt); continue; }
    if (!response.ok) throw new Error(`Receiver rejected the request (HTTP ${response.status}). Saved batches remain in the outbox.`);
    if (!/^application\/json\b/i.test(response.headers.get("content-type") || "")) throw new Error("Receiver returned a sign-in or non-JSON page. Configure SITE_ACCESS_TOKEN; do not make the admin public.");
    return response.json();
  }
}

export class Outbox {
  constructor(directory, send, metadata) { this.directory = directory; this.send = send; this.metadata = metadata; this.tail = Promise.resolve(); }
  serial(action) { const current = this.tail.then(action); this.tail = current.catch(() => {}); return current; }
  put(kind, value) {
    return this.serial(async () => {
      await mkdir(this.directory, { recursive: true });
      const key = createHash("sha256").update(JSON.stringify([kind, value.sourceUrl || value.url, value.startDate, value.martialArt, value.title])).digest("hex");
      const target = path.join(this.directory, `${key}.json`), temporary = `${target}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify({ kind, value }), { mode: 0o600 });
      await rename(temporary, target);
    });
  }
  flush() {
    return this.serial(async () => {
      await mkdir(this.directory, { recursive: true });
      const filenames = (await readdir(this.directory)).filter(name => name.endsWith(".json")).sort();
      const totals = { sent: 0, inserted: 0, updated: 0, rejected: 0, leadsReceived: 0 };
      let batch = { ...this.metadata, events: [], leads: [] }, selected = [];
      const submit = async () => {
        if (!selected.length) return;
        const result = await this.send(batch);
        if (result.received !== batch.events.length || result.leadsReceived !== batch.leads.length) throw new Error("Receiver did not acknowledge the complete batch; outbox retained");
        for (const filename of selected) await unlink(path.join(this.directory, filename));
        totals.sent += batch.events.length;
        for (const key of ["inserted", "updated", "rejected", "leadsReceived"]) totals[key] += Number(result[key] || 0);
        batch = { ...this.metadata, events: [], leads: [] }; selected = [];
      };
      for (const filename of filenames) {
        const entry = JSON.parse(await readFile(path.join(this.directory, filename), "utf8"));
        const field = entry.kind === "event" ? "events" : "leads";
        if (batch[field].length >= (field === "events" ? 20 : 50) || Buffer.byteLength(JSON.stringify(batch)) + Buffer.byteLength(JSON.stringify(entry.value)) > 1_200_000) await submit();
        batch[field].push(entry.value); selected.push(filename);
      }
      await submit();
      return totals;
    });
  }
}

// Named Apify key-value storage survives container replacement. The local disk
// outbox remains the default for servers and GitHub; both use the same ACK rule.
export class CloudOutbox {
  constructor(kv, send, metadata) { this.kv = kv; this.send = send; this.metadata = metadata; this.tail = Promise.resolve(); }
  serial(action) { const current = this.tail.then(action); this.tail = current.catch(() => {}); return current; }
  put(kind, value) {
    return this.serial(async () => {
      const key = "record-" + createHash("sha256").update(JSON.stringify([kind, value.sourceUrl || value.url, value.startDate, value.martialArt, value.title])).digest("hex");
      await this.kv.setValue(key, { kind, value });
    });
  }
  flush() {
    return this.serial(async () => {
      const keys = []; await this.kv.forEachKey(key => { if (key.startsWith("record-")) keys.push(key); });
      const totals = { sent: 0, inserted: 0, updated: 0, rejected: 0, leadsReceived: 0 };
      let batch = { ...this.metadata, events: [], leads: [] }, selected = [];
      const submit = async () => {
        if (!selected.length) return;
        const result = await this.send(batch);
        if (result.received !== batch.events.length || result.leadsReceived !== batch.leads.length) throw new Error("Receiver did not acknowledge the complete batch; cloud outbox retained");
        for (const key of selected) await this.kv.setValue(key, null);
        totals.sent += batch.events.length;
        for (const key of ["inserted", "updated", "rejected", "leadsReceived"]) totals[key] += Number(result[key] || 0);
        batch = { ...this.metadata, events: [], leads: [] }; selected = [];
      };
      for (const key of keys.sort()) {
        const entry = await this.kv.getValue(key); if (!entry) continue;
        const field = entry.kind === "event" ? "events" : "leads";
        if (batch[field].length >= (field === "events" ? 20 : 50) || Buffer.byteLength(JSON.stringify(batch)) + Buffer.byteLength(JSON.stringify(entry.value)) > 1_200_000) await submit();
        batch[field].push(entry.value); selected.push(key);
      }
      await submit(); return totals;
    });
  }
}
