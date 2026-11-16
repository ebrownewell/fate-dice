import { describe, expect, it } from "vitest";
import {
  DEGREE_NAMES,
  degreeOfSuccess,
  rewriteDegreeHtml,
} from "../../scripts/rules/pf2eDegree.js";
import { loadMessage } from "../helpers/fixtures.js";

const degree = (/** @type {Partial<any>} */ input) =>
  degreeOfSuccess({ total: 10, dc: 15, natural: 10, boosted: false, ...input });

describe("degreeOfSuccess (pf2e)", () => {
  it.each([
    [25, 3],
    [24, 2],
    [15, 2],
    [14, 1],
    [6, 1],
    [5, 0],
  ])("total %i against DC 15 is degree %i", (total, expected) => {
    expect(degree({ total })).toBe(expected);
  });

  it("a natural 20 improves the degree by one step, up to critical success", () => {
    expect(degree({ total: 14, natural: 20 })).toBe(2);
    expect(degree({ total: 30, natural: 20 })).toBe(3);
  });

  it("a natural 1 worsens the degree by one step, down to critical failure", () => {
    expect(degree({ total: 15, natural: 1 })).toBe(1);
    expect(degree({ total: 2, natural: 1 })).toBe(0);
  });

  it("a boosted fate die never shifts the degree, even on a natural 1", () => {
    expect(degree({ total: 15, natural: 1, boosted: true })).toBe(2);
  });

  it("names the degrees the way pf2e does", () => {
    expect(DEGREE_NAMES).toEqual(["criticalFailure", "failure", "success", "criticalSuccess"]);
  });
});

describe("rewriteDegreeHtml", () => {
  const flavor = loadMessage("pf2e", "skill-dc").flavor;

  it("replaces the result shown on a recorded pf2e card", () => {
    const html = rewriteDegreeHtml(flavor, { degree: 2, label: "Success", margin: 2 });
    expect(html).toContain('<span class="success">Success</span>');
    expect(html).toContain(">by +2</span>");
    expect(html).not.toContain("Critical Failure");
    expect(html).not.toContain("by -13");
  });

  it("writes negative margins with a minus sign", () => {
    expect(rewriteDegreeHtml(flavor, { degree: 1, label: "Failure", margin: -3 })).toContain(
      ">by -3</span>",
    );
  });

  it("leaves everything else on the card alone", () => {
    const html = rewriteDegreeHtml(flavor, { degree: 2, label: "Success", margin: 2 });
    expect(html).toContain("<strong>Athletics Check</strong>");
    expect(html).toContain("DC 15");
  });

  it("escapes the label", () => {
    expect(rewriteDegreeHtml(flavor, { degree: 2, label: "<b>", margin: 0 })).toContain(
      "&lt;b&gt;",
    );
  });

  it("returns cards without a result unchanged", () => {
    const plain = loadMessage("pf2e", "skill").flavor;
    expect(rewriteDegreeHtml(plain, { degree: 2, label: "Success", margin: 0 })).toBe(plain);
  });
});
