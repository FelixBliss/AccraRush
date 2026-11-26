# Gameplay hook request — garage/settings integration

This branch deliberately does not edit `accrarush.html`, the gameplay HUD, or the simulation. The menu now persists the supported settings and emits one live event whenever a setting changes or is reset:

```js
window.addEventListener("accrarush:settings-changed", event => {
  const { engineSound, missionHints } = event.detail;
  // Apply these values to the live gameplay systems.
});
```

## Required gameplay-side audio hook

The current gameplay script reads `window.AccraRushSettings.engineSound` before creating engine audio and before playing the horn. That prevents new audio from starting while disabled, but it does not mute an oscillator or horn envelope that is already playing when the user switches the setting off.

The gameplay owner should expose a narrow function after the audio nodes are created:

```js
window.AccraRushApplySettings = ({ engineSound, missionHints }) => {
  if (engineGain && audioCtx) {
    engineGain.gain.setTargetAtTime(engineSound ? 0.018 : 0, audioCtx.currentTime, 0.04);
  }
  if (!engineSound && hornGain && audioCtx) {
    hornGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.02);
  }
  // Keep essential collision, damage, and safety feedback independent of missionHints.
};
document.addEventListener("accrarush:settings-change", event => {
  window.AccraRushApplySettings?.(event.detail);
});
window.AccraRushApplySettings(window.AccraRushSettings || {});
```

The menu dispatches `accrarush:settings-changed` on `window`, matching the event name and target used by the cockpit PR, and calls `window.AccraRushApplySettings?.(settings)` when this audio hook exists. Until the gameplay-side audio hook is added, the menu accurately persists the choice and blocks subsequent engine/horn playback through the existing `window.AccraRushSettings` checks, but live muting of an already-running engine sound remains **NOT IMPLEMENTED**.

## Cockpit steering integration

When the cockpit PR exposes `window.AccraRushCockpitSettings`, the Settings page adds only the supported controls:
- Wheel steering or tilt steering, through `setSteeringMode` / `getSteeringMode`.
- Steering sensitivity, through `setSteeringSensitivity` / `getSteeringSensitivity`, clamped by the cockpit implementation.

The settings page does not duplicate the in-game steering control. Tilt permission is requested only after the player explicitly selects Tilt steering. Reset returns to wheel steering and sensitivity 1. The settings page hides these controls if the cockpit API is not present, rather than presenting inert controls.

## Vehicle availability contract

The current accepted master exposes only `corolla-taxi` as a playable vehicle. The Executive Sedan and Pickup controls are locked/non-selectable in the current menu; no vehicle is unlocked by this branch. The garage persists the stable vehicle ID, paint ID and paint hex in the versioned setup object and includes them in the `accrarush:start` event. The gameplay entry currently instantiates the Corolla regardless of that ID, so additional vehicle loading must wait until the corresponding vehicle model/controller manifests are present on accepted master.

Do not unlock SUV or Pickup by copying code from an unmerged vehicle PR. Reconcile their manifests and gameplay loader in a separate, approved vehicle integration change.
