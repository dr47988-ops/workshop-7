const service = require("../services/expenseService");

const handle = action => async (req, res) => {
  try {
    await action(req, res);
  } catch (error) {
    const status = error.statusCode || (error.name === "ValidationError" || error.name === "CastError" ? 400 : 500);
    if (status === 500) console.error("Error de gastos:", error.message);
    res.status(status).json({ message: status === 500 ? "Error interno del servidor" : error.message });
  }
};

module.exports = {
  create: handle(async (req, res) => res.status(201).json({ expense: await service.createExpense(req.params.tripId, req.user.id, req.body) })),
  list: handle(async (req, res) => res.json(await service.listExpenses(req.params.tripId, req.user.id))),
  update: handle(async (req, res) => res.json({ expense: await service.updateExpense(req.params.expenseId, req.user.id, req.body) })),
  remove: handle(async (req, res) => {
    await service.deleteExpense(req.params.expenseId, req.user.id);
    res.status(204).end();
  })
};
