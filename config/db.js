const mongoose = require("mongoose");

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("Falta configurar MONGO_URI en .env");
  }

  await mongoose.connect(process.env.MONGO_URI);

  console.log("MongoDB conectado correctamente");
};

module.exports = connectDB;