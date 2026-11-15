import { describe, expect, it, vi } from "vitest";
import { createApi } from "../../scripts/core/api.js";
import { MODULE_ID } from "../../scripts/core/constants.js";
import { fakeActor } from "../helpers/fakes.js";

const setup = () => {
  const bus = { request: vi.fn(async () => "result") };
  return { bus, api: createApi({ bus }) };
};

describe("createApi", () => {
  it("reads an actor's points directly, without a GM round trip", () => {
    const { bus, api } = setup();
    expect(api.getPoints(fakeActor("a", { flags: { [MODULE_ID]: { points: 2 } } }))).toBe(2);
    expect(bus.request).not.toHaveBeenCalled();
  });

  it("awards to one actor, given as a document or an id", async () => {
    const { bus, api } = setup();
    await api.award(fakeActor("a"), 1);
    await api.award("b", 2);
    expect(bus.request).toHaveBeenNthCalledWith(1, "award", { actorIds: ["a"], amount: 1 });
    expect(bus.request).toHaveBeenNthCalledWith(2, "award", { actorIds: ["b"], amount: 2 });
  });

  it("passes a note with an award", async () => {
    const { bus, api } = setup();
    await api.award("a", 1, "Session start");
    expect(bus.request).toHaveBeenCalledWith("award", {
      actorIds: ["a"],
      amount: 1,
      reason: "Session start",
    });
  });

  it("awards to several actors at once, defaulting to 1 point", async () => {
    const { bus, api } = setup();
    await api.award([fakeActor("a"), "b"]);
    expect(bus.request).toHaveBeenCalledWith("award", { actorIds: ["a", "b"], amount: 1 });
  });

  it("spends, defaulting to 1 point", async () => {
    const { bus, api } = setup();
    await expect(api.spend(fakeActor("a"))).resolves.toBe("result");
    expect(bus.request).toHaveBeenCalledWith("spend", { actorId: "a", cost: 1 });
  });

  it("sets a value", async () => {
    const { bus, api } = setup();
    await api.setPoints("a", 3);
    expect(bus.request).toHaveBeenCalledWith("setPoints", { actorId: "a", value: 3 });
  });

  it("refunds, defaulting to 1 point", async () => {
    const { bus, api } = setup();
    await api.refund(fakeActor("a"));
    expect(bus.request).toHaveBeenCalledWith("refund", { actorId: "a", amount: 1 });
  });

  it("refunds a logged spend", async () => {
    const { bus, api } = setup();
    await api.refundEntry(fakeActor("a"), "e1");
    expect(bus.request).toHaveBeenCalledWith("refund", { actorId: "a", entryId: "e1" });
  });

  it("buys a shop item, with an optional note", async () => {
    const { bus, api } = setup();
    await api.purchase(fakeActor("a"), "rope");
    await api.purchase("a", "flaw", "Started a brawl");
    expect(bus.request).toHaveBeenNthCalledWith(1, "purchase", {
      actorId: "a",
      itemId: "rope",
      note: "",
    });
    expect(bus.request).toHaveBeenNthCalledWith(2, "purchase", {
      actorId: "a",
      itemId: "flaw",
      note: "Started a brawl",
    });
  });

  it("fates a chat message, given as a document or an id", async () => {
    const { bus, api } = setup();
    await api.fateReroll({ id: "m1" });
    await api.fateReroll("m2");
    expect(bus.request).toHaveBeenNthCalledWith(1, "fateReroll", { messageId: "m1" });
    expect(bus.request).toHaveBeenNthCalledWith(2, "fateReroll", { messageId: "m2" });
  });
});
