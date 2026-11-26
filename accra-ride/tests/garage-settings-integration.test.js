import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const menu = readFileSync(new URL("../src/ui/phase-2-navigation.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/ui/phase-2-navigation.css", import.meta.url), "utf8");
const game = readFileSync(new URL("../accrarush.html", import.meta.url), "utf8");
const hooks = readFileSync(new URL("../docs/GARAGE-SETTINGS-GAMEPLAY-HOOKS.md", import.meta.url), "utf8");

test("garage setup persists a stable playable vehicle ID and paint through launch", () => {
  for (const token of [
    'selectedVehicleId="corolla-taxi"',
    "vehicle:selectedVehicleId",
    "vehicleName:vehicleName()",
    "paint:selectedPaint,paintHex:validPaints[selectedPaint]",
    'localStorage.setItem("accrarush.setup"',
    "if(saved.version===2||saved.version===3)",
  ]) assert.ok(menu.includes(token), "missing garage contract " + token);
});

test("garage refuses to select vehicles without an accepted playable manifest", () => {
  for (const token of [
    'vehicleCatalog={"corolla-taxi":{name:"Toyota Corolla Taxi",available:true',
    "if(!id||!vehicleCatalog[id]?.available)return false",
  ]) assert.ok(menu.includes(token), "missing vehicle availability guard " + token);
  assert.ok(game.includes('data-model="corolla-taxi"'));
  assert.ok(game.includes('class="ar-model-choice is-locked" aria-disabled="true"'));
  assert.ok(hooks.includes("Do not unlock SUV or Pickup"));
});

test("supported settings are versioned, restored, applied immediately and resettable", () => {
  for (const token of [
    "SETTINGS_VERSION=1",
    "defaultSettings=()=>({version:SETTINGS_VERSION,engineSound:true,missionHints:true,steeringSensitivity:1})",
    'localStorage.getItem("accrarush.settings")',
    "accrarush:settings-changed",
    "window.AccraRushApplySettings?.({...settings})",
    "function resetSettings()",
    "installCockpitSettings()",
    "setSteeringMode?.(requested)",
    "setSteeringSensitivity?.(settings.steeringSensitivity)",
    "installSettingsReset()",
    "settings[key]=!settings[key];applySettings()",
  ]) assert.ok(menu.includes(token), "missing settings contract " + token);
  assert.ok(styles.includes(".ar-settings-reset"));
});

test("settings do not advertise unsupported graphics or volume controls", () => {
  for (const token of ['data-k="graphics"', 'data-k="masterVolume"', 'data-k="musicVolume"', 'data-k="sfxVolume"']) {
    assert.ok(!game.includes(token), "unsupported setting must not be exposed: " + token);
  }
  assert.ok(hooks.includes("live muting of an already-running engine sound remains **NOT IMPLEMENTED**"));
  assert.ok(hooks.includes("Keep essential collision, damage, and safety feedback independent"));
  assert.ok(hooks.includes("accrarush:settings-changed"));
  assert.ok(hooks.includes("Tilt permission is requested only after the player explicitly selects Tilt steering"));
});
