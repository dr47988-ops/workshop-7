
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const userRepository = require("../repositories/userRepository");

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({
        message: "Acceso denegado. Debes iniciar sesión"
      });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("Falta configurar JWT_SECRET");
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET,
      { algorithms: ["HS256"] }
    );

    if (
      !decoded.id ||
      !mongoose.isValidObjectId(decoded.id)
    ) {
      return res.status(401).json({
        message: "Sesión inválida"
      });
    }

    const user = await userRepository.findUserById(
      decoded.id
    );

    if (!user) {
      return res.status(401).json({
        message: "El usuario ya no existe"
      });
    }

    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email
    };

    next();
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError" ||
      error.name === "NotBeforeError"
    ) {
      return res.status(401).json({
        message: "Sesión inválida o expirada"
      });
    }

    console.error("Error de autenticación:", error.message);

    return res.status(500).json({
      message: "Error interno de autenticación"
    });
  }
};

module.exports = authMiddleware;
