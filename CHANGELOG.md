# Changelog

All notable changes to this module are documented here. Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Per-character log** of every award, spend, Fate Reroll, GM set and refund: when, the change, the balance after, who, and an optional note.
  - Saved in the same update as the point change, so the log and balance always agree.
  - A **Fate Dice** button in the character sheet header opens it for the owner and the GM (also `api.openLog(actor)`).
  - Fate Reroll entries link to their roll ("view roll").
  - The GM can refund a spend from the log; the spend is marked refunded and the two entries are linked. Each spend can be refunded once.
  - Automatic refunds after a failed reroll are logged as such.
- **Fate Reroll** on dnd5e d20 rolls: attacks, saves, ability and skill checks, tool checks and initiative.
  - A "Fate Reroll (cost)" button on the roller's own chat cards; disabled with a reason when they can't afford it.
  - The GM's client spends the cost, rolls the fate die and posts the fated roll as a real dnd5e roll from the player, with a banner such as "Fate Reroll: 7 → 17 (+10), kept".
  - The fate bonus is its own `+10[Fate]` term; a boosted die never crits or fumbles.
  - The original is marked "Fated" and can't be fated twice. Fated initiative updates the combat tracker.
  - If anything fails after the spend, the Fate Dice are refunded.
  - Death saves: the character's death-save state is captured with each roll, and a Fate Reroll replaces the original roll's effect (successes, failures, stabilising, dying, or a natural-20 revive), posting dnd5e's own message when the outcome changes. Refused if the character has changed since the roll.
- GM refunds (`api.refund`), capped at the maximum.
- World settings: maximum Fate Dice, Fate Reroll on/off and cost, fate die bonus on/off, threshold and amount, and whether Fate Reroll works on initiative and death saves.
- Fate Dice stored per character (`flags.fate-dice.points`), capped at the maximum.
- All point changes run on the active GM's client over the module socket, with permission checks and a per-character queue that prevents double-spending.
- Macro API: `game.modules.get("fate-dice").api` with `getPoints`, `award`, `spend` and `setPoints`.
- Quench integration tests for the points API.
- Recorded dnd5e 5.3.3 chat-message fixtures for every d20 roll type, plus a script to re-record them.
- Dev tooling to drive a local Foundry server with Playwright: world setup, a terminal Quench runner, and multi-client socket tests.
- Fate Reroll rules engine (`scripts/rules/fateReroll.js`): configurable bonus and threshold, normal/advantage/disadvantage comparison, crit and fumble detection, input and rules validation.

- Project tooling: Vitest, ESLint, Prettier, JS type checking, GitHub Actions CI.
