# Testing

`npm test` runs the unit tests. `npm run test:foundry` runs the browser tests against a local
Foundry (see `tools/foundry/README.md`). With the Quench module installed you can also run the
Fate Dice batches from inside Foundry as a GM.

## Things to check by hand before a release

- Module loads in a v13 world with no console errors, and the settings make sense.
- Fate Reroll button and the fated card look right in light and dark themes, including whispered
  and blind rolls.
- With a few players making the same roll, it's easy to tell which fated roll goes with which
  (hover outline, "original" link).
- Sheet button, log, refunds and "view roll" work.
- HUD sits somewhere sensible and can be dragged. GM panel is readable with lots of characters.
- Shop and shop editor are readable, the edit dialog makes sense, and importing a shared file
  shows a sensible preview.
- pf2e: the result line updates on fated checks and the hero point reroll is gone from the chat
  menu.
- pf1e: fated skills and saves look right, and the fated attack card reads clearly.
- Nomination cards look right in both modes.
