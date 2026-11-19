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

test('HUD appears only after the driving game launch event and hides on menu return', () => {
  assert.match(js, /root\.hidden=true/);
  assert.match(js, /show\(\)\{root\.hidden=false/);
  assert.match(js, /accrarush:start/);
  assert.match(js, /accrarush:show-menu/);
});

test('compact HUD contains only current driving and mission information', () => {
  for (const id of ['arhud-spd','arhud-sign','arhud-gear-value','arhud-time','arhud-earned','arhud-nav-text','arhud-nav-dist']) assert.ok(js.includes(id), id);
  for (const removed of ['arhud-fuel','arhud-xp','arhud-lv','arhud-cb','arhud-eco','RPM ×1000']) assert.ok(!js.includes(removed), removed);
  assert.doesNotMatch(js, /getElementById\(['"](speed|gear|coins|gas|brake|wheel)['"]\)/);
});

test('HUD stays isolated, non-interactive and uses its own preview values', () => {
  assert.match(css, /pointer-events:none/);
  assert.match(css, /left:max\(/);
  assert.match(js, /startDemo\(\)/);
  assert.match(js, /window\.AccraRushStandaloneHUD=\{/);
});
