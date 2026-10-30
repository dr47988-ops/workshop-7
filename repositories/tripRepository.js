const Trip = require("../models/Trip");

module.exports = {
  createTrip: data => Trip.create(data),
  findTripsByUser: userId => Trip.find({ members: userId }).sort({ createdAt: -1 }),
  findTripById: id => Trip.findById(id),
  updateTrip: (id, owner, data) => Trip.findOneAndUpdate(
    { _id: id, owner }, { $set: data }, { returnDocument: 'after', runValidators: true }
  ),
  deleteTrip: (id, owner) => Trip.findOneAndDelete({ _id: id, owner }),
  addMember: (id, owner, userId) => Trip.findOneAndUpdate(
    { _id: id, owner, members: { $ne: userId } },
    { $addToSet: { members: userId } }, { returnDocument: 'after', runValidators: true }
  ),
  findMembers: id => Trip.findById(id).populate("members", "name email")
};

