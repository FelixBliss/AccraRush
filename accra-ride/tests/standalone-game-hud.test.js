import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../accrarush.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../src/ui/standalone-game-hud.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/ui/standalone-game-hud.css', import.meta.url), 'utf8');

test('HUD assets load on the real game entry only', () => {
  assert.match(html, /standalone-game-hud\.css/);
  assert.match(html, /standalone-game-hud\.js/);
  assert.doesNotMatch(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /standalone-game-hud/);
});

test('legacy top readouts are hidden and the replacement cluster is top-centred', () => {
  assert.match(css, /body\.ar-screen>#hud,body\.ar-screen>#mission\{display:none!important\}/);
  assert.match(css, /left:50%;top:max\(7px,env\(safe-area-inset-top\)\)/);
  assert.match(css, /translateX\(-50%\) scale\(\.6\)/);
});

test('speed, gear, distance, coins and traffic signal are connected to live game state', () => {
  assert.match(html, /AccraRushStandaloneHUD\?\.update\(\{speed:Math\.abs\(speed\),gear:reverse\?'R':'D',tripDistance:driveDistance,coins,signal:lightPhase,signalDistance:junctionDistance\}\)/);
  assert.match(js, /d\.speed/);
  assert.match(js, /d\.tripDistance/);
  assert.match(js, /d\.gear/);
  assert.match(js, /d\.coins/);
  assert.match(js, /d\.signal/);
});

test('demo values and unavailable countdown/navigation/speed-limit indicators are removed', () => {
  assert.doesNotMatch(js, /startDemo|setInterval|missionTimeReadout|navDistanceReadout|limitReadout/);
  assert.doesNotMatch(js, /74\+Math\.round|navDist:|missionTime:/);
});

test('original speedometer artwork remains intact', () => {
  assert.match(js, /viewBox="0 0 200 200"/);
  assert.match(js, /M28\.99 141\.00A82 82 0 1 1 171\.01 141\.00/);
  assert.match(js, /M97\.2 108L100 42L102\.8 108Z/);
});
