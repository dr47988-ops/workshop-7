
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const authRoutes = require("./routes/authRoutes");
const tripRoutes = require("./routes/tripRoutes");

const app = express();

// Configuración de CORS
app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));

// Permitir recibir datos JSON
app.use(express.json());

// Permitir leer cookies
app.use(cookieParser());

// Mantener respuestas JSON cuando el cuerpo de la solicitud es inválido.
app.use((error, req, res, next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ message: "El cuerpo debe ser un objeto JSON válido" });
  }
  next(error);
});

// Ruta principal
app.get("/", (req, res) => {
  res.status(200).json({
    message: "API de viajes compartidos funcionando"
  });
});

// Rutas de autenticación
app.use("/auth", authRoutes);
app.use("/trips", tripRoutes);

// Manejo de rutas inexistentes
app.use((req, res) => {
  res.status(404).json({
    message: "Ruta no encontrada"
  });
});

module.exports = app;
