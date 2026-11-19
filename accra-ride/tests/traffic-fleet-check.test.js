import test from "node:test";
import assert from "node:assert/strict";
import { stepTrafficFleet, spawnTrafficAgents } from "../src/world/traffic/graph-traffic-agent.js";

test("traffic fleet APIs are exported",()=>{
 assert.equal(typeof stepTrafficFleet,"function");
 assert.equal(typeof spawnTrafficAgents,"function");
});
