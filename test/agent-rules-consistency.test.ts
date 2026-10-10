import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { lokiResources } from "../packages/mcp/src/index.js";

const rules = readFileSync(
  new URL("../packages/agent-instructions/templates/AGENTS.md", import.meta.url),
  "utf8",
).replace(/\s+/g, " ");
const mcp = lokiResources
  .find((resource) => resource.uri === "loki://docs/integration")!
  .text.replace(/\s+/g, " ");

// Each pair is [what AGENTS.md says, what the MCP integration guide must say].
// A rule edited in one place but not the other fails here.
const shared: Array<[RegExp, RegExp]> = [
  [/every control that commits a match action calls `dispatch\(\)`/, /every control that commits a match action calls dispatch\(\)/],
  [/`await leave\(\)` to completion before/, /await leave\(\) to completion before/],
  [/Start the match from the roster, not from one flag/, /Start the match from the roster, not from one flag/],
  [/Create private room control/, /Create private room control/],
  [/create a fresh `createSynchronizedRoom\(\)` for the next match/, /create a fresh createSynchronizedRoom\(\) for the next match/],
  [/Do not put credentials, access tokens/, /Do not put credentials, access tokens/],
  [/25 MiB/, /25 MiB/],
  [/press Reactivate for this project/, /press Reactivate for this project/],
  [/are placeholders, not a confirmed profile/, /are placeholders, not a confirmed profile/],
  [/Do not infer multiplayer requirements/, /Do not infer player counts/],
  [/Do not invent new `game\.json` fields/, /Do not invent new game\.json fields/],
];

test("MCP integration guide carries the rules in AGENTS.md", () => {
  for (const [inRules, inMcp] of shared) {
    assert.match(rules, inRules);
    assert.match(mcp, inMcp);
  }
});
