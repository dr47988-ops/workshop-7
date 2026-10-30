const mongoose = require("mongoose");

const tripSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  destination: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 2000, default: "" },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
}, { timestamps: true });

tripSchema.pre("validate", function () {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    this.invalidate("endDate", "La fecha final debe ser igual o posterior a la inicial");
  }
  if (this.owner && !this.members.some(id => id.equals(this.owner))) {
    this.members.push(this.owner);
  }
});
tripSchema.index({ members: 1, createdAt: -1 });

module.exports = mongoose.model("Trip", tripSchema);
