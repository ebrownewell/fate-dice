// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
  addNominationControls,
  buildNominationContent,
  nominationCardModel,
} from "../../scripts/ui/nominationCard.js";

/** @returns {any} */
const nomination = (/** @type {Partial<any>} */ extra = {}) => ({
  id: "n1",
  nominatorId: "ann",
  actorId: "bob-hero",
  reason: "Held the door",
  session: 1,
  mode: "vote",
  status: "pending",
  eligible: ["ann", "cat", "dan"],
  votes: { ann: true },
  createdAt: 1,
  ...extra,
});

const viewer = (/** @type {string} */ id, isGM = false) => ({ id, isGM });

describe("nominationCardModel", () => {
  it("lets an eligible player vote in vote mode, showing the tally", () => {
    expect(nominationCardModel(nomination(), viewer("cat"))).toEqual({
      status: "pending",
      mode: "vote",
      canVote: true,
      myVote: null,
      canDecide: false,
      canFinalize: false,
      tally: { yes: 1, no: 0, eligible: 3 },
    });
  });

  it("shows a voter their current vote", () => {
    expect(nominationCardModel(nomination(), viewer("ann")).myVote).toBe(true);
  });

  it("doesn't let the nominee's owner vote", () => {
    expect(nominationCardModel(nomination(), viewer("bob")).canVote).toBe(false);
  });

  it("lets the GM accept the result in vote mode, and decide in GM mode", () => {
    expect(nominationCardModel(nomination(), viewer("gm", true))).toMatchObject({
      canVote: false,
      canFinalize: true,
      canDecide: false,
    });
    expect(nominationCardModel(nomination({ mode: "gm" }), viewer("gm", true))).toMatchObject({
      canDecide: true,
      canFinalize: false,
    });
  });

  it("offers nothing on a closed nomination", () => {
    expect(
      nominationCardModel(nomination({ status: "approved" }), viewer("gm", true)),
    ).toMatchObject({
      canVote: false,
      canDecide: false,
      canFinalize: false,
    });
  });
});

describe("buildNominationContent", () => {
  it("says who nominated whom and why, escaping everything", () => {
    const html = buildNominationContent({
      nominatorName: "Ann <b>",
      actorName: "Bob's Hero",
      reason: "<script>x</script>",
      template: "{nominator} nominates {actor} for a Fate Die",
    });
    expect(html).toContain(
      "Ann &lt;b&gt; nominates <strong>Bob&#39;s Hero</strong> for a Fate Die",
    );
    expect(html).toContain("<blockquote>&lt;script&gt;x&lt;/script&gt;</blockquote>");
    expect(html).not.toContain("<script>");
  });
});

describe("addNominationControls", () => {
  const labels = {
    yes: "Yes",
    no: "No",
    approve: "Approve",
    deny: "Deny",
    finalize: "Accept result now",
    pending: "Waiting for the GM",
    tally: "{yes} yes, {no} no of {eligible}",
    approved: "Approved: +1 Fate Die",
    rejected: "Not approved",
  };

  /** @param {any} model */
  function render(model, handlers = {}) {
    const root = document.createElement("li");
    root.innerHTML = `<div class="message-content"><p>card</p></div>`;
    addNominationControls(root, model, { labels, ...handlers });
    return root;
  }

  it("shows Yes/No and the tally to a voter, marking their vote", () => {
    const root = render(nominationCardModel(nomination(), viewer("ann")));
    const buttons = [...root.querySelectorAll("button")].map((b) => [
      b.textContent,
      b.classList.contains("active"),
    ]);
    expect(buttons).toEqual([
      ["Yes", true],
      ["No", false],
    ]);
    expect(root.querySelector(".fate-dice-nomination-tally")?.textContent).toBe("1 yes, 0 no of 3");
  });

  it("calls onVote with the choice", () => {
    const onVote = vi.fn(async () => {});
    const root = render(nominationCardModel(nomination(), viewer("cat")), { onVote });
    /** @type {HTMLButtonElement} */ (root.querySelectorAll("button")[1]).click();
    expect(onVote).toHaveBeenCalledWith(false);
  });

  it("shows Approve/Deny to the GM in GM mode, and the waiting status to players", () => {
    const onDecide = vi.fn(async () => {});
    const gmRoot = render(nominationCardModel(nomination({ mode: "gm" }), viewer("gm", true)), {
      onDecide,
    });
    /** @type {HTMLButtonElement} */ (gmRoot.querySelector("button")).click();
    expect(onDecide).toHaveBeenCalledWith(true);
    const playerRoot = render(nominationCardModel(nomination({ mode: "gm" }), viewer("cat")));
    expect(playerRoot.querySelector("button")).toBeNull();
    expect(playerRoot.querySelector(".fate-dice-nomination-status")?.textContent).toBe(
      "Waiting for the GM",
    );
  });

  it("shows the result on a closed nomination", () => {
    const root = render(nominationCardModel(nomination({ status: "approved" }), viewer("cat")));
    expect(root.querySelector(".fate-dice-nomination-status")?.textContent).toBe(
      "Approved: +1 Fate Die",
    );
    expect(root.querySelector("button")).toBeNull();
  });

  it("never adds a second set of controls on re-render", () => {
    const root = document.createElement("li");
    const model = nominationCardModel(nomination(), viewer("cat"));
    addNominationControls(root, model, { labels });
    addNominationControls(root, model, { labels });
    expect(root.querySelectorAll(".fate-dice-nomination-controls")).toHaveLength(1);
  });
});
