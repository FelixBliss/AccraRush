import { GAME_EVENTS } from "./constants.js";

/** In-process event boundary; multiplayer authority can later publish the same event shapes. */
export function createGameEventBus() {
  const listeners = new Map(GAME_EVENTS.map((name) => [name, new Set()]));

  return Object.freeze({
    on(name, listener) {
      if (!listeners.has(name)) throw new Error(`Unknown game event: ${name}`);
      if (typeof listener !== "function") throw new TypeError("listener must be a function");
      listeners.get(name).add(listener);
      return () => listeners.get(name).delete(listener);
    },
    emit(name, payload) {
      if (!listeners.has(name)) throw new Error(`Unknown game event: ${name}`);
      for (const listener of [...listeners.get(name)]) listener(payload);
    },
    clear() {
      for (const group of listeners.values()) group.clear();
    },
  });
}
