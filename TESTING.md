# Testing

## Automated

- `npm test`: unit tests for everything that can run outside Foundry.
- `npm run test:foundry`: runs the Quench batches and the multi-client browser tests against the
  local dev server. See `tools/foundry/README.md` for setting it up.
- **In Foundry:** install and enable the [Quench](https://github.com/Ethaks/FVTT-Quench) module,
  then open Quench's test window as a GM and run the **Fate Dice** batches. They create and delete
  a temporary actor named "Fate Dice integration test".

## Manual checklist

Run through this before each release. It covers what automated tests can't reach (visuals and feel).

### Setup

- [ ] Module enables in a v13 world with no console errors.
- [ ] All Fate Dice settings appear under Configure Settings → Fate Dice, with readable names and hints.
- [ ] A player client (separate browser) can call `game.modules.get("fate-dice").api.spend(...)` on
      their own character while the GM is connected, and gets a `no-gm` error when no GM is.

### Fate Reroll chat cards

- [ ] The button sits neatly under the roll in both light and dark UI themes.
- [ ] The fated result's banner and `+10[Fate]` term read clearly; the dice tooltip shows the fate die.
- [ ] Dice sound plays for the fated roll.
- [ ] The button looks right on a whispered/blind roll (GM roll modes).

### Log window

- [ ] The Fate Dice button shows in the character sheet header (owner and GM) and opens the log.
- [ ] The log reads well in light and dark themes and with a long history (scrolls, header stays put).
- [ ] "view roll" opens the roll in a popout; on a deleted message it says so.
- [ ] The refund confirmation reads correctly.

### HUD and GM panel

- [ ] The HUD doesn't cover anything important at its default spot (above the players list), in both themes.
- [ ] Dragging feels right; the HUD stays on screen after resizing the window.
- [ ] The GM panel reads well with 5+ characters and long names.
- [ ] The "Award…" dialog is clear; its note shows in the character's log.

<!-- Add sections as features land: shop, nominations. -->
