import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const areas = {
  "accra-central": [
    ["Independence Avenue", ["independence avenue", "independence ave"]],
    ["Ring Road Central", ["ring road central", "ring rd central"]],
    ["Ring Road East", ["ring road east", "ring rd east"]],
    ["Ring Road West Road", ["ring road west road", "ring road west", "ring rd west"]],
    ["Kwame Nkrumah Avenue", ["kwame nkrumah avenue", "kwame nkrumah"]]
  ],
  lapaz: [
    ["Nsawam Road", ["nsawam road", "nsawam rd"]],
    ["George Walker Bush Highway", ["george walker bush highway", "george walker bush", "bush highway"]],
    ["Kwashieman–Ofankor Road", ["kwashieman ofankor", "kwashieman", "ofankor road"]],
    ["Achimota Forest Road", ["achimota forest road", "achimota forest"]],
    ["J.A. Kuffour Avenue", ["j a kuffour avenue", "j a kuffour", "kuffour avenue", "kuffour"]]
  ]
};
const normalize = value => String(value || "").toLowerCase().normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

for (const [area, corridors] of Object.entries(areas)) {
  test(area + " full OSM graph contains the five approved featured corridors", async () => {
    const document = JSON.parse(await readFile(new URL("../data/osm/" + area + ".network.json", import.meta.url), "utf8"));
    const network = document.network;
    assert.ok(network.nodes.length > 1000, "the complete area node graph must remain loaded");
    assert.ok(network.edges.length > 10000, "the complete area edge graph must remain loaded");
    const namedEdges = network.edges.filter(edge => edge.osm?.name);
    const missing = corridors.filter(([label, aliases]) =>
      !namedEdges.some(edge => aliases.some(alias => normalize(edge.osm.name).includes(normalize(alias))))
    ).map(([label]) => label);
    assert.deepEqual(missing, [], "featured road names must match real OSM edge metadata");
  });
}

test("menu previews and live minimap consume the full OSM edge graph", async () => {
  const menu = await readFile(new URL("../src/ui/phase-2-navigation.js", import.meta.url), "utf8");
  const hud = await readFile(new URL("../src/ui/standalone-game-hud.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../accrarush.html", import.meta.url), "utf8");
  assert.match(menu, /fetch\("\.\/data\/osm\/\"\+area\+\"\.network\.json"/);
  assert.match(menu, /for\(const edge of edges\)/);
  assert.match(hud, /function setMap\(network,areaId\)/);
  assert.match(hud, /for\(const edge of network\.edges\)/);
  assert.match(hud, /function updateMapPlayer\(pose\)/);
  assert.match(html, /setMap\(roadRuntime\.network,areaId\)/);
  assert.match(html, /headlightsOn:lightsOn,playerPose/);
});
