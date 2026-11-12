const mongoose = require("mongoose");

const splitSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  amount: { type: Number, required: true, min: 0 }
}, { _id: false });

const expenseSchema = new mongoose.Schema({
  trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", required: true },
  description: { type: String, required: true, trim: true, maxlength: 300 },
  amount: { type: Number, required: true, min: 0.01, max: 1e9 },
  paidBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  splitType: { type: String, enum: ["equal", "custom"], default: "equal" },
  splits: {
    type: [splitSchema],
    validate: { validator: splits => splits.length > 0, message: "El gasto debe distribuirse entre al menos un miembro" }
  }
}, { timestamps: true });

expenseSchema.index({ trip: 1, createdAt: -1 });

module.exports = mongoose.model("Expense", expenseSchema);
