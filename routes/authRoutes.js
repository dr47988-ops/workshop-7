
const express = require("express");

const authController = require("../controllers/authController");
const authMiddleware = require("../middlewares/authMiddleware");

const router = express.Router();

/**
 * @openapi
 * tags:
 *   - name: Autenticación
 *     description: Registro, inicio y cierre de sesión de usuarios.
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     AuthUser:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           example: "507f1f77bcf86cd799439011"
 *         name:
 *           type: string
 *           example: "Daniela"
 *         email:
 *           type: string
 *           format: email
 *           example: "daniela@example.com"
 *
 *     AuthError:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Error en la solicitud"
 */

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags:
 *       - Autenticación
 *     summary: Registrar un usuario
 *     description: Crea un usuario con nombre, correo y contraseña.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Daniela"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "daniela@example.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: "Clave12345"
 *     responses:
 *       201:
 *         description: Usuario registrado correctamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Usuario registrado correctamente"
 *                 user:
 *                   $ref: '#/components/schemas/AuthUser'
 *       400:
 *         description: Datos inválidos.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthError'
 *       409:
 *         description: El correo ya está registrado.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthError'
 *       500:
 *         description: Error interno del servidor.
 */
router.post("/register", authController.register);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags:
 *       - Autenticación
 *     summary: Iniciar sesión
 *     description: >
 *       Verifica las credenciales y establece una cookie
 *       HttpOnly llamada token, con duración de 24 horas.
 *       La cookie utiliza SameSite=Lax y Secure en producción.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "daniela@example.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "Clave12345"
 *     responses:
 *       200:
 *         description: Inicio de sesión exitoso.
 *         headers:
 *           Set-Cookie:
 *             description: Cookie JWT de autenticación.
 *             schema:
 *               type: string
 *               example: "token=JWT; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Inicio de sesión exitoso"
 *                 user:
 *                   $ref: '#/components/schemas/AuthUser'
 *       400:
 *         description: Datos de inicio de sesión inválidos.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthError'
 *       401:
 *         description: Credenciales incorrectas.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthError'
 *       500:
 *         description: Error interno del servidor.
 */
router.post("/login", authController.login);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags:
 *       - Autenticación
 *     summary: Cerrar sesión
 *     description: >
 *       Elimina la cookie de autenticación token.
 *       No requiere una sesión activa, por lo que también
 *       permite eliminar cookies expiradas o inválidas.
 *     security: []
 *     responses:
 *       200:
 *         description: Sesión cerrada correctamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Sesión cerrada correctamente"
 */
router.post("/logout", authController.logout);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags:
 *       - Autenticación
 *     summary: Consultar usuario autenticado
 *     description: >
 *       Devuelve los datos del usuario de la sesión.
 *       Requiere una cookie token válida.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Usuario autenticado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Usuario autenticado"
 *                 user:
 *                   $ref: '#/components/schemas/AuthUser'
 *       401:
 *         description: Sesión inexistente, inválida o expirada.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthError'
 *       500:
 *         description: Error interno del servidor.
 */
router.get("/me", authMiddleware, (req, res) => {
  res.status(200).json({
    message: "Usuario autenticado",
    user: req.user
  });
});

module.exports = router;
