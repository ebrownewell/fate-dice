# Changelog

All notable changes to this module are documented here. Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- World settings: maximum Fate Dice, Fate Reroll on/off and cost, fate die bonus on/off, threshold and amount, and whether Fate Reroll works on initiative and death saves.
- Fate Dice stored per character (`flags.fate-dice.points`), capped at the maximum.
- All point changes run on the active GM's client over the module socket, with permission checks and a per-character queue that prevents double-spending.
- Macro API: `game.modules.get("fate-dice").api` with `getPoints`, `award`, `spend` and `setPoints`.
- Quench integration tests for the points API.
- Fate Reroll rules engine (`scripts/rules/fateReroll.js`): configurable bonus and threshold, normal/advantage/disadvantage comparison, crit and fumble detection, input and rules validation.

- Project tooling: Vitest, ESLint, Prettier, JS type checking, GitHub Actions CI.
