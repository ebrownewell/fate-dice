// @ts-check
// Nominations in Foundry: the service's dependencies (chat cards hold each
// nomination), live card controls, and the Nominate dialog.

import { getActorPoints } from "../core/actorPoints.js";
import { MODULE_ID } from "../core/constants.js";
import { createNominationService } from "../core/nominationService.js";
import { selectParty } from "../core/party.js";
import { readSettings } from "../core/settings.js";
import {
  addNominationControls,
  buildNominationContent,
  nominationCardModel,
} from "../ui/nominationCard.js";
import { escapeHtml } from "../ui/purchaseMessage.js";
import { notifyError } from "./notify.js";

const FLAG = "nomination";
const t = (/** @type {string} */ key, /** @type {object} */ data = {}) =>
  game.i18n.format(key, data);

/** Player (non-GM) owners of an actor. */
const ownerIdsOf = (/** @type {any} */ actor) =>
  game.users
    .filter((/** @type {any} */ u) => !u.isGM && actor.testUserPermission(u, "OWNER"))
    .map((/** @type {any} */ u) => u.id);

const nominationMessages = () =>
  game.messages.contents.filter((/** @type {any} */ m) => m.getFlag(MODULE_ID, FLAG));

const messageFor = (/** @type {string} */ id) =>
  nominationMessages().find((/** @type {any} */ m) => m.getFlag(MODULE_ID, FLAG).id === id);

/** @param {{ fateService: any }} deps */
export function createFoundryNominationService({ fateService }) {
  return createNominationService({
    getUser: (id) => game.users.get(id),
    getActor: (id) => {
      const party = /** @type {any[]} */ (selectParty(game.actors));
      const actor = party.find((a) => a.id === id);
      return actor ? { id: actor.id, ownerIds: ownerIdsOf(actor) } : undefined;
    },
    getPoints: (actor) => getActorPoints(game.actors.get(actor.id)),
    getSettings: () => readSettings(game.settings, MODULE_ID),
    getSession: () => game.settings.get(MODULE_ID, "session"),
    activePlayerIds: () =>
      game.users
        .filter((/** @type {any} */ u) => u.active && !u.isGM)
        .map((/** @type {any} */ u) => u.id),
    listNominations: () =>
      nominationMessages().map((/** @type {any} */ m) => m.getFlag(MODULE_ID, FLAG)),
    findNomination: (id) => messageFor(id)?.getFlag(MODULE_ID, FLAG),
    async createNomination(nom) {
      const nominator = game.users.get(nom.nominatorId);
      await ChatMessage.create({
        author: nom.nominatorId,
        speaker: { alias: nominator?.name },
        content: buildNominationContent({
          nominatorName: nominator?.name ?? "?",
          actorName: game.actors.get(nom.actorId)?.name ?? "?",
          reason: nom.reason,
          template: game.i18n.localize("FATEDICE.Nomination.Card"),
        }),
        flags: { [MODULE_ID]: { [FLAG]: nom } },
      });
    },
    saveNomination: (nom) => messageFor(nom.id)?.setFlag(MODULE_ID, FLAG, nom),
    awardNominee: (nom) =>
      fateService.award(
        {
          actorIds: [nom.actorId],
          amount: 1,
          reason: `${t("FATEDICE.Nomination.AwardReason", { name: game.users.get(nom.nominatorId)?.name ?? "?" })}: ${nom.reason}`,
        },
        { userId: game.user.id },
      ),
    newId: () => foundry.utils.randomID(),
    now: () => Date.now(),
  });
}

/** @param {{ bus: any }} deps */
export function registerNominationHooks({ bus }) {
  const labels = () => ({
    yes: t("FATEDICE.Nomination.Yes"),
    no: t("FATEDICE.Nomination.No"),
    approve: t("FATEDICE.Nomination.Approve"),
    deny: t("FATEDICE.Nomination.Deny"),
    finalize: t("FATEDICE.Nomination.Finalize"),
    pending: t("FATEDICE.Nomination.Pending"),
    tally: game.i18n.localize("FATEDICE.Nomination.Tally"),
    approved: t("FATEDICE.Nomination.Approved"),
    rejected: t("FATEDICE.Nomination.Rejected"),
  });
  const request = (/** @type {string} */ action, /** @type {object} */ payload) =>
    bus.request(action, payload).catch((/** @type {unknown} */ err) => {
      notifyError(err);
      throw err;
    });

  Hooks.on(
    "renderChatMessageHTML",
    (/** @type {any} */ message, /** @type {HTMLElement} */ html) => {
      const nom = message.getFlag(MODULE_ID, FLAG);
      if (!nom) return;
      addNominationControls(html, nominationCardModel(nom, game.user), {
        labels: labels(),
        onVote: (approve) => request("vote", { nominationId: nom.id, approve }),
        onDecide: (approve) => request("decide", { nominationId: nom.id, approve }),
        onFinalize: () => request("finalize", { nominationId: nom.id }),
      });
    },
  );
}

/**
 * Ask the player whom to nominate and why, then send it.
 * @param {{ api: any }} deps
 */
export async function openNominateDialog({ api }) {
  const choices = selectParty(game.actors).filter((/** @type {any} */ a) => !a.isOwner);
  if (!choices.length) return ui.notifications.info(t("FATEDICE.Nomination.NobodyToNominate"));
  const options = choices
    .map((/** @type {any} */ a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`)
    .join("");
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("FATEDICE.Nomination.Title") },
    content: `<p>${t("FATEDICE.Nomination.Intro")}</p>
      <div class="form-group"><label>${t("FATEDICE.Nomination.Who")}</label>
        <select name="actorId">${options}</select></div>
      <div class="form-group stacked"><label>${t("FATEDICE.Nomination.Why")}</label>
        <textarea name="reason" rows="3" maxlength="500"></textarea></div>`,
    ok: {
      label: t("FATEDICE.Nomination.Send"),
      callback: (/** @type {Event} */ _e, /** @type {any} */ button) => ({
        actorId: button.form.elements.actorId.value,
        reason: button.form.elements.reason.value,
      }),
    },
    rejectClose: false,
  });
  if (!result) return;
  await api.nominate(result.actorId, result.reason).catch(notifyError);
}
