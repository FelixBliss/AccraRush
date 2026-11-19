import test from "node:test";
import assert from "node:assert/strict";
import { buildRoadMapModel, matchPlayerToRoad } from "../src/world/navigation/road-map-model.js";

test("minimap graph module exports callable projection and matching APIs",()=>{
 assert.equal(typeof buildRoadMapModel,"function");
 assert.equal(typeof matchPlayerToRoad,"function");
});
