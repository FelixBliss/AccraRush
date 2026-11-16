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
