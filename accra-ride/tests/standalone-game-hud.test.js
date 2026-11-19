import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../accrarush.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../src/ui/standalone-game-hud.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/ui/standalone-game-hud.css', import.meta.url), 'utf8');

test('standalone HUD assets load on the real game entry, not the menu landing page', () => {
  assert.match(html, /standalone-game-hud\.css/);
  assert.match(html, /standalone-game-hud\.js/);
  assert.doesNotMatch(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /standalone-game-hud/);
});

test('HUD becomes visible only after the player starts the driving game', () => {
  assert.match(html, /active=true;reset\(\);window\.AccraRushStandaloneHUD\?\.show\(\)/);
  assert.match(js, /root\.hidden=true/);
  assert.match(js, /show\(\)\{root\.hidden=false/);
  assert.match(js, /accrarush:show-menu/);
});

test('HUD uses isolated IDs and does not bind to game movement, speed, gear or score state', () => {
  assert.match(js, /arhud-spd/);
  assert.match(js, /arhud-gear/);
  assert.doesNotMatch(js, /getElementById\(['"](speed|gear|coins|gas|brake|wheel)['"]\)/);
  assert.doesNotMatch(js, /\b(speed|steer|gas|brake|player|traffic)\s*=/);
  assert.match(js, /startDemo\(\)/);
});

test('HUD is a non-interactive overlay and keeps its own demo data', () => {
  assert.match(css, /pointer-events:none/);
  assert.match(js, /HUD\.update\(\{speed:s,rpm:/);
  assert.match(js, /window\.AccraRushStandaloneHUD=\{show/);
});
