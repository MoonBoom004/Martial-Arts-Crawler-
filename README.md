# Martial Arts Crawler — first free-hosting test

Standalone crawler code only. No private website source, credentials, database export, or previous Git history is included.

## Upload to GitHub

Extract this ZIP on a computer. Upload its contents (not the ZIP itself) into the root of `MoonBoom004/Martial-Arts-Crawler-`. The root must contain package.json, package-lock.json, requirements.txt, src, and .github/workflows/test-crawler.yml.

If your file picker hides .github, create a file in GitHub named `.github/workflows/test-crawler.yml` and paste the contents of that file from the download. Commit to the default branch.

## First run

Open Actions, choose Test competition crawler, then Run workflow. This is manual only: there is no recurring schedule and no database connection. Do not add credentials yet.

The job uses a standard Linux runner and refuses to run in a private repository. Keep paid runner types and paid storage overages disabled in GitHub billing settings. Artifact retention is one day. Check current GitHub free-use terms; no unlimited-resource promise is made.

The first run checks a small subset of official sources, with up to 20 browser pages, 15 discovery pages, and 5 documents. Crawl work is bounded to roughly five minutes; dependencies and browser installation add time. The entire job stops after 20 minutes. This is a hosting smoke test, not nationwide coverage.

Download public-source-test-results from the completed run. Extracted information is from public pages and may be visible to repository visitors. This test has no private database access. A failure or empty result needs inspection; green status alone does not prove good coverage.

## Next stage

Only after reviewing this test should a protected connection to the website and recurring scans be configured. Persistent queue storage still needs a privacy-safe setup for public GitHub runs; do not upload private receiver queues or cache credentials. This package intentionally has no persistent cache or schedule.

## Capabilities and limits

Crawlee and Playwright read HTML and JavaScript pages. Tesseract scans images, and PDFPlumber/Poppler read digital and scanned packets. Rules validate sports, dates, and US locations. Source robots rules and access restrictions are respected. No paid AI, proxy service, or Apify account is required for this GitHub test. The Apify library is installed for compatibility but not activated here.

OCR and the source websites can fail. PDF reading is bounded to the first six pages. This does not guarantee every US competition or access to blocked websites.
