const Expense = require("../models/Expense");

const withUsers = query => query.populate("paidBy createdBy splits.user", "name email");

module.exports = {
  createExpense: data => Expense.create(data),
  findExpensesByTrip: tripId => withUsers(Expense.find({ trip: tripId }).sort({ createdAt: -1 })),
  findExpenseById: id => Expense.findById(id),
  findExpenseWithUsers: id => withUsers(Expense.findById(id)),
  updateExpense: (id, data) => withUsers(Expense.findByIdAndUpdate(
    id, { $set: data }, { returnDocument: 'after', runValidators: true }
  )),
  deleteExpense: id => Expense.findByIdAndDelete(id),
  deleteExpensesByTrip: tripId => Expense.deleteMany({ trip: tripId })
};
