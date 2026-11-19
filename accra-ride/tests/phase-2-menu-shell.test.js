import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../accrarush.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/ui/phase-2-menu-shell.css', import.meta.url), 'utf8');

test('Phase 2 menu exposes home and mode-selection screens', () => {
  assert.match(html, /id="menu-home"/);
  assert.match(html, /id="menu-modes"[^>]*hidden/);
  assert.match(html, /id="menu-play"/);
  assert.match(html, /id="menu-back-home"/);
});

test('Free Drive remains the only enabled mode and uses the existing game start handler', () => {
  assert.match(html, /id="start" class="ar-button ar-button--primary ar-menu-wide"/);
  assert.match(html, /\$\('start'\)\.addEventListener\('click',\(\)=>\{\$\('startcover'\)\.style\.display='none';startAudio\(\);active=true;reset\(\)\}\)/);
  assert.match(html, /PASSENGER RUSH/);
  assert.match(html, /FRIEND RACE/);
  assert.match(html, /disabled aria-disabled="true"/);
});

test('menu navigation handlers switch screens without changing simulation state', () => {
  assert.match(html, /\$\('menu-play'\)\.addEventListener\('click',\(\)=>\{\$\('menu-home'\)\.hidden=true;\$\('menu-modes'\)\.hidden=false\}\)/);
  assert.match(html, /\$\('menu-back-home'\)\.addEventListener\('click',\(\)=>\{\$\('menu-modes'\)\.hidden=true;\$\('menu-home'\)\.hidden=false\}\)/);
});

test('menu layout adapts to compact landscape screens and preserves gameplay separation', () => {
  assert.match(html, /phase-2-menu-shell\.css/);
  assert.match(css, /@media\(max-height:430px\) and \(orientation:landscape\)/);
  assert.match(css, /\.ar-menu-screen\[hidden\]\{display:none\}/);
});
