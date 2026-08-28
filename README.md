# Martial Arts Crawler

## Current status

This repository tests the crawler software. **It is not connected to the website database, and no automatic production schedule is enabled.** GitHub Actions is used for development/testing, not promised as a free permanent production crawler host. See [GitHub Actions terms](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features#actions).

The standalone worker includes a Dockerfile and Apify Actor definition. Apify can run it without using the owner's computer. A successful cloud test and a protected receiver connection must be verified before website updates can occur.

## Free cloud test

Import this repository into a private Apify Actor. Use the Free plan only, no payment method, no paid Store Actors, and no proxies. Build once, then test with `DRY_RUN=true`, `SEED_ONLY=false`, region `0`, all three request caps set to `0`, and a `270` second processing budget. Set the platform run timeout to `300` seconds. Build time is separate.

Apify Free includes a limited monthly allowance, not unlimited compute or storage. When the allowance runs out, work must pause; never upgrade or add overages automatically. Measure actual build/run/storage usage before choosing a recurring schedule. No schedule is enabled by this repository. Named request queues and the named outbox preserve pending work between containers.

Keep website credentials out of source, Actor input, logs, and public artifacts. Configure them only as private environment secrets after a successful test. The dry run requires none and cannot write to the website.

## Time, not a fixed number of events

The diagnostic workflow has no page-count or document-count cutoff. `MAX_PAGES=0`, `MAX_DISCOVERY_PAGES=0`, and `MAX_DOCUMENTS=0` mean keep processing until the time budget is reached. The crawler receives 270 seconds, with a forced process stop by 300 seconds including a grace period. Installation time is outside that crawl budget. Total job timeout remains 20 minutes.

There is no configured total competition limit. This does not mean unlimited compute or storage, or that thousands of websites can be read in five minutes. Concurrency, retries, per-document size, PDF page limits and site politeness remain bounded.

Unfinished requests persist to disk. For manual diagnostic runs, a region-specific GitHub cache restores that disk state; caches can be evicted and are **not durable production storage**. Old queued work is processed before another search sweep. The diagnostic cache and artifacts contain public-source material only; do not add private receiver credentials to this workflow.

## Manual test

Actions → Test competition crawler → Run workflow. Select region 0–4. Region 0 includes official national directories and BODYARMOR State Games, while the other regions rotate state discovery across all six sports. Run again on the same region to continue unfinished diagnostic work.

An empty startup with no links now fails. The summary distinguishes pages read without verified events from actual extracted events and from unreadable-source failures. `sourcePagesRead`, `extracted`, `documentsExamined`, `documentEvents`, and remaining queue counts are included. No events are published in this mode.

## Extraction and verification

Crawlee/Playwright read ordinary HTML and JavaScript-rendered pages. Tesseract reads image posters; PDFPlumber/Poppler read digital/scanned packets. Events require a supported sport, real date and US location, with source evidence. Registration and official details remain separate. Past dates are retained as past events, not silently discarded. Private social pages and access restrictions are not bypassed.

An event title is not an organization. Host names come from structured organizer data, and sanctioning labels require explicit source statements. A registration platform is not automatically a governing body. Ambiguous organizations must not be invented. No paid AI or proxies are used.

## Privacy

Only crawler source is published here. The private website, dashboard, tokens and database are excluded. The manual test has no website credentials and uploads public-source test results with one-day retention. Chromium remains sandboxed and receives a restricted environment.
