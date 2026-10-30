const mongoose = require("mongoose");
const trips = require("../repositories/tripRepository");
const users = require("../repositories/userRepository");

const fail = (statusCode, message) => {
  throw Object.assign(new Error(message), { statusCode });
};
const validId = id => typeof id === "string" && mongoose.isObjectIdOrHexString(id);
const fields = ["name", "destination", "description", "startDate", "endDate"];

function validateData(data, partial = false) {
  if (!data || typeof data !== "object" || Array.isArray(data)) fail(400, "Envía un objeto JSON");
  if (!Object.keys(data).length || Object.keys(data).some(key => !fields.includes(key))) {
    fail(400, "Envía únicamente campos permitidos: " + fields.join(", "));
  }
  const result = {};
  for (const key of fields) {
    if (!Object.hasOwn(data, key)) {
      if (!partial && key !== "description") fail(400, `El campo ${key} es obligatorio`);
      continue;
    }
    if (["startDate", "endDate"].includes(key)) {
      if (typeof data[key] !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(data[key]) || Number.isNaN(Date.parse(data[key]))) {
        fail(400, `El campo ${key} debe ser una fecha ISO válida`);
      }
      result[key] = new Date(data[key]);
    } else {
      const max = { name: 120, destination: 200, description: 2000 }[key];
      if (typeof data[key] !== "string" || (key !== "description" && !data[key].trim()) || data[key].trim().length > max) {
        fail(400, `El campo ${key} debe ser texto válido de máximo ${max} caracteres`);
      }
      result[key] = data[key].trim();
    }
  }
  return result;
}

async function authorizedTrip(tripId, userId, ownerOnly = false) {
  if (!validId(tripId)) fail(400, "Identificador de viaje inválido");
  const trip = await trips.findTripById(tripId);
  if (!trip) fail(404, "Viaje no encontrado");
  if (ownerOnly ? trip.owner.toString() !== userId : !trip.members.some(id => id.toString() === userId)) {
    fail(403, ownerOnly ? "Solo el propietario puede administrar el viaje" : "Debes ser miembro del viaje");
  }
  return trip;
}

function validateDates(data) {
  if (data.endDate < data.startDate) fail(400, "La fecha final debe ser igual o posterior a la inicial");
}

module.exports = {
  async createTrip(userId, body) {
    const data = validateData(body);
    validateDates(data);
    return trips.createTrip({ ...data, owner: userId, members: [userId] });
  },
  listTrips: userId => trips.findTripsByUser(userId),
  getTrip: (tripId, userId) => authorizedTrip(tripId, userId),
  async updateTrip(tripId, userId, body) {
    const trip = await authorizedTrip(tripId, userId, true);
    const data = validateData(body, true);
    validateDates({ startDate: data.startDate || trip.startDate, endDate: data.endDate || trip.endDate });
    const updated = await trips.updateTrip(tripId, userId, data);
    if (!updated) fail(404, "Viaje no encontrado");
    return updated;
  },
  async deleteTrip(tripId, userId) {
    await authorizedTrip(tripId, userId, true);
    if (!await trips.deleteTrip(tripId, userId)) fail(404, "Viaje no encontrado");
  },
  async addMember(tripId, userId, body) {
    const trip = await authorizedTrip(tripId, userId, true);
    if (!body || Object.keys(body).length !== 1 || !validId(body.userId)) fail(400, "Envía únicamente un userId válido");
    if (!await users.findUserById(body.userId)) fail(404, "Usuario no encontrado");
    if (trip.members.some(id => id.toString() === body.userId)) fail(409, "El usuario ya es miembro del viaje");
    const updated = await trips.addMember(tripId, userId, body.userId);
    if (!updated) {
      await authorizedTrip(tripId, userId, true);
      fail(409, "El usuario ya es miembro del viaje");
    }
    return updated;
  },
  async listMembers(tripId, userId) {
    await authorizedTrip(tripId, userId);
    const trip = await trips.findMembers(tripId);
    if (!trip) fail(404, "Viaje no encontrado");
    return trip.members;
  }
};
