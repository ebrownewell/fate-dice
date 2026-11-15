// @ts-check
// Integration tests that run inside a live Foundry world via the Quench
// module (https://github.com/Ethaks/FVTT-Quench). They cover what unit tests
// can't: real actor flags, real settings, and the module API end to end.
// Run them as a GM from Quench's test window; they create and delete a
// temporary actor.

import { MODULE_ID } from "./core/constants.js";

/** @param {any} quench */
export function registerQuenchTests(quench) {
  quench.registerBatch(
    `${MODULE_ID}.points`,
    (/** @type {any} */ context) => {
      const { describe, it, assert, before, after } = context;

      describe("Fate Dice points", function () {
        /** @type {any} */
        let actor;
        const api = () => game.modules.get(MODULE_ID).api;

        before(
          /** @this {any} */ async function () {
            if (!game.user.isGM) this.skip();
            actor = await Actor.implementation.create({
              name: "Fate Dice integration test",
              type: "character",
            });
          },
        );

        after(async () => {
          await actor?.delete();
        });

        it("awards and spends through the API", async () => {
          await api().setPoints(actor, 0);
          await api().award(actor, 2);
          assert.equal(api().getPoints(actor), 2);
          await api().spend(actor, 1);
          assert.equal(api().getPoints(actor), 1);
        });

        it("stores points in the actor's module flag", async () => {
          await api().setPoints(actor, 2);
          assert.equal(actor.getFlag(MODULE_ID, "points"), 2);
        });

        it("caps awards at the Maximum Fate Dice setting", async () => {
          const max = game.settings.get(MODULE_ID, "maxPoints");
          await api().setPoints(actor, 0);
          await api().award(actor, max + 5);
          assert.equal(api().getPoints(actor), max);
        });

        it("refuses to overspend", async () => {
          await api().setPoints(actor, 1);
          const error = await api()
            .spend(actor, 2)
            .catch((/** @type {any} */ e) => e);
          assert.equal(error?.code, "insufficient-points");
          assert.equal(api().getPoints(actor), 1);
        });
      });
    },
    { displayName: "Fate Dice: points" },
  );
}
