import http from "node:http";
import https from "node:https";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import robotsParser from "robots-parser";
import { cleanUrl, competitionTitle, extractPageEvents, isSocialUrl, isSupportUrl, safePublicUrl, sportFor, textDates, textLocation } from "./event-data.mjs";
import { safeLookup } from "./safety.mjs";

const exec = promisify(execFile);
export const DOCUMENT_LIMIT = 12 * 1024 * 1024;
export const CRAWLER_AGENT = "CompetitionFinderCrawler";
const UA = `${CRAWLER_AGENT}/1.2 (+https://martial-competition-finder.hayboom.chatgpt.site)`;

// No cookies/credentials. Every hop has a DNS guard and a bounded streamed body.
export function fetchPublicBytes(url, { maxBytes = DOCUMENT_LIMIT, timeout = 20000 } = {}) {
  if (!safePublicUrl(url) || isSocialUrl(url) || isSupportUrl(url)) return Promise.reject(new Error("Unsafe source refused"));
  return new Promise((resolve, reject) => {
    const request = (new URL(url).protocol === "https:" ? https : http).get(url, { lookup: safeLookup, headers: { "user-agent": UA, "accept-encoding": "identity" }, signal: AbortSignal.timeout(timeout) }, response => {
      if ([301,302,303,307,308].includes(response.statusCode)) { response.resume(); resolve({ status: response.statusCode, redirect: cleanUrl(response.headers.location, url) }); return; }
      if (response.statusCode !== 200 && response.statusCode !== 404) { response.resume(); reject(new Error(`Source returned HTTP ${response.statusCode}`)); return; }
      if (Number(response.headers["content-length"] || 0) > maxBytes) { response.destroy(); reject(new Error("Source exceeds document size budget")); return; }
      const chunks = []; let size = 0;
      response.on("data", chunk => { size += chunk.length; if (size > maxBytes) { response.destroy(); reject(new Error("Source exceeds document size budget")); } else chunks.push(chunk); });
      response.on("error", reject);
      response.on("end", () => resolve({ status: response.statusCode, bytes: Buffer.concat(chunks), mediaType: String(response.headers["content-type"] || "").split(";")[0] }));
    });
    request.on("error", reject);
  });
}

export class PublicDocuments {
  constructor(fetcher = fetchPublicBytes) { this.fetcher = fetcher; this.robots = new Map(); }
  async allowed(url) {
    const origin = new URL(url).origin;
    if (!this.robots.has(origin)) this.robots.set(origin, (async () => {
      const robotsUrl = `${origin}/robots.txt`;
      let target = robotsUrl;
      for (let i = 0; i < 4; i++) {
        const result = await this.fetcher(target, { maxBytes: 512000 });
        if (result.redirect) { if (new URL(result.redirect).origin !== origin) throw new Error("Cross-origin robots redirect needs review"); target = result.redirect; continue; }
        if (result.status !== 200 && result.status !== 404) throw new Error("Robots policy unavailable");
        return robotsParser(robotsUrl, result.status === 404 ? "" : result.bytes.toString("utf8"));
      }
      throw new Error("Robots redirect limit");
    })());
    const policy = await this.robots.get(origin);
    if (policy.isAllowed(url, CRAWLER_AGENT) === false) throw new Error("Document disallowed by robots.txt");
  }
  async fetch(url) {
    let target = url;
    for (let i = 0; i < 5; i++) {
      if (!safePublicUrl(target) || isSocialUrl(target)) throw new Error("Unsafe document redirect refused");
      await this.allowed(target);
      const result = await this.fetcher(target);
      if (result.redirect) { target = result.redirect; continue; }
      if (result.status !== 200) throw new Error(`Document returned HTTP ${result.status}`);
      return { ...result, url: target };
    }
    throw new Error("Document redirect limit");
  }
}

export function sniffDocument(bytes) {
  if (bytes.subarray(0,5).toString() === "%PDF-") return "application/pdf";
  if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.subarray(0,4).toString() === "RIFF" && bytes.subarray(8,12).toString() === "WEBP") return "image/webp";
  if (["49492a00","4d4d002a"].includes(bytes.subarray(0,4).toString("hex"))) return "image/tiff";
  throw new Error("Not a supported image or PDF (possibly a sign-in or error page)");
}

export async function readDocumentBytes(bytes) {
  if (bytes.length > DOCUMENT_LIMIT) throw new Error("Document too large");
  const mediaType = sniffDocument(bytes), temp = await mkdtemp(path.join(os.tmpdir(), "competition-document-"));
  try {
    const filename = path.join(temp, "input"); await writeFile(filename, bytes, { mode: 0o600 });
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => ["PATH","LANG","LD_LIBRARY_PATH","TESSDATA_PREFIX"].includes(key)));
    const result = await exec(process.env.DOCUMENT_PYTHON || "python3", [fileURLToPath(new URL("read-document.py", import.meta.url)), filename, mediaType], { timeout: 120000, maxBuffer: 3_000_000, env: { ...env, OMP_THREAD_LIMIT: "1" } });
    const document = JSON.parse(result.stdout);
    if (document.error) throw new Error("Document reader failed");
    return { ...document, mediaType };
  } finally { await rm(temp, { recursive: true, force: true }); }
}

export function documentCandidates(page) {
  const candidates = new Map();
  for (const image of page.images || []) {
    const url = cleanUrl(image.src, page.url), description = `${image.alt || ""} ${image.context || ""} ${url || ""}`;
    if (!url || /logo|sponsor|avatar|favicon|icon|badge|banner-ad|tracking|pixel/i.test(description)) continue;
    if (image.width > 0 && image.width < 250 || image.height > 0 && image.height < 180) continue;
    candidates.set(url, { url, title: image.alt || "Page image", score: /flyer|poster|packet|20\d{2}/i.test(description) ? 5 : 1 });
  }
  for (const link of page.links || []) {
    const url = cleanUrl(link.href, page.url);
    if (url && /\.pdf(?:\?|$)|\.(?:png|jpe?g|webp)(?:\?|$)/i.test(url) && /flyer|poster|packet|handbook|prospectus|\.pdf(?:\?|$)/i.test(`${link.label} ${url}`)) candidates.set(url, { url, title: link.label || "Event document", score: /handbook|packet|poster|flyer/i.test(link.label) ? 6 : 3 });
  }
  return [...candidates.values()].sort((a,b) => b.score - a.score);
}

export function documentEvents(document, documentUrl, parent = {}) {
  const events = [], reasons = [];
  for (const page of document.pages) {
    // Read each page independently: never combine two flyers' dates/addresses.
    const text = page.text, title = competitionTitle("", text, parent.contextTitle || "");
    const links = [...(document.links || []), ...text.matchAll(/(?:https?:\/\/|www\.)[^\s<>]+/gi)].map(value => typeof value === "string" ? value : value[0]).map(value => value.replace(/[),.;]+$/, "")).map(value => ({ href: cleanUrl(value.startsWith("www.") ? `https://${value}` : value), label: "Website printed in document" })).filter(link => link.href);
    const result = extractPageEvents({ url: documentUrl, title, html: "", text, links, contextTitle: parent.contextTitle });
    for (const event of result.events) {
      const dateLines = page.lines.filter(line => textDates(line.text) || /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|20\d{2})\b|^\d{1,2}$/.test(line.text)), locationLines = page.lines.filter(line => Object.keys(textLocation(line.text)).length);
      const titleLines = page.lines.filter(line => sportFor(line.text, "") || /championship|tournament|state games/i.test(line.text));
      if (page.method === "tesseract" && (!dateLines.length || !locationLines.length || !titleLines.length || [...dateLines,...locationLines,...titleLines].some(line => line.confidence < 0.75))) { reasons.push("Poster text has low-confidence date, sport, or location; retained for verification"); continue; }
      const parentDates = parent.text ? textDates(parent.text) : null;
      if (parentDates && (parentDates.startDate !== event.startDate || parentDates.endDate !== event.endDate)) { reasons.push("Poster dates conflict with the containing page; no automatic replacement"); continue; }
      const parentLocation = textLocation(parent.text || "");
      const related = parent.url && parentDates && sportFor(parent.title || "", parent.url, parent.text || "") === event.martialArt
        && parentLocation.state === event.state && parentLocation.city?.toLowerCase() === event.city?.toLowerCase();
      event.sourceUrl = related ? parent.url : documentUrl;
      // The document enriches the containing event only when date/sport/place agree.
      // Keeping the same title lets the receiver merge evidence instead of duplicating it.
      if (related) event.title = competitionTitle(parent.title, parent.text, parent.contextTitle);
      event.documents = [{ url: documentUrl, documentType: document.mediaType === "application/pdf" ? "event_packet" : "flyer", title: "Source document", mediaType: document.mediaType }];
      if (document.mediaType.startsWith("image/")) { event.flyerUrl = documentUrl; event.flyerConfidence = 0.87; }
      event.evidence = event.evidence.map(item => ({ ...item, sourceUrl: documentUrl, confidence: page.method === "pdf_text" ? 0.94 : 0.82 }));
      event.evidence.push({ field: "document_page", value: `${page.page} (${page.method})`, sourceUrl: documentUrl, confidence: 1 });
      event.locationConfidence = event.address ? 0.88 : 0.82;
      events.push(event);
    }
    if (!result.events.length) reasons.push(result.reason);
  }
  return { events: [...new Map(events.map(event => [`${event.title}:${event.startDate}:${event.martialArt}`, event])).values()], reason: [...new Set(reasons)].join("; ").slice(0,900) };
}
