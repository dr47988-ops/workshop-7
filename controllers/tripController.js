const service = require("../services/tripService");

const handle = action => async (req, res) => {
  try {
    await action(req, res);
  } catch (error) {
    const status = error.statusCode || (error.name === "ValidationError" || error.name === "CastError" ? 400 : 500);
    if (status === 500) console.error("Error de viajes:", error.message);
    res.status(status).json({ message: status === 500 ? "Error interno del servidor" : error.message });
  }
};

module.exports = {
  create: handle(async (req, res) => res.status(201).json({ trip: await service.createTrip(req.user.id, req.body) })),
  list: handle(async (req, res) => res.json({ trips: await service.listTrips(req.user.id) })),
  get: handle(async (req, res) => res.json({ trip: await service.getTrip(req.params.tripId, req.user.id) })),
  update: handle(async (req, res) => res.json({ trip: await service.updateTrip(req.params.tripId, req.user.id, req.body) })),
  remove: handle(async (req, res) => {
    await service.deleteTrip(req.params.tripId, req.user.id);
    res.status(204).end();
  }),
  addMember: handle(async (req, res) => res.status(201).json({ trip: await service.addMember(req.params.tripId, req.user.id, req.body) })),
  listMembers: handle(async (req, res) => res.json({ members: await service.listMembers(req.params.tripId, req.user.id) }))
};
