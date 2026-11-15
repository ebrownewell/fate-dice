// Minimal declarations for the Foundry globals this module touches.
// They are deliberately loose: Foundry code lives in thin adapters, and the
// logic that matters is pure, typed JS under scripts/rules and scripts/core.
// Tighten these as adapters are added.

declare const Hooks: {
  once(hook: string, fn: (...args: any[]) => void): number;
  on(hook: string, fn: (...args: any[]) => void): number;
};

declare const game: any;
declare const ui: any;
declare const CONFIG: any;
declare const foundry: any;
