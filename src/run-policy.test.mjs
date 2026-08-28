import test from "node:test";
import assert from "node:assert/strict";
import { readRunOptions, requestBudget, runOutcome } from "./run-policy.mjs";
test("time-only processing omits request caps, including numeric zero input", () => {
 const options=readRunOptions({}, {MAX_PAGES:0,MAX_DISCOVERY_PAGES:0,MAX_DOCUMENTS:0});
 for (const n of [options.pages,options.discoveryPages,options.documents]) assert.deepEqual(requestBudget(n),{});
 assert.equal(options.seconds,300);
 assert.deepEqual(requestBudget(20),{maxRequestsPerCrawl:20});
});
test("invalid budgets fail rather than becoming unbounded", () => {
 for (const v of ['-1','NaN','1.5','']) assert.throws(()=>readRunOptions({MAX_PAGES:v}));
 assert.throws(()=>readRunOptions({MAX_RUNTIME_SECONDS:'0'}));
});
test("no-op and blocked scans are failures; verified emptiness is distinct", () => {
 assert.equal(runOutcome({}).failed,true);
 assert.equal(runOutcome({discoveryExamined:20,sourcePagesRead:0}).failed,true);
 assert.equal(runOutcome({sourcePagesRead:2,extracted:0}).outcome,'sources_read_no_verified_events');
 assert.equal(runOutcome({documentEvents:1,extracted:1}).outcome,'events_extracted');
});
