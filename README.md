# workshop-7
API REST para gestionar viajes compartidos, participantes y gastos, desarrollada con Node.js, Express y MongoDB, con autenticación mediante cookies y control de permisos.

## Gestión de viajes y participantes (Persona 2)

Instalación: `npm ci`. Copiar `.env.example` a `.env`, configurar MongoDB y
`JWT_SECRET`, y ejecutar `npm run dev` (puerto predeterminado 3000).
Todos los endpoints de viajes requieren iniciar sesión en `POST /auth/login`;
la autenticación usa la cookie `token`.

### Crear un viaje

`POST /trips`, cuerpo JSON:

```json
{
  "name": "Vacaciones",
  "destination": "Guanacaste",
  "description": "Viaje compartido",
  "startDate": "2027-01-10",
  "endDate": "2027-01-15"
}
```

`name`, `destination`, `startDate` y `endDate` son obligatorios; `description`
es opcional. La fecha final debe ser igual o posterior a la inicial.
El servidor asigna al usuario autenticado como propietario y primer miembro.
No se permite enviar `owner` ni `members` en creación o actualización.

| Método y ruta | Resultado | Permiso |
| --- | --- | --- |
| POST /trips | 201, `{ trip }` | Usuario autenticado |
| GET /trips | 200, `{ trips }`, ordenados del más reciente | Solo viajes donde el usuario es miembro |
| GET /trips/:tripId | 200, `{ trip }` | Miembro |
| PATCH /trips/:tripId | 200, `{ trip }` | Propietario |
| DELETE /trips/:tripId | 204, sin cuerpo | Propietario |
| POST /trips/:tripId/members | 201, `{ trip }` | Propietario |
| GET /trips/:tripId/members | 200, `{ members }` | Miembro |

Para agregar participantes enviar `{ "userId": "ID_DEL_USUARIO_REGISTRADO" }`.
La lista de participantes incluye al propietario y expone solamente ID, nombre
 y correo. No admite duplicados (409). PATCH admite cualquier subconjunto
no vacío de los cinco campos editables de creación.

Errores: 400 para datos o identificadores inválidos, 401 sin sesión válida,
403 por permisos insuficientes, 404 para viaje o usuario inexistente, y 409
para participantes repetidos. Las respuestas de error tienen `{ message }`.

### Pruebas de Postman

Importar `postman/trips.postman_collection.json`, ajustar `baseUrl` si es
necesario y ejecutar toda la colección en orden con Collection Runner.
Mantener habilitadas las cookies de Postman. Cada ejecución registra tres
usuarios con correos únicos, inicia sesión sucesivamente con cada uno y
comprueba creación, consultas, actualización, participantes, permisos,
eliminación y acceso sin sesión. Los usuarios de prueba permanecen en la BD;
el viaje se elimina al finalizar correctamente.

## Gastos

Todos los endpoints de gastos requieren sesión. Un gasto siempre pertenece a
un viaje; al eliminar el viaje se eliminan también sus gastos.

### Registrar un gasto

`POST /trips/:tripId/expenses`, cuerpo JSON:

```json
{
  "description": "Hotel",
  "amount": 100,
  "paidBy": "ID_DEL_MIEMBRO_QUE_PAGO",
  "splitType": "equal",
  "participants": ["ID_MIEMBRO_1", "ID_MIEMBRO_2"]
}
```

`description` y `amount` son obligatorios. `amount` debe ser un número mayor
que 0 con máximo 2 decimales. `paidBy` es opcional (por defecto el usuario
autenticado) y debe ser miembro del viaje. El servidor asigna `createdBy` y
`trip`; no se pueden enviar.

Formas de distribuir el costo (`splitType`):

- `equal` (predeterminado): divide el monto en partes iguales entre
  `participants`. Si no se envía, se reparte entre todos los miembros. Los
  centavos sobrantes se asignan a los primeros participantes (100 entre 3 =
  33.34, 33.33, 33.33).
- `custom`: requiere `splits`, una lista de `{ "user", "amount" }` cuya suma
  debe ser igual a `amount`.

```json
{
  "description": "Tour",
  "amount": 80,
  "splitType": "custom",
  "splits": [
    { "user": "ID_MIEMBRO_1", "amount": 50 },
    { "user": "ID_MIEMBRO_2", "amount": 30 }
  ]
}
```

Todos los usuarios de `participants` y `splits` deben ser miembros del viaje,
sin repetidos. El gasto se responde con `paidBy`, `createdBy` y `splits.user`
poblados con ID, nombre y correo.

| Método y ruta | Resultado | Permiso |
| --- | --- | --- |
| POST /trips/:tripId/expenses | 201, `{ expense }` | Miembro del viaje |
| GET /trips/:tripId/expenses | 200, `{ expenses, total }`, del más reciente | Miembro del viaje |
| PATCH /expenses/:expenseId | 200, `{ expense }` | Creador del gasto o propietario del viaje |
| DELETE /expenses/:expenseId | 204, sin cuerpo | Creador del gasto o propietario del viaje |

PATCH admite cualquier subconjunto no vacío de los campos de creación. Si
cambia `amount` o `splitType` sin enviar un nuevo reparto, se recalcula entre
los mismos usuarios del reparto actual; en `custom` la suma debe seguir
coincidiendo con el monto.

Errores: 400 para datos, montos, repartos o identificadores inválidos, 401 sin
sesión, 403 si el usuario no es miembro del viaje o no es creador del gasto ni
propietario del viaje, y 404 para viaje o gasto inexistente.

### Pruebas de Postman de gastos

Importar `postman/expenses.postman_collection.json` y ejecutarla completa con
Collection Runner, igual que la de viajes. Registra propietario, miembro y
usuario externo; comprueba repartos equitativo y personalizado, validaciones de
monto, consulta, permisos de edición y eliminación, eliminación en cascada al
borrar el viaje y acceso sin sesión.

### Pruebas automatizadas

Ejecutar `npm test`. La prueba levanta la aplicación y una instancia temporal
real de MongoDB mediante `mongodb-memory-server`, registra usuarios y verifica
los endpoints HTTP con cookies JWT. No utiliza la base de datos de `.env`.
La primera ejecución necesita Internet para descargar el binario de MongoDB.
La instancia temporal se elimina al finalizar.
