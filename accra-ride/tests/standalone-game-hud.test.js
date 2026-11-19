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

test('the original 0–180 km/h instrument-cluster speedometer is retained', () => {
  assert.match(js, /viewBox="0 0 200 200"/);
  assert.match(js, /M28\.99 141\.00A82 82 0 1 1 171\.01 141\.00/);
  assert.match(js, /M97\.2 108L100 42L102\.8 108Z/);
  assert.match(js, /#f2bd42/);
  assert.match(js, /ar-g-num/);
});

test('HUD uses bottom-centre placement and scales the original cluster down by 40 percent', () => {
  assert.match(css, /bottom:max\(7px,env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /translateX\(-50%\) scale\(\.6\)/);
  assert.match(css, /transform-origin:bottom center/);
  assert.match(js, /ar-cl-extra/);
  assert.match(js, /missionTimeReadout/);
  assert.match(js, /earningsReadout/);
  assert.match(js, /navDistanceReadout/);
});

test('HUD indicators are icon-led and remain isolated from gameplay state', () => {
  assert.match(js, /aria-label="Mission countdown"/);
  assert.match(js, /aria-label="Mission earnings"/);
  assert.match(js, /aria-label="Navigation"/);
  assert.match(js, /aria-label="Speed limit"/);
  assert.match(css, /pointer-events:none/);
  assert.match(js, /startDemo\(\)/);
  assert.doesNotMatch(js, /getElementById\(['"](?:speed|gear|coins|gas|brake|wheel)['"]\)/);
  assert.doesNotMatch(js, /MutationObserver|requestAnimationFrame/);
});
