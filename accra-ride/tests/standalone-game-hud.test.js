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

test('legacy top readouts are hidden and the replacement cluster is positioned in the bottom cockpit', () => {
  assert.match(css, /body\.ar-screen>#hud,body\.ar-screen>#mission\{display:none!important\}/);
  const cockpit = readFileSync(new URL('../src/ui/modern-cockpit.css', import.meta.url), 'utf8');
  assert.match(cockpit, /#ar-cockpit\{position:fixed/);
  assert.match(cockpit, /bottom:0/);
  assert.match(cockpit, /#ar-cockpit #driveReadout\{position:static/);
});

test('speed, gear, distance, coins and traffic signal are connected to live game state', () => {
  assert.match(html, /AccraRushStandaloneHUD\?\.update\(\{speed:Math\.abs\(speed\),gear:reverse\?'R':'D',tripDistance:driveDistance,coins,signal:2,signalDistance:0/);
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

test('minimap initialization supplies a defined world-forward vector and cannot abort driving startup', () => {
  assert.match(js, /drawMinimap\(start\.x,start\.z,dx,end\.z-start\.z,0\)/);
  assert.doesNotMatch(js, /drawMinimap\(start\.x,start\.z,dx,dz\)/);
});


test('modern cockpit integrates the existing steering, pedals, camera, lights, horn and minimap controls', () => {
  const cockpit = readFileSync(new URL('../src/ui/modern-cockpit.css', import.meta.url), 'utf8');
  assert.match(html, /modern-cockpit\.css/);
  assert.match(html, /id='ar-cockpit'/);
  for (const id of ['wheelArea','pedals','cameraBtn','lightBtn','hornBtn','ar-live-minimap']) {
    assert.ok(html.includes(id), `missing cockpit integration: ${id}`);
  }
  assert.match(cockpit, /#ar-cockpit-left/);
  assert.match(cockpit, /#ar-cockpit-center/);
  assert.match(cockpit, /#ar-cockpit-right/);
});

test('automatic selector exposes P-R-N-D and enforces brake and near-stop safety for park/reverse', () => {
  assert.match(html, /data-gear="P"/);
  assert.match(html, /data-gear="R"/);
  assert.match(html, /data-gear="N"/);
  assert.match(html, /data-gear="D"/);
  assert.match(html, /Math\.abs\(speed\)>2\.2/);
  assert.match(html, /\(next==='P'\|\|next==='R'\)&&!braking/);
  assert.match(html, /selectedGear==='R'/);
  assert.match(html, /selectedGear==='P'/);
  assert.match(html, /selectedGear==='N'/);
});

test('tilt steering has a user gesture permission path, neutral calibration and wheel fallback', () => {
  assert.match(html, /DeviceOrientationEvent\.requestPermission/);
  assert.match(html, /deviceorientation/);
  assert.match(html, /neutralGamma/);
  assert.match(html, /setSteeringMode\('wheel'\)/);
});

test('driving renderer and camera are resized to the area above the cockpit', () => {
  assert.match(html, /innerHeight-cockpit\.getBoundingClientRect\(\)\.height/);
  assert.match(html, /renderer\.setSize\(w,h,false\)/);
  assert.match(html, /camera\.aspect=w\/h/);
});

test('cockpit integration module parses as JavaScript', () => {
  const start = html.indexOf('/* Modern cockpit integration');
  const end = html.indexOf('\\n})();\\n</script>', start);
  assert.ok(start >= 0 && end > start, 'cockpit integration module is present');
  assert.doesNotThrow(() => new Function(html.slice(start, end)));
});
