import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requiredFiles = [
  'index.html',
  'accrarush.html',
  '3d-prototype.html',
];

function fail(message) {
  console.error(`WEB BUILD VALIDATION FAILED: ${message}`);
  process.exitCode = 1;
}

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    fail(`required web entry/reference is missing: accra-ride/${relativePath}`);
  }
}

if (process.exitCode) process.exit();

const landingPage = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
const gamePage = fs.readFileSync(path.join(projectRoot, 'accrarush.html'), 'utf8');

if (!/accrarush\.html/.test(landingPage)) {
  fail('accra-ride/index.html does not direct visitors to accrarush.html');
}

if (!/<meta\s+name=["']viewport["']/.test(gamePage)) {
  fail('accrarush.html is missing its viewport declaration');
}

const localReferences = new Set();
for (const match of gamePage.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
  if (match[1].startsWith('./')) localReferences.add(match[1]);
}
for (const match of gamePage.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)["']/g)) {
  if (match[1].startsWith('./')) localReferences.add(match[1]);
}

for (const reference of localReferences) {
  const cleanReference = reference.split(/[?#]/, 1)[0];
  const absolutePath = path.resolve(projectRoot, cleanReference);
  if (!absolutePath.startsWith(projectRoot + path.sep)) {
    fail(`local reference escapes the web root: ${reference}`);
    continue;
  }
  if (!fs.existsSync(absolutePath)) {
    fail(`local game dependency is missing: ${reference}`);
  }
}

if (process.exitCode) process.exit();

console.log(`Web entry validation passed: ${localReferences.size} local dependencies resolved; protected prototype present.`);
