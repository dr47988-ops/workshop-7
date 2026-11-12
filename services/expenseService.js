const mongoose = require("mongoose");
const expenses = require("../repositories/expenseRepository");
const { authorizedTrip } = require("./tripService");

const fail = (statusCode, message) => {
  throw Object.assign(new Error(message), { statusCode });
};
const validId = id => typeof id === "string" && mongoose.isObjectIdOrHexString(id);
const has = (data, key) => Object.hasOwn(data, key);
const fields = ["description", "amount", "paidBy", "splitType", "participants", "splits"];
const toCents = value => Math.round(value * 100);

// Montos positivos (o cero en un split) con máximo 2 decimales.
function validAmount(value, allowZero = false) {
  return typeof value === "number" && Number.isFinite(value) && value <= 1e9 &&
    (allowZero ? value >= 0 : value > 0) && Math.abs(value * 100 - toCents(value)) < 1e-6;
}

function validateData(body, partial = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) fail(400, "Envía un objeto JSON");
  if (!Object.keys(body).length || Object.keys(body).some(key => !fields.includes(key))) {
    fail(400, "Envía únicamente campos permitidos: " + fields.join(", "));
  }
  if (!partial) {
    for (const key of ["description", "amount"]) if (!has(body, key)) fail(400, `El campo ${key} es obligatorio`);
  }
  if (has(body, "description") && (typeof body.description !== "string" || !body.description.trim() || body.description.trim().length > 300)) {
    fail(400, "El campo description debe ser texto válido de máximo 300 caracteres");
  }
  if (has(body, "amount") && !validAmount(body.amount)) {
    fail(400, "El campo amount debe ser un número mayor que 0 con máximo 2 decimales");
  }
  if (has(body, "splitType") && !["equal", "custom"].includes(body.splitType)) {
    fail(400, "El campo splitType debe ser equal o custom");
  }
  return has(body, "description") ? { ...body, description: body.description.trim() } : { ...body };
}

function memberId(trip, value, field) {
  if (!validId(value)) fail(400, `El campo ${field} debe contener identificadores válidos`);
  if (!trip.members.some(id => id.toString() === value)) fail(400, `El usuario de ${field} debe ser miembro del viaje`);
  return value;
}

// equal: divide el monto entre participants (por defecto todos los miembros);
// los centavos sobrantes se asignan a los primeros participantes.
// custom: splits [{ user, amount }] cuya suma debe ser igual al monto.
function buildSplits(trip, amount, splitType, participants, splits) {
  const cents = toCents(amount);
  if (splitType === "equal") {
    if (splits !== undefined) fail(400, "El reparto equal usa participants; splits solo aplica a custom");
    const users = participants === undefined ? trip.members.map(String) : participants;
    if (!Array.isArray(users) || !users.length) fail(400, "El campo participants debe ser una lista no vacía de miembros");
    users.forEach(user => memberId(trip, user, "participants"));
    if (new Set(users).size !== users.length) fail(400, "El campo participants no admite usuarios repetidos");
    const base = Math.floor(cents / users.length);
    const extra = cents % users.length;
    return users.map((user, index) => ({ user, amount: (base + (index < extra ? 1 : 0)) / 100 }));
  }
  if (participants !== undefined) fail(400, "El reparto custom usa splits; participants solo aplica a equal");
  if (!Array.isArray(splits) || !splits.length) fail(400, "El campo splits debe ser una lista no vacía de { user, amount }");
  const result = splits.map(split => {
    if (!split || typeof split !== "object" || Array.isArray(split) || Object.keys(split).some(key => !["user", "amount"].includes(key))) {
      fail(400, "Cada elemento de splits debe tener únicamente user y amount");
    }
    if (!validAmount(split.amount, true)) fail(400, "Cada split debe tener un monto válido de máximo 2 decimales");
    return { user: memberId(trip, split.user, "splits"), amount: split.amount };
  });
  if (new Set(result.map(split => split.user)).size !== result.length) fail(400, "El campo splits no admite usuarios repetidos");
  if (result.reduce((sum, split) => sum + toCents(split.amount), 0) !== cents) {
    fail(400, "La suma de splits debe ser igual al monto del gasto");
  }
  return result;
}

async function authorizedExpense(expenseId, userId) {
  if (!validId(expenseId)) fail(400, "Identificador de gasto inválido");
  const expense = await expenses.findExpenseById(expenseId);
  if (!expense) fail(404, "Gasto no encontrado");
  const trip = await authorizedTrip(expense.trip.toString(), userId);
  if (expense.createdBy.toString() !== userId && trip.owner.toString() !== userId) {
    fail(403, "Solo el creador del gasto o el propietario del viaje puede modificarlo o eliminarlo");
  }
  return { expense, trip };
}

module.exports = {
  async createExpense(tripId, userId, body) {
    const trip = await authorizedTrip(tripId, userId);
    const data = validateData(body);
    const splitType = data.splitType || "equal";
    const expense = await expenses.createExpense({
      trip: trip._id,
      description: data.description,
      amount: data.amount,
      paidBy: has(data, "paidBy") ? memberId(trip, data.paidBy, "paidBy") : userId,
      createdBy: userId,
      splitType,
      splits: buildSplits(trip, data.amount, splitType, data.participants, data.splits)
    });
    return expenses.findExpenseWithUsers(expense._id);
  },
  async listExpenses(tripId, userId) {
    await authorizedTrip(tripId, userId);
    const list = await expenses.findExpensesByTrip(tripId);
    return { expenses: list, total: list.reduce((sum, expense) => sum + toCents(expense.amount), 0) / 100 };
  },
  async updateExpense(expenseId, userId, body) {
    const { expense, trip } = await authorizedExpense(expenseId, userId);
    const data = validateData(body, true);
    const update = {};
    if (has(data, "description")) update.description = data.description;
    if (has(data, "paidBy")) update.paidBy = memberId(trip, data.paidBy, "paidBy");
    if (["amount", "splitType", "participants", "splits"].some(key => has(data, key))) {
      const amount = has(data, "amount") ? data.amount : expense.amount;
      const splitType = data.splitType || expense.splitType;
      // Si no se envía un nuevo reparto, se conserva el de los miembros actuales del gasto.
      const current = expense.splits.map(split => ({ user: split.user.toString(), amount: split.amount }));
      const participants = has(data, "participants") ? data.participants
        : splitType === "equal" && !has(data, "splits") ? current.map(split => split.user) : undefined;
      const splits = has(data, "splits") ? data.splits
        : splitType === "custom" && !has(data, "participants") ? current : undefined;
      Object.assign(update, { amount, splitType, splits: buildSplits(trip, amount, splitType, participants, splits) });
    }
    const updated = await expenses.updateExpense(expenseId, update);
    if (!updated) fail(404, "Gasto no encontrado");
    return updated;
  },
  async deleteExpense(expenseId, userId) {
    await authorizedExpense(expenseId, userId);
    if (!await expenses.deleteExpense(expenseId)) fail(404, "Gasto no encontrado");
  }
};
