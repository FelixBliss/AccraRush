import test from "node:test";
import assert from "node:assert/strict";
import { findRoute } from "../src/world/navigation/route-service.js";

test("navigation route API remains available to the road network build",()=>{
 assert.equal(typeof findRoute,"function");
});
