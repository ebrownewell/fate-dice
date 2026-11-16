// @ts-check

export const HERO_POINT_REROLL = "PF2E.RerollMenu.HeroPoint";

/**
 * Remove pf2e's "Reroll using a Hero Point" from a chat context menu, in place
 * (Foundry passes the list to hooks to modify). Entries call it `name` in
 * Foundry v13 and `label` in v14.
 * @param {{ name?: string, label?: string }[]} options
 */
export function removeHeroPointReroll(options) {
  const index = options.findIndex((o) => (o.name ?? o.label) === HERO_POINT_REROLL);
  if (index >= 0) options.splice(index, 1);
}
