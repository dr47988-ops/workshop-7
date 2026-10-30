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

### Pruebas automatizadas

Ejecutar `npm test`. La prueba levanta la aplicación y una instancia temporal
real de MongoDB mediante `mongodb-memory-server`, registra usuarios y verifica
los endpoints HTTP con cookies JWT. No utiliza la base de datos de `.env`.
La primera ejecución necesita Internet para descargar el binario de MongoDB.
La instancia temporal se elimina al finalizar.
