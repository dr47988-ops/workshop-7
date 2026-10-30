
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const userRepository = require("../repositories/userRepository");

// Registrar usuario
const register = async (name, email, password) => {
  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string" ||
    !name.trim() ||
    !email.trim() ||
    !email.includes("@") ||
    password.length < 8
  ) {
    const error = new Error(
      "Ingresa un nombre, correo válido y contraseña de mínimo 8 caracteres"
    );
    error.statusCode = 400;
    throw error;
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existingUser =
    await userRepository.findUserByEmail(normalizedEmail);

  if (existingUser) {
    const error = new Error("El correo ya está registrado");
    error.statusCode = 409;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  try {
    const user = await userRepository.createUser({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword
    });

    return {
      id: user._id,
      name: user.name,
      email: user.email
    };
  } catch (error) {
    if (error.code === 11000) {
      const conflict = new Error("El correo ya está registrado");
      conflict.statusCode = 409;
      throw conflict;
    }

    throw error;
  }
};

// Iniciar sesión
const login = async (email, password) => {
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    !password
  ) {
    const error = new Error("Correo y contraseña obligatorios");
    error.statusCode = 400;
    throw error;
  }

  const user = await userRepository.findUserByEmailWithPassword(
    email.trim().toLowerCase()
  );

  if (!user) {
    const error = new Error("Credenciales incorrectas");
    error.statusCode = 401;
    throw error;
  }

  const validPassword = await bcrypt.compare(
    password,
    user.password
  );

  if (!validPassword) {
    const error = new Error("Credenciales incorrectas");
    error.statusCode = 401;
    throw error;
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("Falta configurar JWT_SECRET");
  }

  const token = jwt.sign(
    { id: user._id.toString() },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  return {
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email
    }
  };
};

module.exports = {
  register,
  login
};
