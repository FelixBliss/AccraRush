import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tokens = readFileSync(new URL("../src/ui/tokens.css", import.meta.url), "utf8");
const components = readFileSync(new URL("../src/ui/components.css", import.meta.url), "utf8");
const preview = readFileSync(new URL("../prototypes/ui-foundation-preview.html", import.meta.url), "utf8");

test("AccraRush UI tokens define the agreed visual palette and layout foundations", () => {
  for (const token of [
    "--ar-color-canvas", "--ar-color-surface", "--ar-color-accent",
    "--ar-color-success", "--ar-color-danger", "--ar-color-text",
    "--ar-space-4", "--ar-radius-lg", "--ar-safe-bottom",
  ]) assert.ok(tokens.includes(token), "missing token " + token);
});

test("shared primitives cover navigation, area selection, garage and driving HUD", () => {
  for (const selector of [
    ".ar-button--primary", ".ar-icon-button", ".ar-chip", ".ar-panel",
    ".ar-area-card", ".ar-vehicle-card", ".ar-swatch", ".ar-meter",
    ".ar-segmented", ".ar-hud", ".ar-speed", ".ar-steering-wheel",
    ".ar-pedal", ".ar-gear",
  ]) assert.ok(components.includes(selector), "missing component " + selector);
});

test("UI foundation preview demonstrates area, vehicle and paint selection", () => {
  for (const feature of [
    "Accra Central", "Osu / Cantonments", "Airport / Labone",
    "Toyota Corolla Taxi", "data-color", "aria-pressed", "Driving HUD components",
  ]) assert.ok(preview.includes(feature), "preview missing " + feature);
});

test("preview is isolated from the production driving prototype", () => {
  assert.ok(preview.includes("../src/ui/tokens.css"));
  assert.ok(preview.includes("../src/ui/components.css"));
  assert.ok(!preview.includes("3d-prototype.html"));
});


test("production game entry loads shared styles and drives from selected OSM geometry", () => {
  const game = readFileSync(new URL("../accrarush.html", import.meta.url), "utf8");
  const landing = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  for (const asset of ["./src/ui/tokens.css", "./src/ui/components.css", "./src/ui/game-integration.css"]) {
    assert.ok(game.includes(asset), "game entry missing " + asset);
  }
  for (const feature of ["ACCRA RUSH", "PLAY GAME", "ar-game-chip", "ar-game-pedal", "ar-game-gear"]) {
    assert.ok(game.includes(feature), "game UI missing " + feature);
  }
  assert.ok(game.includes("loadRoadNetworkRuntime"));
  assert.ok(game.includes("roadRuntime.createTrafficRoute"));
  assert.ok(game.includes("roadRuntime.sample"));
  assert.ok(game.includes("speed/3.6"), "vehicle movement must use metre-based road distance");
  assert.ok(!game.includes("box(160,.15,50000"), "synthetic straight highway must be removed");
  assert.ok(!game.includes("for(let i=0;i<16;i++){addTraffic"), "synthetic highway traffic loop must be removed");
  assert.ok(landing.includes('window.location.replace("./accrarush.html")'), "root entry must redirect directly to the game menu");
  assert.ok(landing.includes('http-equiv="refresh"'), "root entry must provide a no-JavaScript redirect fallback");
  assert.ok(!landing.includes("THE CITY IS YOURS") && !landing.includes("PLAY ACCRA RUSH"), "promotional landing content must be removed");
});

test("Phase 2 menu selects real OSM areas and preserves garage navigation", () => {
  const game = readFileSync(new URL("../accrarush.html", import.meta.url), "utf8");
  const menu = readFileSync(new URL("../src/ui/phase-2-navigation.js", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/ui/phase-2-navigation.css", import.meta.url), "utf8");
  for (const id of ["menu-home", "menu-areas", "menu-garage", "menu-play", "menu-garage-direct", "menu-start-setup", "start", "ar-area-network-choices"]) {
    assert.ok(game.includes('id="' + id + '"'), "missing menu element " + id);
  }
  for (const feature of ["Accra to Labadi", "Lapaz", "Toyota Corolla", "data-paint", "ar-area-network-choices"]) {
    assert.ok(game.includes(feature), "missing setup option " + feature);
  }
  for (const behavior of ["localStorage.setItem", "window.AccraRushMenuConfig", "window.AccraRushApplyVehicleConfig", "function selectArea", "choosePaint", "osm-free-drive", "launch(\"race\")"]) {
    assert.ok(menu.includes(behavior), "missing menu behavior " + behavior);
  }
  assert.ok(styles.includes(".ar-area-grid") && styles.includes(".ar-garage-vehicle"));
  assert.ok(styles.includes("#menu-areas .ar-menu-heading [data-menu-back]") && styles.includes("#menu-areas .ar-menu-heading>div"));
  assert.ok(styles.includes(".ar-action-glow") && styles.includes("box-shadow:0 0 0 1px"));
  assert.ok(menu.includes('document.addEventListener("click"') && menu.includes("taxi-preview"));
  assert.ok(game.includes("./src/ui/phase-2-navigation.css"));
  assert.ok(game.includes("./src/ui/phase-2-navigation.js"));
});

test("Phase 2 visual menu keeps the city backdrop, landscape layout and OSM attribution", () => {
  const game = readFileSync(new URL("../accrarush.html", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/ui/phase-2-navigation.css", import.meta.url), "utf8");
  const theme = readFileSync(new URL("../src/ui/claude-menu-theme.css", import.meta.url), "utf8");
  const menu = readFileSync(new URL("../src/ui/phase-2-navigation.js", import.meta.url), "utf8");
  const scene = readFileSync(new URL("../assets/vehicles/accrarush-main-menu.webp", import.meta.url));
  assert.ok(game.includes('src="./assets/vehicles/accrarush-main-menu.webp"'));
  assert.equal(scene.subarray(0, 4).toString(), "RIFF");
  assert.equal(scene.subarray(8, 12).toString(), "WEBP");
  assert.ok(styles.includes("@media(orientation:portrait)") && styles.includes("#rotateNotice"));
  assert.ok(styles.includes("linear-gradient") && styles.includes("backdrop-filter:blur(8px)"));
  assert.ok(game.includes('class="ar-menu-backdrop"'));
  assert.ok(styles.includes(".ar-menu-screen[hidden]") && styles.includes("display:none!important"));
  assert.ok(game.includes("BLISS INNOVATION · GHANA"), "game menu must use production branding");
  assert.ok(!game.includes("3D TEST"));
  assert.ok(styles.includes(".ar-menu-backdrop") && styles.includes("z-index:0"));
  assert.ok(styles.includes("#startcover.ar-menu-cover::before") && styles.includes("z-index:1"));
  assert.ok(styles.includes("#startcard.ar-menu-card") && styles.includes("z-index:2"));
  assert.ok(styles.includes("background:transparent!important") && styles.includes("pointer-events:none"));
  assert.ok(styles.includes("#menu-home #menu-play") && styles.includes("#menu-home #menu-garage-direct"));
  assert.ok(styles.includes("grid-template-columns:repeat(3,minmax(0,1fr))"));
  assert.ok(menu.includes("ACCRA TO LABADI · OPENSTREETMAP ROAD CORRIDOR"));
  assert.ok(menu.includes('title:"LAPAZ TO MADINA"') && menu.includes('label:"Lapaz to Madina"'));
  assert.ok(game.includes("© OpenStreetMap contributors"), "gameplay must retain OSM attribution");
  assert.ok(!game.includes("openstreetmap.org/export/embed.html") && !game.includes("tile.openstreetmap.org"));
  assert.ok(theme.includes(".ar-road-map-panel") && theme.includes("#ar-road-network-map"));
  assert.ok(styles.includes("white-space:nowrap") && styles.includes("text-overflow:ellipsis"));
  assert.ok(styles.includes("#menu-home>*") && styles.includes("position:static!important"));
  assert.ok(theme.includes("#ar-road-network-map .ar-road-edge") && theme.includes(".ar-road-map-legend"));
  assert.ok(styles.includes("is-entering") && styles.includes("is-leaving"));
  assert.ok(menu.includes("navigationBusy") && menu.includes("requestAnimationFrame") && menu.includes("current.animate") && menu.includes("next.animate"));
  assert.ok(menu.includes("setBaseColorFactor"));
  assert.ok(!game.includes("\\n    <div class=\"ar-menu-screen\""));
});

test("adapted menu logic wires OSM area selection, settings and game launch", () => {
  const game = readFileSync(new URL("../accrarush.html", import.meta.url), "utf8");
  const menu = readFileSync(new URL("../src/ui/phase-2-navigation.js", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/ui/phase-2-navigation.css", import.meta.url), "utf8");
  for (const id of ["menu-home", "menu-areas", "menu-garage", "ar-area-network-choices", "settingsHomeBtn", "closeSettings", "start"]) {
    assert.ok(game.includes('id="' + id + '"'), "missing menu control " + id);
  }
  for (const behavior of ["function selectArea", "window.AccraRushMenuConfig", "localStorage.setItem(\"accrarush.settings\"", "accrarush:start", "launch(\"race\")", "missionHints", "engineSound", "osm-free-drive"]) {
    assert.ok(menu.includes(behavior), "missing menu behavior " + behavior);
  }
  assert.ok(game.includes("window.AccraRushSettings.engineSound===false"));
  assert.ok(game.includes("function playHorn(){if(window.AccraRushSettings&&window.AccraRushSettings.engineSound===false)return;"));
  assert.ok(styles.includes(".ar-settings-panel") && styles.includes(".ar-area-grid") && styles.includes(".ar-garage-vehicle"));
});

test("menu theme preserves the WebP scene, Corolla model and all home actions", () => {
  const game = readFileSync(new URL("../accrarush.html", import.meta.url), "utf8");
  const menu = readFileSync(new URL("../src/ui/phase-2-navigation.js", import.meta.url), "utf8");
  const theme = readFileSync(new URL("../src/ui/claude-menu-theme.css", import.meta.url), "utf8");
  assert.ok(game.includes("./src/ui/claude-menu-theme.css"));
  assert.ok(game.includes('src="./assets/vehicles/accrarush-main-menu.webp"'));
  assert.ok(game.includes('src="./assets/vehicles/accrarush_corolla_taxi.glb"'));
  assert.ok(game.includes("model-viewer.min.js") && game.includes("<model-viewer"));
  const vehicle = readFileSync(new URL("../assets/vehicles/accrarush_corolla_taxi.glb", import.meta.url));
  assert.equal(vehicle.subarray(0, 4).toString(), "glTF");
  assert.ok(menu.includes("setBaseColorFactor"));
  for (const action of ['id="menu-start-setup"', 'id="menu-garage-direct"', 'id="menu-play"', 'id="settingsHomeBtn"']) {
    assert.ok(game.includes(action), "missing home action " + action);
  }
  for (const behavior of ['launch("race")', 'settingsHomeBtn', 'menu-play', 'menu-garage-direct']) {
    assert.ok(menu.includes(behavior), "missing menu wiring " + behavior);
  }
  for (const visual of ["Teko", "Rajdhani", ".ar-rush-home-brand", ".ar-rush-start", ".ar-rush-nav", "#menu-areas .ar-area-grid", "#menu-garage .ar-garage-options"]) {
    assert.ok(theme.includes(visual), "missing menu visual treatment " + visual);
  }
  assert.ok(!game.includes('id="settingsBtn" type="button" aria-label="Open settings">⚙</button>'));
});

test("area menu offers real OSM networks instead of fictional landmark loops", () => {
  const game = readFileSync(new URL("../accrarush.html", import.meta.url), "utf8");
  const menu = readFileSync(new URL("../src/ui/phase-2-navigation.js", import.meta.url), "utf8");
  const theme = readFileSync(new URL("../src/ui/claude-menu-theme.css", import.meta.url), "utf8");
  assert.ok(menu.includes("const roadNetworks=") && menu.includes('"accra-central"') && menu.includes('"lapaz"'));
  assert.ok(menu.includes("function renderRoadNetworkMap") && menu.includes("network.edges.forEach"));
  assert.ok(menu.includes('id:"osm-free-drive"'));
  assert.ok(menu.includes("OPENSTREETMAP · REAL ROAD NETWORK"));
  assert.ok(!menu.includes('label:"ACCRA CENTRAL"') && !menu.includes('label:"LAPAZ"'));
  assert.ok(menu.includes('title:"LAPAZ TO MADINA"') && menu.includes('label:"Lapaz to Madina"') && !menu.includes("Lapaz → Circle"));
  assert.ok(menu.includes("routeNodes:activeRoute?.nodes||[]") && menu.includes("routeEdges:activeRoute?.edges||[]"));
  assert.ok(game.includes('id="ar-area-network-choices"'));
  assert.ok(!game.includes("tile.openstreetmap.org") && !game.includes("api.mapbox.com") && !game.includes("google.com/maps"));
  assert.ok(theme.includes(".ar-road-map-panel") && theme.includes("backdrop-filter:blur(3px)"));
  assert.ok(theme.includes("#menu-garage:not([hidden])") && menu.includes('next.style.display="block"'));
});
