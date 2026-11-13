# Casos de prueba

Tabla de casos de prueba de la API de viajes compartidos y gastos.

**Actores usados en las pruebas**

- **Propietario:** usuario que creó el viaje.
- **Miembro:** usuario agregado al viaje por el propietario.
- **Ajeno:** usuario registrado que no pertenece al viaje.
- **Sin sesión:** solicitud sin cookie `token`.

**Datos base:** contraseña `Workshop123!`; viaje válido `{ name: "Vacaciones", destination: "Liberia", startDate: "2027-01-10", endDate: "2027-01-15" }`.

La columna **Auto.** indica si el caso está automatizado (✅) y en qué archivo de `tests/`.

## 1. Autenticación (`tests/auth.test.js`)

| ID | Escenario | Datos | Resultado esperado | Auto. |
|---|---|---|---|---|
| AUTH-01 | Registro válido | `name`, `email` con mayúsculas y espacios, `password` de 8 caracteres o más | `201`; usuario con `id`, `name` y `email` normalizados; contraseña guardada como hash; sin cookie | ✅ auth |
| AUTH-02 | Registro con datos inválidos | Cuerpo vacío, nombre vacío, correo sin `@`, contraseña de 7 caracteres, contraseña numérica | `400` con `message`; no se crea ningún usuario; sin cookie | ✅ auth |
| AUTH-03 | Registro con correo duplicado | Mismo correo con otras mayúsculas | `409` "El correo ya está registrado" | ✅ auth |
| AUTH-04 | Login válido | Correo y contraseña correctos | `200`; cookie `token` con `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age=86400`; JWT con el `id` del usuario | ✅ auth |
| AUTH-05 | Login con credenciales incorrectas | Contraseña errónea o correo no registrado | `401` "Credenciales incorrectas"; sin cookie | ✅ auth |
| AUTH-06 | Login incompleto | Solo `email` | `400`; sin cookie | ✅ auth |
| AUTH-07 | Ruta protegida con sesión | `GET /auth/me` y `GET /trips` con cookie válida | `200`; perfil del usuario / lista de viajes | ✅ auth |
| AUTH-08 | Ruta protegida sin sesión | `GET /auth/me` y `GET /trips` sin cookie | `401` | ✅ auth |
| AUTH-09 | Token inválido o expirado | JWT firmado con otro secreto o con `exp` vencido | `401` | ✅ auth |
| AUTH-10 | Cerrar sesión | `POST /auth/logout` con cookie válida | `200` "Sesión cerrada correctamente"; cookie `token` vaciada y expirada; acceso posterior `401` | ✅ auth |

## 2. Viajes (`tests/trips.test.js`)

| ID | Escenario | Datos | Resultado esperado | Auto. |
|---|---|---|---|---|
| TRIP-01 | Crear viaje | Viaje válido, propietario | `201`; el creador queda como `owner` y como miembro | ✅ trips |
| TRIP-02 | Crear viaje sin descripción | Viaje válido sin `description` | `201` | ✅ trips |
| TRIP-03 | Crear viaje sin sesión | Viaje válido, sin cookie | `401` | ✅ trips |
| TRIP-04 | Cuerpo vacío o no objeto | `null`, `{}`, `[]` | `400` | ✅ trips |
| TRIP-05 | Falta un campo obligatorio | Sin `name`, `destination`, `startDate` o `endDate` | `400` | ✅ trips |
| TRIP-06 | Tipo o contenido inválido | `name` vacío, numérico u objeto (`{ $ne: "" }`); textos más largos que el máximo | `400` | ✅ trips |
| TRIP-07 | Fechas inválidas o inexistentes | `"incorrecta"`, `2027-02-30`, `2027-02-29`, `2027-04-31`, número | `400` | ✅ trips |
| TRIP-08 | Fecha final anterior a la inicial | `endDate: 2027-01-01` | `400` | ✅ trips |
| TRIP-09 | Fecha final igual a la inicial | `endDate: 2027-01-10` | `201` | ✅ trips |
| TRIP-10 | Campos no permitidos | `owner` en el cuerpo | `400` | ✅ trips |
| TRIP-11 | Listar viajes | Propietario y ajeno | `200`; cada uno ve solo los viajes donde participa | ✅ trips |
| TRIP-12 | Consultar viaje: propietario | `GET /trips/:id` | `200` | ✅ trips |
| TRIP-13 | Consultar viaje: miembro | `GET /trips/:id` y `GET /trips` | `200`; el viaje aparece en su lista | ✅ trips |
| TRIP-14 | Consultar viaje: ajeno | `GET /trips/:id` | `403` | ✅ trips |
| TRIP-15 | Consultar sin sesión | `GET /trips` y `GET /trips/:id` | `401` | ✅ trips |
| TRIP-16 | Viaje inexistente | ObjectId válido sin documento | `404` | ✅ trips |
| TRIP-17 | Id mal formado | `id-invalido` | `400` | ✅ trips |
| TRIP-18 | Modificar: propietario | Uno o varios campos | `200`; el cambio también lo ve el miembro | ✅ trips |
| TRIP-19 | Modificar: miembro | `{ name: "Prohibido" }` | `403`; el viaje no cambia | ✅ trips |
| TRIP-20 | Modificar: ajeno | `{ name: "Prohibido" }` | `403`; el viaje no cambia | ✅ trips |
| TRIP-21 | Modificar sin sesión | `{ name: "Prohibido" }` | `401` | ✅ trips |
| TRIP-22 | Modificar con datos inválidos | `{}`, `name` vacío o numérico, fechas inválidas, `owner`, `members` | `400` | ✅ trips |
| TRIP-23 | Modificar inexistente / id inválido | ObjectId sin documento / `id-invalido` | `404` / `400` | ✅ trips |
| TRIP-24 | Eliminar: propietario | `DELETE /trips/:id` | `204`; consulta posterior `404`; desaparece de la lista de los miembros | ✅ trips |
| TRIP-25 | Eliminar: miembro o ajeno | `DELETE /trips/:id` | `403`; el viaje sigue existiendo | ✅ trips |
| TRIP-26 | Eliminar sin sesión | `DELETE /trips/:id` | `401` | ✅ trips |
| TRIP-27 | Eliminar inexistente / id inválido | ObjectId sin documento / `id-invalido` | `404` / `400` | ✅ trips |

## 3. Participantes (`tests/trips.test.js`)

| ID | Escenario | Datos | Resultado esperado | Auto. |
|---|---|---|---|---|
| MEM-01 | Agregar participante: propietario | `{ userId }` de un usuario existente | `201` | ✅ trips |
| MEM-02 | Agregar participante: miembro o ajeno | `{ userId }` | `403` | ✅ trips |
| MEM-03 | Agregar a quien ya es miembro | `userId` de un miembro o del propietario | `409` | ✅ trips |
| MEM-04 | Agregar usuario inexistente | ObjectId sin usuario | `404` | ✅ trips |
| MEM-05 | `userId` inválido o campos extra | `{}`, `"malo"`, `123`, `{ userId, extra: true }` | `400` | ✅ trips |
| MEM-06 | Agregar a viaje inexistente | ObjectId sin viaje | `404` | ✅ trips |
| MEM-07 | Ver participantes: propietario o miembro | `GET /trips/:id/members` | `200`; sin contraseñas ni datos sensibles | ✅ trips |
| MEM-08 | Ver participantes: ajeno | `GET /trips/:id/members` | `403` | ✅ trips |
| MEM-09 | Ver participantes sin sesión | `GET /trips/:id/members` | `401` | ✅ trips |

## 4. Gastos (`tests/expenses.test.js`)

| ID | Escenario | Datos | Resultado esperado | Auto. |
|---|---|---|---|---|
| EXP-01 | Registrar o consultar sin sesión | `POST` / `GET /trips/:id/expenses` | `401` | ✅ expenses |
| EXP-02 | Registrar o consultar: ajeno | `POST` / `GET /trips/:id/expenses` | `403` | ✅ expenses |
| EXP-03 | Viaje con id inválido / inexistente | `GET /trips/invalid/expenses` / ObjectId sin viaje | `400` / `404` | ✅ expenses |
| EXP-04 | Registrar con datos inválidos | Cuerpo vacío; sin `description` o `amount`; `amount` 0, negativo, texto o con 3 decimales; `trip` o `createdBy` en el cuerpo; `paidBy` ajeno o mal formado; `splitType` desconocido; participantes vacíos, ajenos o repetidos; `splits` sin `custom`; `custom` sin `splits`, con suma distinta del total, con usuarios repetidos o campos extra | `400` | ✅ expenses |
| EXP-05 | Reparto equitativo entre todos | `{ description: "Hotel", amount: 100 }`, propietario | `201`; `splitType: "equal"`; reparto `33.34 / 33.33 / 33.33`; `paidBy` sin contraseña | ✅ expenses |
| EXP-06 | Reparto equitativo entre algunos, pagado por otro | `amount: 45.5`, `paidBy` y `participants` indicados, miembro | `201`; `22.75` a cada participante | ✅ expenses |
| EXP-07 | Reparto personalizado | `splitType: "custom"`, `splits` que suman el total | `201`; `splitType: "custom"` | ✅ expenses |
| EXP-08 | Consultar gastos: miembro | `GET /trips/:id/expenses` | `200`; lista de gastos y `total` (225.5) | ✅ expenses |
| EXP-09 | Modificar sin sesión | `PATCH /expenses/:id` | `401` | ✅ expenses |
| EXP-10 | Modificar o eliminar: no autorizado | Usuario ajeno, o miembro que pagó el gasto pero no lo creó | `403` | ✅ expenses |
| EXP-11 | Modificar gasto con id inválido / inexistente | `invalid` / ObjectId sin gasto | `400` / `404` | ✅ expenses |
| EXP-12 | Modificar con datos inválidos | `{}`, `amount: 0`, `trip`, `custom` sin `splits`, participante ajeno | `400` | ✅ expenses |
| EXP-13 | Modificar: creador del gasto | `{ amount: 60, description: "Cena en la playa" }` | `200`; el reparto se recalcula (`30 / 30`) | ✅ expenses |
| EXP-14 | Modificar: propietario del viaje | Gasto `custom` creado por otro; nuevo `amount` con `splits` coherentes | `200`; sin `splits` coherentes devuelve `400` | ✅ expenses |
| EXP-15 | Cambiar a reparto equitativo | `{ splitType: "equal" }` | `200`; reparto recalculado | ✅ expenses |
| EXP-16 | Eliminar: creador o propietario del viaje | `DELETE /expenses/:id` | `204`; volver a eliminarlo devuelve `404` | ✅ expenses |
| EXP-17 | Cascada al eliminar el viaje | `DELETE /trips/:id` | `204`; sus gastos ya no existen (`404`) | ✅ expenses |

## 5. Generales

| ID | Escenario | Datos | Resultado esperado | Auto. |
|---|---|---|---|---|
| GEN-01 | JSON mal formado | Cuerpo `{ "name": ` | `400` "El cuerpo debe ser un objeto JSON válido" | Manual |
| GEN-02 | Ruta inexistente | `GET /no-existe` | `404` "Ruta no encontrada" | Manual |
| GEN-03 | Documentación disponible | `GET /docs` y `GET /openapi.json` | `200`; Scalar carga la especificación | Manual |
