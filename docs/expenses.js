
/**
 * @openapi
 * tags:
 *   - name: Gastos
 *     description: Registro, consulta, modificación y eliminación de gastos de viajes.
 *
 * components:
 *   schemas:
 *     ExpenseInput:
 *       type: object
 *       required:
 *         - description
 *         - amount
 *       additionalProperties: false
 *       properties:
 *         description:
 *           type: string
 *           maxLength: 300
 *           example: "Almuerzo del grupo"
 *         amount:
 *           type: number
 *           minimum: 0.01
 *           maximum: 1000000000
 *           multipleOf: 0.01
 *           example: 15000
 *         paidBy:
 *           type: string
 *           description: ID del miembro que pagó. Por defecto, el usuario autenticado.
 *           example: "507f191e810c19729de860ea"
 *         splitType:
 *           type: string
 *           enum: [equal, custom]
 *           default: equal
 *         participants:
 *           type: array
 *           description: IDs de participantes para reparto equal. Por defecto, todos los miembros.
 *           items:
 *             type: string
 *           example:
 *             - "507f191e810c19729de860ea"
 *             - "507f1f77bcf86cd799439011"
 *         splits:
 *           type: array
 *           description: Reparto custom. Los montos deben sumar el total del gasto.
 *           items:
 *             type: object
 *             required: [user, amount]
 *             properties:
 *               user:
 *                 type: string
 *               amount:
 *                 type: number
 *           example:
 *             - user: "507f191e810c19729de860ea"
 *               amount: 10000
 *             - user: "507f1f77bcf86cd799439011"
 *               amount: 5000
 *
 *     ExpenseUpdate:
 *       allOf:
 *         - $ref: '#/components/schemas/ExpenseInput'
 *       description: >
 *         Permite actualizar uno o varios campos. No se requieren
 *         description ni amount al actualizar.
 *
 *     Expense:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "507f1f77bcf86cd799439012"
 *         trip:
 *           type: string
 *           description: Identificador del viaje.
 *         description:
 *           type: string
 *           example: "Almuerzo del grupo"
 *         amount:
 *           type: number
 *           example: 15000
 *         paidBy:
 *           description: Usuario que realizó el pago.
 *         createdBy:
 *           description: Usuario que registró el gasto.
 *         splitType:
 *           type: string
 *           enum: [equal, custom]
 *         splits:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               user:
 *                 description: Participante del reparto.
 *               amount:
 *                 type: number
 *           example:
 *             - user: "507f191e810c19729de860ea"
 *               amount: 7500
 *             - user: "507f1f77bcf86cd799439011"
 *               amount: 7500
 *
 *     ExpenseError:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Error en la solicitud"
 */

/**
 * @openapi
 * /trips/{tripId}/expenses:
 *   post:
 *     tags: [Gastos]
 *     summary: Registrar un gasto
 *     description: >
 *       Registra un gasto en un viaje del que el usuario es miembro.
 *       El reparto puede ser equal o custom.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/TripId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ExpenseInput'
 *           examples:
 *             igualitario:
 *               summary: Reparto igualitario
 *               value:
 *                 description: "Almuerzo del grupo"
 *                 amount: 15000
 *                 splitType: equal
 *             personalizado:
 *               summary: Reparto personalizado
 *               value:
 *                 description: "Almuerzo del grupo"
 *                 amount: 15000
 *                 splitType: custom
 *                 splits:
 *                   - user: "507f191e810c19729de860ea"
 *                     amount: 10000
 *                   - user: "507f1f77bcf86cd799439011"
 *                     amount: 5000
 *     responses:
 *       201:
 *         description: Gasto registrado correctamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 expense:
 *                   $ref: '#/components/schemas/Expense'
 *       400:
 *         description: Datos, monto, reparto o identificador inválidos.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExpenseError'
 *       401:
 *         description: Sesión inexistente o inválida.
 *       403:
 *         description: El usuario no pertenece al viaje.
 *       404:
 *         description: Viaje no encontrado.
 *       500:
 *         description: Error interno del servidor.
 *
 *   get:
 *     tags: [Gastos]
 *     summary: Consultar gastos de un viaje
 *     description: Solo los miembros pueden consultar los gastos.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/TripId'
 *     responses:
 *       200:
 *         description: Lista de gastos y total acumulado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 expenses:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Expense'
 *                 total:
 *                   type: number
 *                   example: 15000
 *       400:
 *         description: Identificador inválido.
 *       401:
 *         description: Usuario no autenticado.
 *       403:
 *         description: El usuario no pertenece al viaje.
 *       404:
 *         description: Viaje no encontrado.
 */

/**
 * @openapi
 * /expenses/{expenseId}:
 *   parameters:
 *     - name: expenseId
 *       in: path
 *       required: true
 *       description: Identificador MongoDB del gasto.
 *       schema:
 *         type: string
 *         example: "507f1f77bcf86cd799439012"
 *
 *   patch:
 *     tags: [Gastos]
 *     summary: Modificar un gasto
 *     description: >
 *       Solo el creador del gasto o el propietario del viaje
 *       puede actualizarlo.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             additionalProperties: false
 *             properties:
 *               description:
 *                 type: string
 *                 maxLength: 300
 *               amount:
 *                 type: number
 *                 minimum: 0.01
 *                 maximum: 1000000000
 *                 multipleOf: 0.01
 *               paidBy:
 *                 type: string
 *               splitType:
 *                 type: string
 *                 enum: [equal, custom]
 *               participants:
 *                 type: array
 *                 items:
 *                   type: string
 *               splits:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: string
 *                     amount:
 *                       type: number
 *           example:
 *             description: "Almuerzo actualizado"
 *     responses:
 *       200:
 *         description: Gasto actualizado correctamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 expense:
 *                   $ref: '#/components/schemas/Expense'
 *       400:
 *         description: Datos o identificador inválidos.
 *       401:
 *         description: Usuario no autenticado.
 *       403:
 *         description: Usuario sin permisos para modificar.
 *       404:
 *         description: Gasto o viaje no encontrado.
 *
 *   delete:
 *     tags: [Gastos]
 *     summary: Eliminar un gasto
 *     description: >
 *       Solo el creador del gasto o el propietario del viaje
 *       puede eliminarlo.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       204:
 *         description: Gasto eliminado sin contenido de respuesta.
 *       400:
 *         description: Identificador inválido.
 *       401:
 *         description: Usuario no autenticado.
 *       403:
 *         description: Usuario sin permisos para eliminar.
 *       404:
 *         description: Gasto o viaje no encontrado.
 */

module.exports = {};
