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


test("Phase 1C game entry loads shared styles and preserves gameplay JavaScript", () => {
  const game = readFileSync(new URL("../accrarush.html", import.meta.url), "utf8");
  const prototype = readFileSync(new URL("../3d-prototype.html", import.meta.url), "utf8");
  const landing = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  for (const asset of ["./src/ui/tokens.css", "./src/ui/components.css", "./src/ui/game-integration.css"]) {
    assert.ok(game.includes(asset), "game entry missing " + asset);
  }
  for (const feature of ["ACCRA RUSH", "START RACE", "FREE DRIVE", "ar-game-chip", "ar-game-pedal"]) {
    assert.ok(game.includes(feature), "game UI missing " + feature);
  }
  const scriptOf = html => html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1] ?? "";
  const integratedScript = scriptOf(game)
    .replace(/window\.AccraRushApplyVehicleConfig=config=>\{[\s\S]*?\};/, "")
    .replace("body.userData.paintable=true;", "");
  assert.equal(integratedScript, scriptOf(prototype), "driving logic must remain identical apart from the paint adapter");
  assert.ok(landing.includes('window.location.replace("./accrarush.html")'), "root entry must redirect directly to the game menu");
  assert.ok(landing.includes('http-equiv="refresh"'), "root entry must provide a no-JavaScript redirect fallback");
  assert.ok(!landing.includes("THE CITY IS YOURS") && !landing.includes("PLAY ACCRA RUSH"), "promotional landing content must be removed");
});

test("Phase 2 entry provides working menu, area and garage navigation", () => {
  const game = readFileSync(new URL("../accrarush.html", import.meta.url), "utf8");
  const menu = readFileSync(new URL("../src/ui/phase-2-navigation.js", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/ui/phase-2-navigation.css", import.meta.url), "utf8");
  for (const id of ["menu-home", "menu-areas", "menu-garage", "menu-play", "menu-area-next", "start"]) {
    assert.ok(game.includes('id="' + id + '"'), "missing menu element " + id);
  }
  for (const feature of ["Accra Central", "Osu / Cantonments", "Airport / Labone", "Toyota Corolla Taxi", "data-paint", "CONTINUE TO GARAGE", "tile.openstreetmap.org/13/", "ar-area-map", "ar-area-tile", "ar-area-action"]) {
    assert.ok(game.includes(feature), "missing setup option " + feature);
  }
  for (const behavior of ["localStorage.setItem", "window.AccraRushMenuConfig", "window.AccraRushApplyVehicleConfig", "menu-area-next", "choosePaint"]) {
    assert.ok(menu.includes(behavior), "missing menu behavior " + behavior);
  }
  assert.ok(styles.includes(".ar-area-grid") && styles.includes(".ar-garage-vehicle"));
  assert.ok(styles.includes("#menu-areas .ar-menu-heading [data-menu-back]") && styles.includes("#menu-areas .ar-menu-heading>div"), "area back button and heading must occupy separate rows");
  assert.ok(styles.includes(".ar-action-glow") && styles.includes("box-shadow:0 0 0 1px"), "actionable controls must have translucent glowing button treatment");
  assert.ok(menu.includes('document.addEventListener("click"') && menu.includes("taxi-preview"), "menu actions and visible paint preview must be wired");
  assert.ok(game.includes("data-flow-step") && styles.includes(".ar-flow-steps"), "setup journey must show game progression");
  assert.ok(game.includes("./src/ui/phase-2-navigation.css"));
  assert.ok(game.includes("./src/ui/phase-2-navigation.js"));
});

test("Phase 2 visual menu uses the illustrated Accra backdrop and landscape-first layout", () => {
  const game = readFileSync(new URL("../accrarush.html", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/ui/phase-2-navigation.css", import.meta.url), "utf8");
  const menu = readFileSync(new URL("../src/ui/phase-2-navigation.js", import.meta.url), "utf8");
  const scene = readFileSync(new URL("../assets/vehicles/accrarush-main-menu.webp", import.meta.url));
  assert.ok(game.includes('src="./assets/vehicles/accrarush-main-menu.webp"'), "menu scene asset must be referenced by the menu");
  assert.equal(scene.subarray(0, 4).toString(), "RIFF", "menu artwork must be a WebP image");
  assert.equal(scene.subarray(8, 12).toString(), "WEBP", "menu artwork must use WebP encoding");
  assert.ok(styles.includes("@media(orientation:portrait)") && styles.includes("#rotateNotice"), "portrait mode must request landscape orientation");
  assert.ok(styles.includes("linear-gradient") && styles.includes("backdrop-filter:blur(8px)"), "menu should use a subtle artwork overlay and translucent glass items");
  assert.ok(game.includes('src="./assets/vehicles/accrarush-main-menu.webp"'), "uploaded WebP artwork must load through a document-relative image path");
  assert.ok(game.includes('class="ar-menu-backdrop"'), "menu must render the city scene as an explicit image layer");
  assert.ok(styles.includes(".ar-menu-screen[hidden]") && styles.includes("display:none!important"), "inactive menu panels must never overlap or intercept input");
  assert.ok(game.includes("BLISS INNOVATION · ACCRA, GHANA"), "game HUD must use production branding");
  assert.ok(!game.includes("3D TEST"), "test branding must not appear in the game UI");
  assert.ok(styles.includes(".ar-menu-backdrop") && styles.includes("z-index:0"), "backdrop image must occupy the visible background layer");
  assert.ok(styles.includes("#startcover.ar-menu-cover::before") && styles.includes("z-index:1"), "backdrop tint must sit above the image");
  assert.ok(styles.includes("#startcard.ar-menu-card") && styles.includes("z-index:2"), "menu controls must sit above the artwork");
  assert.ok(styles.includes("background:transparent!important") && styles.includes("pointer-events:none"), "the menu container must be visually transparent and let controls float freely");
  assert.ok(styles.includes("#menu-home #menu-play") && styles.includes("#menu-home #menu-garage-direct"), "home actions must be independently positioned across the artwork");
  assert.ok(styles.includes("grid-template-columns:repeat(3,minmax(0,1fr))"), "area choices must use the open full-screen layout");
  assert.ok(game.includes("Map preview of Accra Central") && game.includes("Map preview of Madina / Legon"), "each area must include its own named map preview");
  assert.ok(!game.includes("openstreetmap.org/export/embed.html"), "area previews must not rely on blocked embedded map pages");
  assert.ok(game.includes("© OpenStreetMap"), "map tiles must include attribution");
  assert.ok(!game.includes('loading="lazy"'), "area maps must load eagerly when their hidden screen becomes visible");
  assert.ok(styles.includes(".ar-area-map iframe") && styles.includes("height:100%"), "map iframes must fill a visible map viewport");
  assert.ok(styles.includes("white-space:nowrap") && styles.includes("text-overflow:ellipsis"), "area labels and action tags must remain single-line");
  assert.ok(styles.includes("#menu-home>*") && styles.includes("position:static!important"), "home actions must use a bounded flow layout instead of overlapping absolute positions");
  assert.ok(styles.includes(".ar-area-tile") && styles.includes("object-fit:cover"), "map tiles must fill their map cards");
  assert.ok(styles.includes("is-entering") && styles.includes("is-leaving"), "screen navigation must animate transitions");
  assert.ok(menu.includes("navigationBusy") && menu.includes("requestAnimationFrame") && menu.includes("current.animate") && menu.includes("next.animate"), "screen transitions must animate exit and entry and prevent double navigation");
  assert.ok(menu.includes("data-paint-surface") && menu.includes("surface.setAttribute(\"fill\",hex)"), "every painted SVG body surface must update with the selected colour");
  assert.ok(!game.includes("\\n    <div class=\"ar-menu-screen\""), "menu markup must not contain a literal escaped newline");
});


test("adapted menu logic wires area details, settings and both launch modes", () => {
  const game = readFileSync(new URL("../accrarush.html", import.meta.url), "utf8");
  const menu = readFileSync(new URL("../src/ui/phase-2-navigation.js", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/ui/phase-2-navigation.css", import.meta.url), "utf8");
  for (const id of ["areaName", "areaDesc", "currentAreaLabel", "areaDiff", "settingsBtn", "settingsPanel", "closeSettings", "startRaceBtn", "start"]) {
    assert.ok(game.includes('id="' + id + '"'), "missing adapted menu control " + id);
  }
  for (const behavior of ["function selectArea", "querySelectorAll(\".ar-pin-ring .ring\")", "scrollIntoView", "localStorage.setItem(\"accrarush.settings\"", "accrarush:start", "launch(\"race\")", "missionHints", "engineSound"]) {
    assert.ok(menu.includes(behavior), "missing adapted menu behavior " + behavior);
  }
  assert.ok(game.includes("window.AccraRushSettings.engineSound===false"), "engine audio setting must be respected by gameplay");
  assert.ok(game.includes("function playHorn(){if(window.AccraRushSettings&&window.AccraRushSettings.engineSound===false)return;"), "horn audio setting must be respected by gameplay");
  assert.ok(styles.includes(".ar-settings-panel") && styles.includes(".ar-area-details") && styles.includes(".ar-launch-actions"));
  assert.ok(styles.includes("#menu-garage .ar-launch-actions #start"), "the paired launch buttons must remain in the same flex row");
});

test("Claude-inspired menu theme preserves the WebP scene and exposes all home actions", () => {
  const game = readFileSync(new URL("../accrarush.html", import.meta.url), "utf8");
  const menu = readFileSync(new URL("../src/ui/phase-2-navigation.js", import.meta.url), "utf8");
  const theme = readFileSync(new URL("../src/ui/claude-menu-theme.css", import.meta.url), "utf8");
  assert.ok(game.includes('./src/ui/claude-menu-theme.css'), "Claude visual theme must be loaded");
  assert.ok(game.includes('src="./assets/vehicles/accrarush-main-menu.webp"'), "existing WebP menu background must remain");
  for (const action of ['data-launch-mode="race"', 'data-launch-mode="free"', 'id="menu-garage-direct"', 'id="menu-play"', 'id="settingsHomeBtn"']) {
    assert.ok(game.includes(action), "missing home action " + action);
  }
  for (const behavior of ['data-launch-mode', 'launch(target.dataset.launchMode', 'settingsHomeBtn', 'menuAreaLabel']) {
    assert.ok(menu.includes(behavior), "missing menu wiring " + behavior);
  }
  for (const visual of ["Teko", "Rajdhani", ".ar-rush-home-brand", ".ar-rush-start", ".ar-rush-nav", "#menu-areas .ar-area-grid", "#menu-garage .ar-garage-options"]) {
    assert.ok(theme.includes(visual), "missing Claude visual treatment " + visual);
  }
  assert.ok(!game.includes('id="settingsBtn" type="button" aria-label="Open settings">⚙</button>'), "settings button must not be duplicated");
});
