// @ts-check
// pf1 adapter. Single-d20 checks (skills, saves, ability checks, initiative)
// are one target, "0". Attack cards keep each attack's rolls in
// message.system.rolls.attacks; each attack is its own target ("attack-N"),
// and its fated result gets a compact card of its own, because pf1 renders
// attack cards once and can't redraw them from data.

import { MODULE_ID } from "../core/constants.js";
import { escapeHtml } from "../ui/purchaseMessage.js";
import { appendFateDie, isD20Term, parseRoll, readD20 } from "./common.js";

/** @typedef {import("../rules/fateReroll.js").FateRerollResult} FateRerollResult */

const ATTACK = /^attack-(\d+)$/;

/** @param {any} message */
function kindOf(message) {
  if (message.flags?.core?.initiativeRoll) return "initiative";
  const subject = message.system?.subject ?? {};
  if (subject.skill) return "skill";
  if (subject.save) return "save";
  if (subject.ability) return "ability";
  if (subject.core === "init") return "initiative";
  return "other";
}

/**
 * RollInfo for one pf1 d20 roll, or null.
 * @param {unknown} rawRoll
 * @param {string} kind
 * @param {string} actorId
 */
function d20Info(rawRoll, kind, actorId) {
  const roll = /** @type {any} */ (parseRoll(rawRoll));
  if (roll?.class !== "D20RollPF" || !roll.evaluated) return null;
  const die = roll.terms?.[0];
  if (!isD20Term(die)) return null;
  const d20 = readD20(die, "normal");
  if (!d20) return null;
  return {
    kind,
    mode: /** @type {const} */ ("normal"),
    ...d20,
    total: roll.total,
    modifier: roll.total - d20.keptNatural,
    critThreshold: typeof roll.options?.critical === "number" ? roll.options.critical : 20,
    target: null,
    actorId,
  };
}

/** @param {any} message */
function getRollInfo(message) {
  const actorId = message?.speaker?.actor;
  if (!actorId || !Array.isArray(message.rolls) || message.rolls.length === 0) return null;
  return d20Info(message.rolls[0], kindOf(message), actorId);
}

/** @param {any} message */
function getRollTargets(message) {
  const actorId = message?.speaker?.actor;
  if (!actorId) return [];
  const single = getRollInfo(message);
  if (single) return [{ target: "0", info: single, roll: parseRoll(message.rolls[0]) }];
  const attacks = message.system?.rolls?.attacks;
  if (!Array.isArray(attacks)) return [];
  return attacks.flatMap((/** @type {any} */ entry, /** @type {number} */ i) => {
    const info = entry?.attack ? d20Info(entry.attack, "attack", actorId) : null;
    return info ? [{ target: `attack-${i}`, info, roll: parseRoll(entry.attack) }] : [];
  });
}

/** Where a target's Fate Reroll button goes: an attack's own row. */
const controlAnchor = (/** @type {string} */ target) => {
  const match = ATTACK.exec(target);
  return match ? `.chat-attack[data-index="${match[1]}"]` : null;
};

/**
 * What a fated attack means for critical hits. Only an unboosted natural die
 * in the crit range threatens.
 * @param {{ attack: any, outcome: FateRerollResult, critThreshold: number }} input
 * @returns {{ status: "original" | "none" | "new" | "kept" | "lost", natural20: boolean, natural1: boolean }}
 */
export function planAttackCrit({ attack, outcome, critThreshold }) {
  if (outcome.kept !== "fate") return { status: "original", natural20: false, natural1: false };
  const results = attack?.attack?.terms?.[0]?.results ?? [];
  const original = results.find((/** @type {any} */ r) => r.active && !r.discarded)?.result ?? 0;
  const wasThreat = original >= critThreshold;
  const natural = outcome.result.bonus === 0 ? outcome.result.natural : null;
  const isThreat = natural !== null && natural >= critThreshold;
  const status = isThreat ? (wasThreat ? "kept" : "new") : wasThreat ? "lost" : "none";
  return { status, natural20: natural === 20, natural1: natural === 1 };
}

/**
 * Extra d20s the GM must roll: a confirmation for a new crit threat.
 * @param {{ message: any, target: string, info: any, outcome: FateRerollResult }} args
 */
function extraD20s({ message, target, info, outcome }) {
  const match = ATTACK.exec(target);
  if (!match) return 0;
  const attack = message.system?.rolls?.attacks?.[Number(match[1])];
  return planAttackCrit({ attack, outcome, critThreshold: info.critThreshold }).status === "new"
    ? 1
    : 0;
}

/** Decode the few entities pf1 uses in text, so it can be escaped once. */
const decode = (/** @type {string} */ text) =>
  text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");

/** The weapon name from an attack card's header ("Longsword (Attack)" → "Longsword"). */
function itemNameOf(/** @type {string} */ content) {
  const header = /<h3 class="item-name">([\s\S]*?)<\/h3>/.exec(content ?? "")?.[1] ?? "";
  return decode(header.trim()).replace(/\s*\([^()]*\)$/, "");
}

/** Fill {placeholders} in an escaped template with escaped values. */
const fill = (/** @type {string} */ template, /** @type {Record<string, unknown>} */ values) =>
  escapeHtml(template).replace(/\{(\w+)\}/g, (whole, key) =>
    key in values ? escapeHtml(String(values[key])) : whole,
  );

/**
 * @typedef {object} AttackLabels
 * @property {string} title "{item}, {attack}: {total} (was {was})"
 * @property {string} original
 * @property {string} newThreat "{total}", "{natural}", "{modifier}", "{mult}"
 * @property {string} keptThreat
 * @property {string} lostThreat
 * @property {string} natural20
 * @property {string} natural1
 */

/**
 * The fated result of one attack, as a compact card of its own. Returns null
 * for plain checks, which use the normal fated card.
 * @param {{ original: any, target: string, rollData: any, outcome: FateRerollResult, info: any, userId: string, extraDice: number[], labels: AttackLabels }} input
 */
function buildFatedMessageData({
  original,
  target,
  rollData,
  outcome,
  info,
  userId,
  extraDice,
  labels,
}) {
  const match = ATTACK.exec(target);
  if (!match) return null;
  const index = Number(match[1]);
  const attack = original.system?.rolls?.attacks?.[index];
  const plan = planAttackCrit({ attack, outcome, critThreshold: info.critThreshold });
  const lines = [
    fill(labels.title, {
      item: itemNameOf(original.content),
      attack: attack?.attack?.options?.flavor ?? `#${index + 1}`,
      total: rollData.total,
      was: info.total,
    }),
  ];
  if (plan.status === "original") lines.push(fill(labels.original, {}));
  if (plan.natural20) lines.push(fill(labels.natural20, {}));
  if (plan.natural1) lines.push(fill(labels.natural1, {}));
  if (plan.status === "new" && extraDice.length > 0) {
    lines.push(
      fill(labels.newThreat, {
        total: extraDice[0] + info.modifier,
        natural: extraDice[0],
        modifier: info.modifier,
        mult: original.system?.config?.critMult ?? 2,
      }),
    );
  }
  if (plan.status === "kept") lines.push(fill(labels.keptThreat, {}));
  if (plan.status === "lost") lines.push(fill(labels.lostThreat, {}));

  return {
    author: userId,
    speaker: original.speaker,
    whisper: original.whisper ?? [],
    blind: Boolean(original.blind),
    content: `<div class="fate-dice-attack">${lines.map((l) => `<p>${l}</p>`).join("")}</div>`,
    flags: {
      [MODULE_ID]: {
        fatedFrom: original._id,
        target,
        outcome,
        roll: rollData,
        confirmDice: extraDice,
      },
    },
  };
}

/**
 * @param {any} originalRoll
 * @param {any} info
 * @param {FateRerollResult} outcome
 */
const buildFatedRoll = (originalRoll, info, outcome) =>
  appendFateDie(originalRoll, info, outcome).roll;

export const pf1Adapter = {
  id: "pf1",
  getRollInfo,
  getRollTargets,
  controlAnchor,
  extraD20s,
  buildFatedRoll,
  buildFatedMessageData,
};
