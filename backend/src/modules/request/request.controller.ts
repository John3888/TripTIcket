import type { RequestHandler } from "express";
import * as service from "./request.services.js";
import { kioskStore, publicStore } from "../store/store.services.js";
import { emitNotification, emitStoreUpdated } from "../../realtime.js";
export const create: RequestHandler = async (request, response) => {
  const createResult = await service.createTripRequest({
    ...request.body,
    rfidToken: request.body.rfidToken || request.cookies?.EMB_TTR_RFID_PROOF,
  });
  emitStoreUpdated();
  createResult.notifications.forEach(emitNotification);
  response.json({ ...(await kioskStore()), createdRequest: createResult.request });
};
export const action: RequestHandler = async (request, response) => {
  const actionResult = await service.processTripRequestAction(
    String(request.params.id),
    {
      ...request.body,
      rfidToken: request.body.rfidToken || request.cookies?.EMB_TTR_RFID_PROOF,
    },
    request.auth,
  );
  emitStoreUpdated();
  actionResult.notifications.forEach(emitNotification);
  response.json(
    request.auth && !["start", "complete"].includes(request.body.action)
      ? await publicStore({ actor: request.auth, page: "pending" })
      : await kioskStore(),
  );
};
export const remove: RequestHandler = async (request, response) => {
  await service.deleteTripRequest(String(request.params.id));
  emitStoreUpdated();
  if (!request.auth) throw new Error("Authenticated administrator context was not available.");
  response.json(await publicStore({ actor: request.auth, page: "pending" }));
};
