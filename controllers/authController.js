
const authService = require("../services/authService");

const COOKIE_NAME = "token";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/"
};

// Registrar usuario
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const user = await authService.register(
      name,
      email,
      password
    );

    return res.status(201).json({
      message: "Usuario registrado correctamente",
      user
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.statusCode
        ? error.message
        : "Error interno del servidor"
    });
  }
};

// Iniciar sesión
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await authService.login(email, password);

    res.cookie(COOKIE_NAME, result.token, {
      ...cookieOptions,
      maxAge: 24 * 60 * 60 * 1000
    });

    return res.status(200).json({
      message: "Inicio de sesión exitoso",
      user: result.user
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.statusCode
        ? error.message
        : "Error interno del servidor"
    });
  }
};

// Cerrar sesión
const logout = (req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions);

  return res.status(200).json({
    message: "Sesión cerrada correctamente"
  });
};

module.exports = {
  register,
  login,
  logout
};
