# Changelog

All notable changes to this module are documented here. Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Nominations**: a player nominates another player's character (never their own) for a Fate Die, with a reason, from the shop's "Nominate…" button.
  - Setting **Nominations**: off, **GM approves** (default), or **players vote**. Setting **Nominations per player per session** (default 1; 0 = unlimited).
  - GM approval: the GM gets Approve / Deny on the chat card.
  - Party vote: the players online when it's made vote, except the nominee's owner; the nominator counts as yes. It closes when everyone has voted and passes with a strict majority (ties fail). The GM can accept the result early, counting the votes so far.
  - Approved nominees get +1 Fate Die, logged as "Nominated by …: reason". Refused when the nominee is already full.
  - Each nomination lives on its chat card; votes and decisions are processed one at a time on the GM's client, so the nominee is awarded exactly once.
- **Shop**: GM-defined things to spend Fate Dice on.
  - Items have a cost, a plain-text description, an optional per-purchase cost increase (resetting each session or never), an optional limit per session or campaign, and can require a note. **Flaws** grant Fate Dice instead (capped at the maximum).
  - Players open it from the HUD or the Fate Dice sheet button; it shows prices, limits used and why an item is unavailable. Buying asks for confirmation (and the note); the GM's client checks and applies it, posts it to chat and logs it ("Bought: …" / "Flaw: …"). Purchases can be refunded from the log, which also frees up their limit.
  - **Sessions**: "Start of session" advances a session counter, so per-session limits and costs reset.
  - **Shop editor** for the GM (GM panel → Edit shop, or module settings): add, edit, reorder, enable/disable and delete items; set the built-in Fate Reroll's cost and switch it off.
  - **JSON import/export**: export the shop (optionally with your rule settings); import with a preview, choosing to update same-named items, keep yours, or replace the whole shop. Files are validated; descriptions are plain text, so a shared file can't inject HTML.
  - An example shop (Load example).

### Changed

- The HUD and the sheet's Fate Dice button open the shop (which links to the history).

### Fixed

- Windows took ~4 seconds to open the first time in a session; templates are now preloaded at startup.
- **Fate Dice HUD**: players see their character's Fate Dice as dots (click for their log); GMs get a button for the Fate Dice panel. Drag to move; the position is remembered per client. Players can hide it ("Show Fate Dice HUD").
- **GM panel** (`api.openPanel()`): every player character with owners and Fate Dice, +1 / −1, "Award…" with an amount and note, their log, and **Start of session: +1 everyone** (capped, logged as "Session start").
- `api.award(actors, amount, reason)` takes an optional note.
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
