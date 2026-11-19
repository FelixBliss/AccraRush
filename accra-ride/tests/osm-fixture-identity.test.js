import test from "node:test";
import assert from "node:assert/strict";
import { isMotorRoad } from "../scripts/import-osm-road-areas.mjs";

test("fixture selection identifies an OSM road by type and way ID, not array position",()=>{
 const elements=[
  {type:"node",id:4,tags:{amenity:"clinic"}},
  {type:"way",id:101,tags:{highway:"primary"}}
 ];
 const road=elements.find(element=>element.type==="way"&&element.id===101);
 assert.equal(isMotorRoad(road),true);
});
