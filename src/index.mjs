import { BasicCrawler, CheerioCrawler, Configuration, PlaywrightCrawler, RequestQueue, log } from "crawlee";
import { Actor } from "apify";
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { cleanUrl, EVENT_WORDS, extractPageEvents, isSocialUrl, isSupportUrl, jsonEvents, safePublicUrl, SPORTS, sportFor, STATE_GROUPS, STATE_NAMES, strip } from "./event-data.mjs";
import { assertPublicHost, safeLookup } from "./safety.mjs";
import { CloudOutbox, Outbox, receiverHeaders, receiverRequest } from "./delivery.mjs";

import { discoverPageLinks, isDirectoryUrl, isDocumentUrl, officialDirectories, searchQueries } from "./discovery.mjs";
import { documentCandidates, documentEvents, PublicDocuments, readDocumentBytes } from "./documents.mjs";
import { snapshotHtml } from "./snapshot.mjs";
import { readRunOptions, requestBudget, runOutcome } from "./run-policy.mjs";

const ON_APIFY = process.env.APIFY_IS_AT_HOME === "1";
if (ON_APIFY) await Actor.init();
const INPUT = ON_APIFY ? await Actor.getInput() || {} : {};
const VERSION = "1.3.0";
const INGEST_URL = process.env.INGEST_URL || "https://martial-competition-finder.hayboom.chatgpt.site/api/ingest/external";
const TOKEN = process.env.CRAWLER_INGEST_TOKEN;
const DRY_RUN = process.env.DRY_RUN === "1" || INPUT.DRY_RUN === true, SEED_ONLY = process.env.SEED_ONLY === "1" || INPUT.SEED_ONLY === true;
const { region: REGION, pages: MAX_PAGES, discoveryPages: MAX_DISCOVERY_PAGES, documents: MAX_DOCUMENTS, seconds: MAX_RUNTIME_SECONDS } = readRunOptions(process.env, INPUT);
const seedUrls = (process.env.SEED_URLS || INPUT.SEED_URLS || "").split(/[\n,]/).map(value => value.trim()).filter(Boolean);
if (SEED_ONLY && !seedUrls.length && !process.argv.includes("--check-config")) throw new Error("SEED_ONLY requires at least one SEED_URLS entry. Discovery did not run.");
const USER_AGENT = "CompetitionFinderCrawler/1.3 (+https://martial-competition-finder.hayboom.chatgpt.site)";
const storageDir = path.resolve(process.env.CRAWLER_STORAGE_DIR || fileURLToPath(new URL(`../storage/region-${REGION}`, import.meta.url)));
const metadata = { crawlerVersion: VERSION, region: `group-${REGION}` }, headers = receiverHeaders(TOKEN, process.env.SITE_ACCESS_TOKEN);
// v2 starts with clean cloud queues after the old queue accumulated search URLs
// that the provider correctly refused under robots.txt.
const queueSuffix = `v2-${REGION}${DRY_RUN ? "-dry-run" : ""}`;
if (!DRY_RUN && !TOKEN) throw new Error("CRAWLER_INGEST_TOKEN is required. Use DRY_RUN=1 to extract locally without publishing.");
const sendBatch = batch => receiverRequest(INGEST_URL, headers, batch);
const outbox = ON_APIFY
  ? new CloudOutbox(await Actor.openKeyValueStore(`competition-outbox-${queueSuffix}`), sendBatch, metadata)
  : new Outbox(path.join(storageDir, DRY_RUN ? "dry-run-outbox" : "outbox"), sendBatch, metadata);
const config = ON_APIFY ? Actor.config : new Configuration({ purgeOnStart: false, persistStateIntervalMillis: 1000, storageClientOptions: { localDataDirectory: path.join(storageDir, "queues"), persistStorage: true } });
const discoveryQueue = await RequestQueue.open(`discovery-${queueSuffix}`, { config });
const browserQueue = await RequestQueue.open(`browser-${queueSuffix}`, { config });
const documentQueue = await RequestQueue.open(`documents-${queueSuffix}`, { config });
const documentReader = new PublicDocuments();
const now = new Date(), windowKey = Math.floor(now.getTime() / (6 * 3600_000));
const counts = { discoveryExamined: 0, sourcePagesRead: 0, discovered: 0, examined: 0, extracted: 0, failed: 0, inserted: 0, updated: 0, rejected: 0, leadsReceived: 0, documentsExamined: 0, documentEvents: 0, sourceFailures: [] };
const browserEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => ["PATH", "HOME", "TMPDIR", "LANG", "DISPLAY", "XDG_RUNTIME_DIR", "LD_LIBRARY_PATH"].includes(key)));

async function lead(url, title, reason, decision = "needs_review") {
  if (safePublicUrl(url)) await outbox.put("lead", { url, ...(title ? { title: strip(title).slice(0, 240) } : {}), decision, reason });
}
async function enqueue(urlValue, title = "", kind = "event", inheritedSport = null, extra = {}) {
  const url = cleanUrl(urlValue);
  if (!url || isSupportUrl(url)) return;
  if (isSocialUrl(url)) { await lead(url, title, "Public social-media lead; verify from an original organizer or registration source. No login or automated access attempted."); return; }
  try { await assertPublicHost(url); } catch { await lead(url, title, "Source could not be resolved to a permitted public address"); return; }
  const isDocument = kind === "document" || isDocumentUrl(url), queue = isDocument ? documentQueue : browserQueue;
  const result = await queue.addRequest({ url, uniqueKey: `${url}:${windowKey}`, userData: { kind: isDocument ? "document" : kind, title, inheritedSport, ...extra } });
  if (!result.wasAlreadyPresent) { counts.discovered++; if (kind !== "directory") await lead(url, title, isDocument ? "Queued for poster/PDF extraction" : "Queued for an external page check", "pending"); }
}

async function discoverLinks(links, base, kind, inheritedSport, title = "", depth = 0) {
  for (const link of discoverPageLinks(links, base, { kind, sport: inheritedSport, title, depth })) {
    if (link.kind === "document" && kind !== "directory") continue; // Add once below with containing-page evidence.
    await enqueue(link.url, link.title, link.kind, link.inheritedSport, { contextTitle: link.contextTitle, depth: link.depth });
  }
}

async function processPage(snapshot, request) {
  const url = snapshot.url, kind = request.userData.kind;
  if (/security check|access denied|verify (?:you are|you're) human/i.test(snapshot.title)) { await lead(url, snapshot.title, "Source requires an access/security check; no bypass attempted"); counts.sourceFailures.push({ url, reason: "access_check" }); return; }
  counts.sourcePagesRead++;
  await discoverLinks(snapshot.links, url, kind, request.userData.inheritedSport || sportFor(snapshot.title, url), snapshot.title, request.userData.depth || 0);
  const result = extractPageEvents({ ...snapshot, contextTitle: request.userData.contextTitle, allowFallback: kind !== "directory" });
  for (const event of result.events) { await outbox.put("event", event); counts.extracted++; }
  for (const structured of jsonEvents(snapshot.html)) {
    const eventUrl = cleanUrl(structured.url || structured["@id"], url);
    if (eventUrl && eventUrl !== url) await enqueue(eventUrl, structured.name || "", "event", request.userData.inheritedSport);
  }
  if (kind !== "directory") {
    const parent = { url, title: snapshot.title, text: snapshot.text.slice(0,12000), contextTitle: request.userData.contextTitle };
    for (const document of documentCandidates(snapshot)) await enqueue(document.url, document.title, "document", request.userData.inheritedSport, { parent });
    if (!result.events.length) await lead(url, snapshot.title, result.reason);
  }
}

const sharedOptions = {
  maxRequestRetries: 1, useSessionPool: false, retryOnBlocked: false, sameDomainDelaySecs: 2,
  respectRobotsTxtFile: { userAgent: "CompetitionFinderCrawler" },
  onSkippedRequest: async ({ url, reason }) => {
    if (reason === "robotsTxt") await lead(url, "", "Source disallows this crawler in robots.txt; no bypass attempted");
  },
};
const discoveryCrawler = new CheerioCrawler({
  ...sharedOptions, requestQueue: discoveryQueue, maxConcurrency: 3, ...requestBudget(MAX_DISCOVERY_PAGES), requestHandlerTimeoutSecs: 90,
  additionalMimeTypes: ["application/rss+xml", "application/xml", "text/xml"],
  preNavigationHooks: [async ({ request }, options) => {
    await assertPublicHost(request.url);
    options.headers = { ...options.headers, "user-agent": USER_AGENT };
    options.dnsLookup = safeLookup;
    options.followRedirect = response => { const url = cleanUrl(response.headers.location, response.url); return Boolean(url && !isSocialUrl(url) && !isSupportUrl(url)); };
  }],
  async requestHandler({ request, $, body, response }) {
    counts.discoveryExamined++;
    const base = response?.url || request.url;
    if (request.userData.kind === "search") {
      const xml = body.toString();
      for (const item of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
        const url = strip(item[1].match(/<link>([\s\S]*?)<\/link>/i)?.[1] || ""), title = strip(item[1].match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
        if (EVENT_WORDS.test(`${title} ${url}`) || isDocumentUrl(url) || sportFor(title, url)) await enqueue(url, title, isDirectoryUrl(url) ? "directory" : "event", request.userData.sport);
      }
      return;
    }
    const snapshot = snapshotHtml(body.toString(), base);
    await processPage(snapshot, request);
    // Render calendars too: initial HTML may omit their rows.
    await enqueue(base, snapshot.title || "Official calendar", "directory", request.userData.inheritedSport || sportFor("", base));
  },
  failedRequestHandler: async ({ request }) => {
    counts.failed++;
    counts.sourceFailures.push({ url: request.url, reason: "discovery_failed" });
    if (request.userData.kind !== "search") {
      await lead(request.url, request.userData.title, "Lightweight reader could not read this directory; queued for browser rendering");
      await enqueue(request.url, request.userData.title, "directory", request.userData.inheritedSport, { depth: request.userData.depth || 0 });
    }
  },
}, config);

const browserCrawler = new PlaywrightCrawler({
  ...sharedOptions, requestQueue: browserQueue, maxConcurrency: 1, ...requestBudget(MAX_PAGES), navigationTimeoutSecs: 40, requestHandlerTimeoutSecs: 120,
  launchContext: { launcher: chromium, useIncognitoPages: true, launchOptions: { headless: true, chromiumSandbox: true, env: browserEnvironment } },
  browserPoolOptions: { useFingerprints: false, prePageCreateHooks: [(_id, _controller, options) => { if (options) { options.serviceWorkers = "block"; options.userAgent = USER_AGENT; } }] },
  preNavigationHooks: [async ({ page, request }, options) => {
    await assertPublicHost(request.url);
    await page.context().route("**/*", async route => {
      const target = route.request().url();
      if (["image", "media", "font"].includes(route.request().resourceType()) || !safePublicUrl(target) || isSocialUrl(target) || isSupportUrl(target)) return route.abort();
      try { await assertPublicHost(target); await route.continue(); } catch { await route.abort(); }
    });
    options.waitUntil = "domcontentloaded";
  }],
  async requestHandler({ request, page, response }) {
    counts.examined++;
    if (!response || response.status() >= 400) { await lead(request.url, request.userData.title, `Source is unavailable (HTTP ${response?.status() || "unknown"}); no access-control bypass attempted`); return; }
    const url = cleanUrl(page.url());
    if (!url || isSocialUrl(url) || isSupportUrl(url)) return;
    await page.locator("body").waitFor({ state: "attached" });
    // Bounded interaction with public directory controls; never sign in or submit forms.
    if (request.userData.kind === "directory") {
      for (let i = 0; i < 3; i++) {
        const more = page.getByRole("button", { name: /^(?:load more|show more|more events)$/i }).first();
        if (!await more.isVisible().catch(() => false)) break;
        const before = await page.locator("a[href]").count();
        await more.click({ timeout: 4000 });
        await page.waitForFunction(count => document.querySelectorAll("a[href]").length > count, before, { timeout: 5000 }).catch(() => {});
      }
    }
    await processPage(snapshotHtml(await page.content(), url), request);
  },
  failedRequestHandler: async ({ request }) => { counts.failed++; await lead(request.url, request.userData.title, "Browser could not read this source; saved for a later check"); },
}, config);

const documentCrawler = new BasicCrawler({
  requestQueue: documentQueue, maxConcurrency: 1, ...requestBudget(MAX_DOCUMENTS), maxRequestRetries: 1, requestHandlerTimeoutSecs: 180,
  async requestHandler({ request }) {
    counts.documentsExamined++;
    const downloaded = await documentReader.fetch(request.url);
    const document = await readDocumentBytes(downloaded.bytes);
    const result = documentEvents(document, request.url, request.userData.parent || {});
    for (const event of result.events) { await outbox.put("event", event); counts.extracted++; counts.documentEvents++; }
    if (!result.events.length) await lead(request.url, request.userData.title, result.reason || "Document lacks enough confirmed competition information");
    if (document.truncated && !result.events.length) await lead(request.url, request.userData.title, "Only the first six packet pages were inspected; details on later pages remain unverified");
  },
  failedRequestHandler: async ({ request, error }) => { counts.failed++; await lead(request.url, request.userData.title, `Poster/PDF could not be read: ${String(error?.message || "download or OCR failed").slice(0,250)}`); },
}, config);

if (process.argv.includes("--check-config")) {
  log.info("Crawlee configuration loaded; no pages fetched and no data published.");
  if (ON_APIFY) await Actor.exit(); else await config.getStorageClient().teardown?.();
} else {
  const startingSeeds = DRY_RUN ? { candidates: [], sources: [] } : await receiverRequest(`${INGEST_URL}?region=${REGION}`, headers);
  if (!DRY_RUN && (startingSeeds.service !== "competition-finder-external-ingest" || startingSeeds.schemaVersion !== 2)) throw new Error("Receiver version is not ready; deploy it before crawling");
  if (!DRY_RUN) { const delivered = await outbox.flush(); for (const key of ["inserted", "updated", "rejected", "leadsReceived"]) counts[key] += delivered[key]; }
  for (const url of seedUrls) await enqueue(url, "", isDirectoryUrl(url) ? "directory" : "event");
  if (!SEED_ONLY) {
    const existingDiscoveryBacklog = (await discoveryQueue.getInfo())?.pendingRequestCount || 0;
    for (const candidate of startingSeeds.candidates) await enqueue(candidate.url, candidate.title || "", isDirectoryUrl(candidate.url) ? "directory" : "event");
    const directories = [...officialDirectories(now.getFullYear()).filter(source => source.region !== undefined ? source.region === REGION : REGION === 0), ...(REGION === 0 ? startingSeeds.sources.map(source => ({ url: source.url, sport: null })) : [])];
    // Drain previously queued work before starting another search sweep.
    for (const { url, sport } of existingDiscoveryBacklog === 0 ? directories : []) {
      if (new URL(url).hostname.endsWith("bing.com")) continue;
      try { await assertPublicHost(url); await discoveryQueue.addRequest({ url, uniqueKey: `${url}:${windowKey}`, userData: { kind: "directory", inheritedSport: sport } }); } catch { await lead(url, "", "Official directory could not be resolved"); }
    }
    // Bing's public search endpoint disallows this cloud crawler in robots.txt.
    // Keep discovery on original calendars and their linked organizer pages here;
    // the website's separate discovery layer may still enqueue search leads.
    const queries = ON_APIFY ? [] : existingDiscoveryBacklog === 0 ? searchQueries(REGION, now, windowKey) : [];
    for (const { query, sport } of queries) await discoveryQueue.addRequest({ url: `https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`, uniqueKey: `${query}:${windowKey}`, userData: { kind: "search", sport } });
  }
  let timedOut = false;
  const stop = () => { timedOut = true; discoveryCrawler.stop("Runtime budget reached"); browserCrawler.stop("Runtime budget reached"); documentCrawler.stop("Runtime budget reached"); };
  const deadline = setTimeout(stop, MAX_RUNTIME_SECONDS * 1000);
  deadline.unref(); process.once("SIGTERM", stop); process.once("SIGINT", stop);
  try {
    // Reserve time for pages and documents so a large search queue cannot starve OCR.
    async function phase(crawler, fraction) {
      const timer = setTimeout(() => crawler.stop("Phase budget reached; remaining requests retained"), MAX_RUNTIME_SECONDS * 1000 * fraction);
      try { await crawler.run(); } finally { clearTimeout(timer); }
    }
    await phase(discoveryCrawler, 0.25);
    if (!DRY_RUN) { const delivered = await outbox.flush(); for (const key of ["inserted", "updated", "rejected", "leadsReceived"]) counts[key] += delivered[key]; }
    if (!timedOut) await phase(browserCrawler, 0.45);
    if (!timedOut) await phase(documentCrawler, 0.25);
    if (!DRY_RUN) { const delivered = await outbox.flush(); for (const key of ["inserted", "updated", "rejected", "leadsReceived"]) counts[key] += delivered[key]; }
    const outcome = runOutcome(counts);
    if (outcome.failed) process.exitCode = 1;
  } catch (error) {
    process.exitCode = 1;
    throw error;
  } finally {
    clearTimeout(deadline);
    const browserInfo = await browserQueue.getInfo(), discoveryInfo = await discoveryQueue.getInfo();
    const documentInfo = await documentQueue.getInfo();
    const summary = { ...metadata, ...counts, ...runOutcome(counts), timeBudgetSeconds: MAX_RUNTIME_SECONDS, pageCountLimit: MAX_PAGES || null, totalEventLimit: null, documentsRemaining: documentInfo?.pendingRequestCount ?? null, dryRun: DRY_RUN, timedOut, browserPagesRemaining: browserInfo?.pendingRequestCount ?? null, discoveryPagesRemaining: discoveryInfo?.pendingRequestCount ?? null, finishedAt: new Date().toISOString() };
    await mkdir(storageDir, { recursive: true }); await writeFile(path.join(storageDir, "last-run.json"), JSON.stringify(summary, null, 2));
    log.info(JSON.stringify(summary));
    if (ON_APIFY) { await Actor.setValue("OUTPUT", summary); await Actor.exit({ exitCode: process.exitCode || 0 }); } else await config.getStorageClient().teardown?.();
  }
}
