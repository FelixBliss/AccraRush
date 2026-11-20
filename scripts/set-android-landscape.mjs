import { readFile, writeFile } from "node:fs/promises";

const manifestPath = new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url);
let manifest = await readFile(manifestPath, "utf8");
const activityPattern = /<activity\b(?=[^>]*android:name="[^"]*MainActivity")[^>]*>/s;
const match = manifest.match(activityPattern);
if (!match) throw new Error("Capacitor MainActivity declaration was not found in AndroidManifest.xml");

let activity = match[0];
if (/android:screenOrientation\s*=/.test(activity)) {
  activity = activity.replace(/android:screenOrientation\s*=\s*"[^"]*"/, 'android:screenOrientation="landscape"');
} else {
  activity = activity.replace(/>$/, ' android:screenOrientation="landscape">');
}
if (!/android:resizeableActivity\s*=/.test(activity)) {
  activity = activity.replace(/>$/, ' android:resizeableActivity="true">');
}
manifest = manifest.replace(match[0], activity);
await writeFile(manifestPath, manifest);
console.log("Configured MainActivity for landscape orientation.");
