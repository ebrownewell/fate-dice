# Fate Dice

A Foundry VTT (v13) module for a hero-point style **Fate Dice** system.
dnd5e comes first; pf2e and pf1e are planned via system adapters.

## Rules (defaults; GM-configurable)

- Each character holds up to **3** Fate Dice. Every spend draws from one pool.
- **Fate Reroll** (built-in, can be disabled): after any d20 roll, roll one extra d20.
  - If the fate die shows **9 or lower**, add **+10** to it immediately (both numbers configurable).
  - Compare it with the original roll (normal: the d20; advantage: both dice;
    disadvantage: **only the lower** die) and keep the highest.
  - Only a natural die can crit or fumble; a boosted fate die never does.
- The GM defines other purchases in a shop, which can be shared as JSON.

## Development

The module ships as plain ES modules with no build step. Node is only used for dev tooling.

```sh
npm install
npm test          # unit tests (Vitest)
npm run check     # lint + format check + type check + tests (what CI runs)
npm run test:foundry  # in-Foundry tests; needs the local dev server (tools/foundry/README.md)
```

To try it in Foundry, symlink this folder into your Foundry data folder:

```sh
ln -s "$PWD" "<FoundryData>/Data/modules/fate-dice"
```

### How the code is organised

| Folder                            | Contents                                        | Tests                                                            |
| --------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| `scripts/rules`, `scripts/core`   | Pure logic, no Foundry globals                  | Vitest unit tests                           |
| `scripts/systems`                 | Per-system adapters (dnd5e, pf2e, pf1, generic) | Shared adapter test suite against recorded chat-message fixtures |
| `scripts/apps`, `scripts/main.js` | Thin Foundry UI and hook wiring                 | Quench integration tests + `TESTING.md` checklist                |


## Macro API

```js
const fate = game.modules.get("fate-dice").api;
fate.getPoints(actor); // read, no GM needed
await fate.award(actor, 1, "Great roleplay"); // GM only; actor(s) or ids; note optional
await fate.spend(actor, 1); // owner or GM
await fate.setPoints(actor, 3); // GM only
await fate.refund(actor, 1); // GM only, capped at the maximum
await fate.fateReroll(message); // same as clicking Fate Reroll on that chat card
await fate.refundEntry(actor, entryId); // GM only: refund a spend from the character's log
fate.openLog(actor); // open a character's Fate Dice log
fate.openPanel(); // GM: open the Fate Dice panel
```

Changes are applied by the active GM's client, so a GM must be connected. Failed calls reject
with a `FateError` whose `code` is one of `invalid`, `insufficient-points`, `not-permitted`,
`not-found`, `not-fateable`, `no-gm`, `timeout`, `unknown-action` or `internal`.
