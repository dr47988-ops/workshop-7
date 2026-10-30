
const express = require("express");

const authController = require("../controllers/authController");
const authMiddleware = require("../middlewares/authMiddleware");

const router = express.Router();

// Registrar usuario
router.post("/register", authController.register);

// Iniciar sesión
router.post("/login", authController.login);

// Cerrar sesión
router.post("/logout", authMiddleware, authController.logout);

// Consultar usuario autenticado
router.get("/me", authMiddleware, (req, res) => {
  res.status(200).json({
    message: "Usuario autenticado",
    user: req.user
  });
});

module.exports = router;
