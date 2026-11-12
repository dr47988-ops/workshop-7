
const router = require("express").Router();
const auth = require("../middlewares/authMiddleware");
const controller = require("../controllers/tripController");

/**
 * @openapi
 * tags:
 *   - name: Viajes
 *     description: Gestión de viajes compartidos.
 *   - name: Participantes
 *     description: Administración y consulta de miembros de viajes.
 *
 * components:
 *   parameters:
 *     TripId:
 *       name: tripId
 *       in: path
 *       required: true
 *       description: Identificador MongoDB del viaje.
 *       schema:
 *         type: string
 *         example: "507f1f77bcf86cd799439011"
 *
 *   schemas:
 *     TripInput:
 *       type: object
 *       required:
 *         - name
 *         - destination
 *         - startDate
 *         - endDate
 *       additionalProperties: false
 *       properties:
 *         name:
 *           type: string
 *           maxLength: 120
 *           example: "Viaje a Guanacaste"
 *         destination:
 *           type: string
 *           maxLength: 200
 *           example: "Tamarindo"
 *         description:
 *           type: string
 *           maxLength: 2000
 *           example: "Viaje de vacaciones con amigos"
 *         startDate:
 *           type: string
 *           format: date-time
 *           example: "2027-01-15T00:00:00.000Z"
 *         endDate:
 *           type: string
 *           format: date-time
 *           example: "2027-01-20T00:00:00.000Z"
 *
 *     TripUpdate:
 *       type: object
 *       description: Enviar al menos uno de los campos permitidos.
 *       minProperties: 1
 *       additionalProperties: false
 *       properties:
 *         name:
 *           type: string
 *           maxLength: 120
 *           example: "Viaje actualizado"
 *         destination:
 *           type: string
 *           maxLength: 200
 *         description:
 *           type: string
 *           maxLength: 2000
 *         startDate:
 *           type: string
 *           format: date-time
 *         endDate:
 *           type: string
 *           format: date-time
 *
 *     Trip:
 *       allOf:
 *         - $ref: '#/components/schemas/TripInput'
 *         - type: object
 *           properties:
 *             _id:
 *               type: string
 *               example: "507f1f77bcf86cd799439011"
 *             owner:
 *               type: string
 *               example: "507f191e810c19729de860ea"
 *             members:
 *               type: array
 *               items:
 *                 type: string
 *               example:
 *                 - "507f191e810c19729de860ea"
 *             createdAt:
 *               type: string
 *               format: date-time
 *             updatedAt:
 *               type: string
 *               format: date-time
 *
 *     TripResponse:
 *       type: object
 *       properties:
 *         trip:
 *           $ref: '#/components/schemas/Trip'
 *
 *     TripError:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Error en la solicitud"
 *
 *     TripMember:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "507f191e810c19729de860ea"
 *         name:
 *           type: string
 *           example: "Daniela"
 *         email:
 *           type: string
 *           format: email
 *           example: "daniela@example.com"
 */

/**
 * @openapi
 * /trips:
 *   post:
 *     tags:
 *       - Viajes
 *     summary: Crear un viaje
 *     description: >
 *       Crea un viaje. El usuario autenticado queda como
 *       propietario y primer miembro del viaje.
 *       La fecha final no puede ser anterior a la inicial.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TripInput'
 *     responses:
 *       201:
 *         description: Viaje creado correctamente.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TripResponse'
 *       400:
 *         description: Datos inválidos o fechas incorrectas.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TripError'
 *       401:
 *         description: Usuario no autenticado.
 *       500:
 *         description: Error interno del servidor.
 *
 *   get:
 *     tags:
 *       - Viajes
 *     summary: Listar mis viajes
 *     description: >
 *       Devuelve los viajes en los que participa
 *       el usuario autenticado.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Lista de viajes.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 trips:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Trip'
 *       401:
 *         description: Usuario no autenticado.
 *       500:
 *         description: Error interno del servidor.
 */

/**
 * @openapi
 * /trips/{tripId}:
 *   get:
 *     tags:
 *       - Viajes
 *     summary: Consultar un viaje
 *     description: Solo los miembros pueden consultar el viaje.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/TripId'
 *     responses:
 *       200:
 *         description: Datos del viaje.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TripResponse'
 *       400:
 *         description: Identificador inválido.
 *       401:
 *         description: Usuario no autenticado.
 *       403:
 *         description: El usuario no es miembro del viaje.
 *       404:
 *         description: Viaje no encontrado.
 *
 *   patch:
 *     tags:
 *       - Viajes
 *     summary: Actualizar un viaje
 *     description: >
 *       Solo el propietario puede modificar el viaje.
 *       Permite actualizar uno o varios campos.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/TripId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TripUpdate'
 *     responses:
 *       200:
 *         description: Viaje actualizado.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TripResponse'
 *       400:
 *         description: Datos o identificador inválidos.
 *       401:
 *         description: Usuario no autenticado.
 *       403:
 *         description: Solo el propietario puede actualizar.
 *       404:
 *         description: Viaje no encontrado.
 *
 *   delete:
 *     tags:
 *       - Viajes
 *     summary: Eliminar un viaje
 *     description: Solo el propietario puede eliminar el viaje.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/TripId'
 *     responses:
 *       204:
 *         description: Viaje eliminado. No devuelve contenido.
 *       400:
 *         description: Identificador inválido.
 *       401:
 *         description: Usuario no autenticado.
 *       403:
 *         description: Solo el propietario puede eliminar.
 *       404:
 *         description: Viaje no encontrado.
 */

/**
 * @openapi
 * /trips/{tripId}/members:
 *   post:
 *     tags:
 *       - Participantes
 *     summary: Agregar participante
 *     description: >
 *       Solo el propietario puede agregar usuarios existentes
 *       que todavía no sean miembros del viaje.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/TripId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             additionalProperties: false
 *             properties:
 *               userId:
 *                 type: string
 *                 description: ID del usuario que será agregado.
 *                 example: "507f191e810c19729de860ea"
 *     responses:
 *       201:
 *         description: Participante agregado correctamente.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TripResponse'
 *       400:
 *         description: Identificador o datos inválidos.
 *       401:
 *         description: Usuario no autenticado.
 *       403:
 *         description: Solo el propietario puede agregar miembros.
 *       404:
 *         description: Viaje o usuario no encontrado.
 *       409:
 *         description: El usuario ya pertenece al viaje.
 *
 *   get:
 *     tags:
 *       - Participantes
 *     summary: Consultar participantes
 *     description: >
 *       Permite a los miembros de un viaje consultar
 *       los usuarios que forman parte de él.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/TripId'
 *     responses:
 *       200:
 *         description: Lista de participantes.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 members:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/TripMember'
 *       400:
 *         description: Identificador inválido.
 *       401:
 *         description: Usuario no autenticado.
 *       403:
 *         description: El usuario no pertenece al viaje.
 *       404:
 *         description: Viaje no encontrado.
 */

// Todas las rutas requieren autenticación.
router.use(auth);

// Operaciones sobre viajes
router.post("/", controller.create);
router.get("/", controller.list);
router.get("/:tripId", controller.get);
router.patch("/:tripId", controller.update);
router.delete("/:tripId", controller.remove);

// Operaciones sobre participantes
router.post("/:tripId/members", controller.addMember);
router.get("/:tripId/members", controller.listMembers);

module.exports = router;
