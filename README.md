# Fate Dice

A Foundry VTT (v13) module for a hero-point style **Fate Dice** system.

## Installation

In Foundry (v13): **Add-on Modules → Install Module**, paste this manifest URL, and click Install:

```
https://github.com/ebrownewell/fate-dice/releases/latest/download/module.json
```

Then enable **Fate Dice** in your world (Game Settings → Manage Modules). A GM must be logged in for
Fate Dice to be spent or awarded.

## Supported systems

The Fate Dice pool, log, HUD, GM panel, shop and nominations work in any system. The
**Fate Reroll** button needs a system adapter:

| System       | Fate Reroll works on                                           | Notes                                                                                                                                                                                                                                                                                                                                                          |
| ------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dnd5e (5.3)  | attacks, checks, saves, skills, tools, initiative, death saves | advantage/disadvantage as described below                                                                                                                                                                                                                                                                                                                      |
| pf2e (7.12)  | checks, saves, perception, strikes, initiative                 | fortune = advantage, misfortune = disadvantage; the degree of success is recomputed (a boosted fate die never counts as a natural 20 or 1). Rolls whose degree was adjusted by an ability get no button. pf2e's own Hero Point reroll is hidden by default (setting).                                                                                          |
| pf1e (11.11) | skills, saves, ability checks, initiative, attacks             | each attack in a full attack has its own button; the fated attack gets a compact card of its own (pf1 can't redraw attack cards). A new crit threat gets a confirmation roll (using the attack's bonus; add any confirmation bonuses) and a reminder to roll crit damage; the card also says when the original's confirmation still applies or no longer does. |

## Rules (defaults; GM-configurable)

- Each character holds up to **3** Fate Dice. Every spend draws from one pool.
- **Fate Reroll** (built-in, can be disabled): after any d20 roll, roll one extra d20.
  - If the fate die shows **9 or lower**, add **+10** to it immediately (both numbers configurable).
  - Compare it with the original roll (normal: the d20; advantage: both dice;
    disadvantage: **only the lower** die) and keep the highest.
  - Only a natural die can crit or fumble; a boosted fate die never does.
- The GM defines other purchases in a shop, which can be shared as JSON.

## Releasing

1. Update `version` in `module.json` and `package.json`, and add a `## [x.y.z]` section to `CHANGELOG.md`.
2. Commit, then tag and push: `git tag vx.y.z && git push origin main vx.y.z`.
3. GitHub Actions runs every check, builds `module.zip`, and publishes the release. Foundry picks it
   up from the manifest URL above.

`npm run build -- vx.y.z` builds the same package locally into `dist/`.

## License

MIT. See [LICENSE](LICENSE).

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
await fate.fateReroll(message, target); // same as clicking Fate Reroll; target only for multi-attack cards, e.g. "attack-1"
await fate.refundEntry(actor, entryId); // GM only: refund a spend from the character's log
fate.openLog(actor); // open a character's Fate Dice log
fate.openPanel(); // GM: open the Fate Dice panel
fate.openShop(actor); // open a character's shop
fate.openShopEditor(); // GM: edit the shop, import/export
await fate.purchase(actor, itemId, "note"); // buy a shop item (or take a flaw)
await fate.nominate(actor, "reason"); // nominate another player's character
fate.openNominate(); // open the nominate dialog
```

Changes are applied by the active GM's client, so a GM must be connected. Failed calls reject
with a `FateError` whose `code` is one of `invalid`, `insufficient-points`, `not-permitted`,
`not-found`, `not-fateable`, `no-gm`, `timeout`, `unknown-action` or `internal`.
