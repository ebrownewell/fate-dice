# Fate Dice

Fate Dice for Foundry VTT v13. It's the hero point system we use at our table: players earn Fate
Dice and spend them to reroll a d20, or on anything else the GM puts in the shop.

## Install

In Foundry go to Add-on Modules > Install Module, paste the manifest URL for your Foundry version
and install:

```
https://github.com/ebrownewell/fate-dice/releases/download/foundry-v13/module.json
```

Then turn it on in your world. A GM has to be logged in for Fate Dice to be spent or awarded.

## How it works

- Each character can hold up to 3 Fate Dice.
- **Fate Reroll:** after any d20 roll you can spend a Fate Die to roll one more d20. If it comes up
  9 or lower it gets +10. Then it's compared with your roll and the higher one counts. With advantage
  it's compared against the higher die, with disadvantage against the lower one.
- A boosted fate die can't crit or fumble. A natural 20 still crits.
- The GM can award Fate Dice to one character or give everyone one at the start of a session, and
  can set up a shop of other things to spend them on. Shops can be exported and imported as JSON.
- Players can nominate each other for a Fate Die. Either the GM approves it or the players vote.
- Each character has a log of everything they earned and spent, and the GM can refund from it.

The max, the cost, the +10 and the 9-or-lower are all settings.

## Systems

The Fate Reroll button works in:

- **dnd5e 5.3:** attacks, checks, saves, skills, tools, initiative and death saves.
- **pf2e 7.12:** checks, saves, perception, strikes and initiative. Fortune and misfortune count as
  advantage and disadvantage, and the degree of success gets updated. pf2e's own hero point reroll
  is hidden (there's a setting to bring it back).
- **pf1e 11.11:** skills, saves, ability checks, initiative and attacks. Each attack in a full
  attack can be fated separately. If a fated attack turns into a crit threat it rolls the
  confirmation for you, but you still roll crit damage yourself.

Everything else (the pool, log, shop and nominations) works in any system.

## Macros

```js
const fate = game.modules.get("fate-dice").api;
fate.getPoints(actor);
await fate.award(actor, 1, "Great roleplay"); // GM only
await fate.spend(actor, 1);
await fate.setPoints(actor, 3); // GM only
await fate.refund(actor, 1); // GM only
await fate.refundEntry(actor, entryId); // GM only, refunds an entry from the log
await fate.fateReroll(message); // pf1 attack cards: fateReroll(message, "attack-1")
await fate.purchase(actor, itemId, "note");
await fate.nominate(actor, "reason");
fate.openLog(actor);
fate.openShop(actor);
fate.openNominate();
fate.openPanel(); // GM
fate.openShopEditor(); // GM
```

Failed calls throw a `FateError` with a `code` like `insufficient-points`, `not-permitted` or
`no-gm`.

## Development

```sh
npm install
npm test
npm run check          # lint, formatting, types and tests (same as CI)
npm run test:foundry   # browser tests against a local Foundry, see tools/foundry/README.md
```

To work on it, symlink this folder into your Foundry `Data/modules` folder.

## Releasing

There's a release line per Foundry version: the `foundry-v13` branch (1.x) and `main` for v14
(2.x). Bump the version in `module.json` and `package.json`, add a section for it to
`CHANGELOG.md`, then tag it and push the branch and tag (`git tag v1.0.1 && git push origin
foundry-v13 v1.0.1`). GitHub Actions builds the zip, publishes the release and updates that
Foundry version's install link.

## License

MIT
