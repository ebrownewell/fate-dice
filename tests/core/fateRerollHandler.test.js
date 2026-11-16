import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFateRerollHandler } from "../../scripts/core/fateRerollHandler.js";
import { createFateService } from "../../scripts/core/fateService.js";
import { getActorPoints } from "../../scripts/core/actorPoints.js";
import { getActorLog } from "../../scripts/core/log.js";
import { MODULE_ID } from "../../scripts/core/constants.js";
import { dnd5eAdapter } from "../../scripts/systems/dnd5e.js";
import { pf1Adapter } from "../../scripts/systems/pf1.js";
import { editFirstRoll, loadMessage } from "../helpers/fixtures.js";
import { fakeActor, fakeUser } from "../helpers/fakes.js";

const ACTOR_ID = loadMessage("dnd5e", "attack-disadvantage").speaker.actor;

const SETTINGS = {
  maxPoints: 3,
  rerollEnabled: true,
  rerollCost: 1,
  bonusEnabled: true,
  bonusThreshold: 9,
  bonusAmount: 10,
  rerollOnInitiative: true,
  rerollOnDeathSaves: true,
};

/** @type {ReturnType<typeof setup>} */
let ctx;

function setup({ points = 2, settings = SETTINGS } = {}) {
  const users = [fakeUser("gm", true), fakeUser("alice"), fakeUser("bob")];
  const actor = fakeActor(ACTOR_ID, {
    owners: ["alice"],
    flags: { [MODULE_ID]: { points } },
  });
  const service = createFateService({
    getUser: (id) => users.find((u) => u.id === id),
    getActor: (id) => (id === ACTOR_ID ? actor : undefined),
    getMaxPoints: () => settings.maxPoints,
  });

  /** @type {Map<string, any>} */
  const messages = new Map();
  /** @param {string} id @param {any} data */
  const addMessage = (id, data) => messages.set(id, { ...data, _id: id });

  let fateDie = 7;
  /** @type {{ success: number, failure: number, hp: number }} */
  let deathState = { success: 0, failure: 0, hp: 0 };
  let created = 0;
  const deps = {
    getMessage: vi.fn((/** @type {string} */ id) => structuredClone(messages.get(id))),
    getAdapter: vi.fn(() => /** @type {any} */ (dnd5eAdapter)),
    getSettings: () => settings,
    service,
    rollD20: vi.fn(async () => fateDie),
    createFatedMessage: vi.fn(async () => ({ id: `fated-${++created}` })),
    markFated: vi.fn(
      async (
        /** @type {string} */ id,
        /** @type {string} */ target,
        /** @type {string} */ fatedId,
      ) => {
        const data = messages.get(id);
        const flags = (data.flags[MODULE_ID] ??= {});
        flags.fatedTargets = { ...flags.fatedTargets, [target]: fatedId };
      },
    ),
    updateInitiative: vi.fn(async () => {}),
    getDeathState: vi.fn(() => deathState),
    applyDeathSave: vi.fn(async () => {}),
  };

  return {
    actor,
    deps,
    addMessage,
    handler: createFateRerollHandler(deps),
    setFateDie: (/** @type {number} */ n) => (fateDie = n),
    setDeathState: (/** @type {typeof deathState} */ s) => (deathState = s),
  };
}

const fateAs = (/** @type {string} */ userId, messageId = "m1") =>
  ctx.handler.fateReroll({ messageId }, { userId });

beforeEach(() => {
  ctx = setup();
  ctx.addMessage("m1", loadMessage("dnd5e", "attack-disadvantage"));
});

describe("fateReroll: the happy path", () => {
  it("spends the cost, rolls the fate die, posts the fated roll and marks the original", async () => {
    // Recorded roll: disadvantage 1 / 15, so the fate die faces the 1.
    const result = await fateAs("alice");

    expect(getActorPoints(ctx.actor)).toBe(1);
    expect(result.change).toMatchObject({ action: "spend", delta: -1, userId: "alice" });
    expect(result.outcome).toMatchObject({ kept: "fate", result: { value: 17 } });
    expect(result.messageId).toBe("fated-1");

    const [{ original, rollData, outcome, userId }] = /** @type {any} */ (
      ctx.deps.createFatedMessage.mock.calls[0]
    );
    expect(original._id).toBe("m1");
    expect(userId).toBe("alice");
    expect(outcome).toEqual(result.outcome);
    expect(rollData.total).toBe(result.total);
    expect(ctx.deps.markFated).toHaveBeenCalledWith("m1", "0", "fated-1");
  });

  it("logs the spend as a Fate Reroll linked to the roll", async () => {
    await fateAs("alice");
    expect(getActorLog(ctx.actor)).toEqual([
      expect.objectContaining({
        action: "spend",
        delta: -1,
        userId: "alice",
        source: { type: "reroll", messageId: "m1" },
      }),
    ]);
  });

  it("charges the configured cost", async () => {
    ctx = setup({ points: 3, settings: { ...SETTINGS, rerollCost: 2 } });
    ctx.addMessage("m1", loadMessage("dnd5e", "attack-disadvantage"));
    await fateAs("alice");
    expect(getActorPoints(ctx.actor)).toBe(1);
  });

  it("uses the configured bonus and threshold", async () => {
    ctx = setup({ settings: { ...SETTINGS, bonusThreshold: 5, bonusAmount: 5 } });
    ctx.addMessage("m1", loadMessage("dnd5e", "attack-disadvantage"));
    ctx.setFateDie(5);
    const { outcome } = await fateAs("alice");
    expect(outcome.result).toEqual({ natural: 5, bonus: 5, value: 10 });
  });

  it("uses the roll's own crit range", async () => {
    ctx.addMessage(
      "m2",
      editFirstRoll(loadMessage("dnd5e", "attack-disadvantage"), (roll) => {
        roll.terms[0].options.criticalSuccess = 19;
      }),
    );
    ctx.setFateDie(19);
    const { outcome } = await fateAs("alice", "m2");
    expect(outcome.isCritical).toBe(true);
  });

  it("lets the GM fate any character's roll", async () => {
    await fateAs("gm");
    expect(getActorPoints(ctx.actor)).toBe(1);
  });
});

describe("fateReroll: refusals change nothing", () => {
  /** @param {string} userId @param {string} code @param {string} [messageId] */
  async function expectRefused(userId, code, messageId = "m1") {
    await expect(fateAs(userId, messageId)).rejects.toMatchObject({ code });
    expect(ctx.deps.rollD20).not.toHaveBeenCalled();
    expect(ctx.deps.createFatedMessage).not.toHaveBeenCalled();
  }

  it("refuses an unknown message", async () => {
    await expectRefused("alice", "not-found", "nope");
  });

  it("refuses someone else's roll", async () => {
    await expectRefused("bob", "not-permitted");
    expect(getActorPoints(ctx.actor)).toBe(2);
  });

  it("refuses when the character can't afford it", async () => {
    ctx = setup({ points: 0 });
    ctx.addMessage("m1", loadMessage("dnd5e", "attack-disadvantage"));
    await expectRefused("alice", "insufficient-points");
  });

  it("refuses a roll that was already fated", async () => {
    await fateAs("alice");
    ctx.deps.rollD20.mockClear();
    ctx.deps.createFatedMessage.mockClear();
    await expectRefused("alice", "not-fateable");
    expect(getActorPoints(ctx.actor)).toBe(1);
  });

  it("refuses damage rolls", async () => {
    ctx.addMessage("dmg", loadMessage("dnd5e", "damage"));
    await expectRefused("alice", "not-fateable", "dmg");
  });

  it("refuses when Fate Reroll is disabled", async () => {
    ctx = setup({ settings: { ...SETTINGS, rerollEnabled: false } });
    ctx.addMessage("m1", loadMessage("dnd5e", "attack-disadvantage"));
    await expectRefused("alice", "not-fateable");
  });

  it("refuses when the game system has no adapter", async () => {
    ctx.deps.getAdapter.mockReturnValue(null);
    await expectRefused("alice", "not-fateable");
  });

  it("only lets one of two simultaneous requests fate the same roll", async () => {
    const results = await Promise.allSettled([fateAs("alice"), fateAs("alice")]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(getActorPoints(ctx.actor)).toBe(1);
    expect(ctx.deps.createFatedMessage).toHaveBeenCalledTimes(1);
  });
});

describe("fateReroll: failures after spending", () => {
  it("gives the points back if posting the result fails", async () => {
    ctx.deps.createFatedMessage.mockRejectedValueOnce(new Error("database down"));
    await expect(fateAs("alice")).rejects.toThrow("database down");
    expect(getActorPoints(ctx.actor)).toBe(2);
    expect(getActorLog(ctx.actor).map((e) => [e.action, e.automatic ?? false])).toEqual([
      ["spend", false],
      ["refund", true],
    ]);
    expect(ctx.deps.markFated).not.toHaveBeenCalled();
  });

  it("gives the points back if rolling the fate die fails", async () => {
    ctx.deps.rollD20.mockRejectedValueOnce(new Error("dice jammed"));
    await expect(fateAs("alice")).rejects.toThrow("dice jammed");
    expect(getActorPoints(ctx.actor)).toBe(2);
  });
});

describe("fateReroll: initiative", () => {
  beforeEach(() => {
    const message = loadMessage("dnd5e", "initiative");
    message.speaker.actor = ACTOR_ID;
    ctx.addMessage("init", message);
  });

  it("updates the combatant's initiative when the result changes", async () => {
    ctx.setFateDie(20);
    const { total } = await fateAs("alice", "init");
    const original = JSON.parse(loadMessage("dnd5e", "initiative").rolls[0]).total;
    expect(ctx.deps.updateInitiative).toHaveBeenCalledWith({
      actorId: ACTOR_ID,
      from: original,
      to: total,
    });
  });

  it("leaves initiative alone when the original die is kept", async () => {
    // Recorded initiative die is 9; with the bonus off, a fate 1 can't beat it.
    ctx = setup({ settings: { ...SETTINGS, bonusEnabled: false } });
    const message = loadMessage("dnd5e", "initiative");
    message.speaker.actor = ACTOR_ID;
    ctx.addMessage("init", message);
    ctx.setFateDie(1);
    await fateAs("alice", "init");
    expect(ctx.deps.updateInitiative).not.toHaveBeenCalled();
  });

  it("never touches initiative for other rolls", async () => {
    ctx.setFateDie(20);
    await fateAs("alice");
    expect(ctx.deps.updateInitiative).not.toHaveBeenCalled();
  });
});

describe("fateReroll: death saves", () => {
  /** A death save that rolled a natural `die` (no modifiers), with a snapshot. */
  function deathSave(/** @type {number} */ die, before = { success: 1, failure: 1, hp: 0 }) {
    const message = editFirstRoll(loadMessage("dnd5e", "death-save"), (roll) => {
      roll.terms[0].results = [{ result: die, active: true }];
      roll.total = die;
    });
    message.speaker.actor = ACTOR_ID;
    message.flags[MODULE_ID] = { deathSave: { before } };
    return message;
  }

  it("replaces a failed save's effect with the fated success", async () => {
    ctx.addMessage("ds", deathSave(4));
    ctx.setDeathState({ success: 1, failure: 2, hp: 0 }); // what the 4 did
    ctx.setFateDie(15);
    await fateAs("alice", "ds");
    expect(ctx.deps.applyDeathSave).toHaveBeenCalledWith({
      actorId: ACTOR_ID,
      updates: {
        "system.attributes.death.success": 2,
        "system.attributes.death.failure": 1,
      },
      chatKey: null,
    });
  });

  it("refuses, without spending, if the character changed since the roll", async () => {
    ctx.addMessage("ds", deathSave(4));
    ctx.setDeathState({ success: 0, failure: 0, hp: 7 }); // healed since
    await expect(fateAs("alice", "ds")).rejects.toMatchObject({ code: "not-fateable" });
    expect(getActorPoints(ctx.actor)).toBe(2);
    expect(ctx.deps.rollD20).not.toHaveBeenCalled();
  });

  it("changes nothing on the character when the original die is kept", async () => {
    ctx = setup({ settings: { ...SETTINGS, bonusEnabled: false } });
    ctx.addMessage("ds", deathSave(8));
    ctx.setDeathState({ success: 1, failure: 2, hp: 0 });
    ctx.setFateDie(3);
    await fateAs("alice", "ds");
    expect(ctx.deps.applyDeathSave).not.toHaveBeenCalled();
  });

  it("refuses a death save without a snapshot", async () => {
    const message = deathSave(4);
    delete message.flags[MODULE_ID];
    ctx.addMessage("ds", message);
    await expect(fateAs("alice", "ds")).rejects.toMatchObject({ code: "not-fateable" });
  });

  it("gives the points back if updating the character fails", async () => {
    ctx.addMessage("ds", deathSave(4));
    ctx.setDeathState({ success: 1, failure: 2, hp: 0 });
    ctx.setFateDie(15);
    ctx.deps.applyDeathSave.mockRejectedValueOnce(new Error("update failed"));
    await expect(fateAs("alice", "ds")).rejects.toThrow("update failed");
    expect(getActorPoints(ctx.actor)).toBe(2);
  });
});

describe("fateReroll: one attack in a pf1 full attack", () => {
  /** A pf1 full-attack card spoken by the test actor. */
  function fullAttack() {
    const message = loadMessage("pf1", "full-attack-card");
    message.speaker.actor = ACTOR_ID;
    return message;
  }

  beforeEach(() => {
    ctx.deps.getAdapter.mockReturnValue(/** @type {any} */ (pf1Adapter));
    ctx.addMessage("full", fullAttack());
  });

  it("fates the chosen attack and marks only that one", async () => {
    await ctx.handler.fateReroll({ messageId: "full", target: "attack-1" }, { userId: "alice" });
    const [{ target, rollData }] = /** @type {any} */ (ctx.deps.createFatedMessage.mock.calls[0]);
    expect(target).toBe("attack-1");
    const secondAttack = fullAttack().system.rolls.attacks[1].attack;
    expect(rollData.formula.startsWith(secondAttack.formula)).toBe(true);
    expect(ctx.deps.markFated).toHaveBeenCalledWith("full", "attack-1", "fated-1");
  });

  it("lets the other attack be fated afterwards, but not the same one twice", async () => {
    await ctx.handler.fateReroll({ messageId: "full", target: "attack-1" }, { userId: "alice" });
    await expect(
      ctx.handler.fateReroll({ messageId: "full", target: "attack-1" }, { userId: "alice" }),
    ).rejects.toMatchObject({ code: "not-fateable" });
    await expect(
      ctx.handler.fateReroll({ messageId: "full", target: "attack-0" }, { userId: "alice" }),
    ).resolves.toMatchObject({ messageId: "fated-2" });
  });

  it("refuses a target that isn't in the message", async () => {
    await expect(
      ctx.handler.fateReroll({ messageId: "full", target: "attack-7" }, { userId: "alice" }),
    ).rejects.toMatchObject({ code: "not-fateable" });
  });

  it("rolls a confirmation die for a new crit threat and passes it on", async () => {
    const attacks = fullAttack().system.rolls.attacks;
    const index = attacks.findIndex(
      (/** @type {any} */ a) => a.attack.terms[0].results[0].result < a.attack.options.critical,
    );
    if (index < 0) return; // both recorded attacks already threatened
    ctx.setFateDie(20);
    await ctx.handler.fateReroll(
      { messageId: "full", target: `attack-${index}` },
      { userId: "alice" },
    );
    expect(ctx.deps.rollD20).toHaveBeenCalledTimes(2);
    const [{ extraDice }] = /** @type {any} */ (ctx.deps.createFatedMessage.mock.calls[0]);
    expect(extraDice).toEqual([20]);
  });
});
