import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const menu = readFileSync(new URL("../src/ui/phase-2-navigation.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/ui/phase-2-navigation.css", import.meta.url), "utf8");
const game = readFileSync(new URL("../accrarush.html", import.meta.url), "utf8");
const hooks = readFileSync(new URL("../docs/GARAGE-SETTINGS-GAMEPLAY-HOOKS.md", import.meta.url), "utf8");

test("garage setup persists a stable playable vehicle ID and paint through launch", () => {
  assert.match(menu, /selectedVehicleId="corolla-taxi"/);
  assert.match(menu, /vehicle:selectedVehicleId/);
  assert.match(menu, /vehicleName:vehicleName\(\)/);
  assert.match(menu, /paint:selectedPaint,paintHex:validPaints\[selectedPaint\]/);
  assert.match(menu, /vehicle:selectedVehicleId,vehicleName:vehicleName\(\)/);
  assert.match(menu, /localStorage\.setItem\("accrarush\.setup"/);
  assert.match(menu, //if\\\(saved\\.version===2\\\|\\\|saved\\.version===3\\\)//);
});

test("garage refuses to select vehicles without an accepted playable manifest", () => {
  assert.match(menu, /vehicleCatalog=\{"corolla-taxi":\{name:"Toyota Corolla Taxi",available:true/);
  assert.match(menu, /if\(!id\|\|!vehicleCatalog\[id\]\?\.available\)return false/);
  assert.match(game, /data-model="corolla-taxi"/);
  assert.match(game, /class="ar-model-choice is-locked"[^>]*aria-disabled="true"/);
  assert.match(hooks, /Do not unlock SUV or Pickup/);
});

test("supported settings are versioned, restored, applied immediately and resettable", () => {
  assert.match(menu, /SETTINGS_VERSION=1/);
  assert.match(menu, //defaultSettings=\\\(\\\)=>\\\(\\\{version:SETTINGS_VERSION,engineSound:true,missionHints:true,steeringSensitivity:1\\\}\\\)//);
  assert.match(menu, //localStorage\\\.getItem\\\("accrarush\\.settings"\\\)//);
  assert.match(menu, /accrarush:settings-changed/);
  assert.match(menu, /window\.AccraRushApplySettings\?\.\(\{\.\.\.settings\}\)/);
  assert.match(menu, /function resetSettings\(\)/);
  assert.match(menu, /installCockpitSettings\(\)/);
  assert.match(menu, /setSteeringMode\?\.\(requested\)/);
  assert.match(menu, /setSteeringSensitivity\?\.\(settings\.steeringSensitivity\)/);
  assert.match(menu, /installSettingsReset\(\)/);
  assert.match(menu, /settings\[key\]=!settings\[key\];applySettings\(\)/);
  assert.match(styles, /\.ar-settings-reset/);
});

test("settings do not advertise unsupported graphics, volume or steering controls", () => {
  assert.doesNotMatch(game, /data-k="(graphics|steeringSensitivity|masterVolume|musicVolume|sfxVolume|controlMode)"/);
  assert.match(hooks, /live muting of an already-running engine sound remains \*\*NOT IMPLEMENTED\*\*/);
  assert.match(hooks, /Keep essential collision, damage, and safety feedback independent/);
  assert.match(hooks, /accrarush:settings-changed/);
  assert.match(hooks, /Tilt permission is requested only after the player explicitly selects Tilt steering/);
});
