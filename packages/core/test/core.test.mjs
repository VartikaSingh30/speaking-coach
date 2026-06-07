// Unit tests for @echo/core pure utilities.
// Run with: npm run test  (builds core, then `node --test`)
// Uses Node's built-in test runner — no extra dependencies.

import test from "node:test";
import assert from "node:assert/strict";

import { rollingWpm, detectFillers, structureScore, scoreSession } from "../dist/index.js";

test("rollingWpm: empty input is 0", () => {
  assert.equal(rollingWpm([]), 0);
});

test("rollingWpm: counts words within the window", () => {
  // 10 words at t=0 over a 10s window => ~60 wpm
  const tokens = [{ t: 0, text: "one two three four five six seven eight nine ten" }];
  assert.equal(rollingWpm(tokens, 10_000), 60);
});

test("rollingWpm: ignores tokens outside the window", () => {
  const tokens = [
    { t: 0, text: "old words that should be ignored" },
    { t: 60_000, text: "ten ten ten ten ten ten ten ten ten ten" }, // 10 words
  ];
  // window 10s ending at 60s -> only the 10 recent words count => 60 wpm
  assert.equal(rollingWpm(tokens, 10_000), 60);
});

test("detectFillers: finds common fillers", () => {
  const hits = detectFillers("um I think like you know it works");
  assert.ok(hits.includes("um"));
  assert.ok(hits.includes("like"));
});

test("detectFillers: clean text returns none", () => {
  assert.deepEqual(detectFillers("a precise and confident answer"), []);
});

test("structureScore: empty transcript is 0", () => {
  assert.equal(structureScore(""), 0);
  assert.equal(structureScore("   "), 0);
});

test("structureScore: bounded 0..100", () => {
  const s = structureScore("Hello world. This is a test.");
  assert.ok(s >= 0 && s <= 100);
});

test("structureScore: well-structured answer beats a one-liner", () => {
  const weak = "yeah idk maybe";
  const strong =
    "First, I scoped the problem and aligned with stakeholders. " +
    "Then I designed a solution because the previous approach was slow. " +
    "For example, I reduced latency by 40 percent in 2 weeks. " +
    "Finally, I documented the rollout. Overall, the team shipped on time.";
  assert.ok(structureScore(strong) > structureScore(weak));
});

test("scoreSession: structure reflects transcript when provided", () => {
  const base = {
    avgWpm: 160,
    fillerPerMin: 2,
    eyeContactPct: 70,
    smilePct: 40,
    pauseMedianMs: 350,
  };
  const withTranscript = scoreSession({
    ...base,
    transcript:
      "First, I led the migration. Then I measured results. For example, errors dropped by 30 percent. Finally, I shared the learnings.",
  });
  const withoutTranscript = scoreSession(base);

  assert.equal(withoutTranscript.structure, 70); // neutral baseline
  assert.ok(withTranscript.total >= 0 && withTranscript.total <= 100);
  assert.ok(withTranscript.structure > 0);
});
