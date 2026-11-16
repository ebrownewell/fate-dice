// @ts-check

export const HERO_POINT_REROLL = "PF2E.RerollMenu.HeroPoint";

/**
 * Remove pf2e's "Reroll using a Hero Point" from a chat context menu, in place
 * (Foundry passes the list to hooks to modify).
 * @param {{ name: string }[]} options
 */
export function removeHeroPointReroll(options) {
  const index = options.findIndex((o) => o.name === HERO_POINT_REROLL);
  if (index >= 0) options.splice(index, 1);
}
