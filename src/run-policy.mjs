export function readRunOptions(env = {}, input = {}) {
  function integer(name, fallback, min, max) {
    const raw = env[name] ?? input[name] ?? fallback;
    const value = Number(raw);
    if (raw === "" || !Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
    return value;
  }
  return {
    region: integer("REGION", 0, 0, 4),
    // Zero means time-bounded processing without a per-run request count cap.
    pages: integer("MAX_PAGES", 0, 0, 1000000),
    discoveryPages: integer("MAX_DISCOVERY_PAGES", 0, 0, 1000000),
    documents: integer("MAX_DOCUMENTS", 0, 0, 1000000),
    seconds: integer("MAX_RUNTIME_SECONDS", 300, 30, 2400),
  };
}
export function requestBudget(count) {
  if (!Number.isInteger(count) || count < 0) throw new Error("Invalid request budget");
  return count === 0 ? {} : { maxRequestsPerCrawl: count };
}
export function runOutcome(counts) {
  if (!(counts.sourcePagesRead > 0 || counts.documentEvents > 0)) return { outcome: "no_readable_sources", failed: true };
  return { outcome: counts.extracted > 0 ? "events_extracted" : "sources_read_no_verified_events", failed: false };
}
