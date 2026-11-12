# Workshop 7 – API de Viajes Compartidos y Gastos

API REST para gestionar viajes compartidos, participantes y gastos, desarrollada con Node.js, Express y MongoDB, con autenticación mediante cookies y control de permisos.

## Instalación y configuración del proyecto

1. Clonar el repositorio desde GitHub.
2. Abrir la carpeta del proyecto en Visual Studio Code.
3. Instalar las dependencias:

   `npm ci`

4. Copiar el archivo `.env.example` a `.env` y configurar la conexión a MongoDB y la variable `JWT_SECRET`.
5. Iniciar el servidor:

   `npm run dev`

El servidor utiliza el puerto 3000 de forma predeterminada.

## Documentación interactiva con Scalar

La API cuenta con documentación interactiva desarrollada mediante **OpenAPI 3.0.3 y Scalar**, que permite consultar las rutas, los parámetros, los cuerpos de solicitud, los ejemplos de respuestas, los códigos HTTP y los permisos necesarios.

### Cómo abrir Scalar

1. Abrir el proyecto en Visual Studio Code.
2. Verificar que las dependencias estén instaladas mediante `npm ci`.
3. Iniciar el servidor ejecutando:

   `npm run dev`

4. Abrir un navegador e ingresar a:

   **http://localhost:3000/docs**

La documentación interactiva mostrará los endpoints organizados en cuatro secciones:

| Sección | Endpoints |
|---|---:|
| Autenticación | 4 |
| Viajes | 5 |
| Participantes | 2 |
| Gastos | 4 |
| **Total** | **15** |

### Especificación OpenAPI

La especificación de la API también está disponible en:

`http://localhost:3000/openapi.json`

La configuración principal se encuentra en `docs/swagger.js`.

Los archivos `routes/authRoutes.js`, `routes/tripRoutes.js` y `docs/expenses.js` contienen las definiciones OpenAPI correspondientes.

### Autenticación mediante cookies

La API utiliza una cookie llamada `token` para autenticar a los usuarios.

- El inicio de sesión se realiza mediante `POST /auth/login`.
- Después de iniciar sesión correctamente, el servidor establece una cookie JWT.
- La cookie utiliza `HttpOnly`, `SameSite=Lax` y tiene una duración de 24 horas.
- En producción se habilita la opción `Secure`.
- Las rutas protegidas requieren una sesión válida.
- El cierre de sesión se realiza mediante `POST /auth/logout`, que elimina la cookie y no requiere autenticación previa.

Scalar permite visualizar los requisitos de seguridad de cada endpoint. Para probar las rutas protegidas es necesario contar con una sesión válida y enviar la cookie correspondiente.

## Gestión de viajes y participantes (Persona 2)

Todos los endpoints de viajes requieren iniciar sesión en `POST /auth/login`; la autenticación utiliza la cookie `token`.

### Crear un viaje

`POST /trips`

Cuerpo JSON:

```json
{
  "name": "Vacaciones",
  "destination": "Guanacaste",
  "description": "Viaje compartido",
  "startDate": "2027-01-10",
  "endDate": "2027-01-15"
}
```

`name`, `destination`, `startDate` y `endDate` son obligatorios; `description` es opcional.

La fecha final debe ser igual o posterior a la inicial.

El servidor asigna al usuario autenticado como propietario y primer miembro. No se permite enviar `owner` ni `members` en creación o actualización.

| Método y ruta | Resultado | Permiso |
|---|---|---|
| POST /trips | 201, `{ trip }` | Usuario autenticado |
| GET /trips | 200, `{ trips }`, ordenados del más reciente | Solo viajes donde el usuario es miembro |
| GET /trips/:tripId | 200, `{ trip }` | Miembro |
| PATCH /trips/:tripId | 200, `{ trip }` | Propietario |
| DELETE /trips/:tripId | 204, sin cuerpo | Propietario |
| POST /trips/:tripId/members | 201, `{ trip }` | Propietario |
| GET /trips/:tripId/members | 200, `{ members }` | Miembro |

Para agregar participantes enviar:

```json
{
  "userId": "ID_DEL_USUARIO_REGISTRADO"
}
```

La lista de participantes incluye al propietario y expone solamente ID, nombre y correo.

No admite duplicados (409).

PATCH admite cualquier subconjunto no vacío de los cinco campos editables de creación.

**Errores:**

- 400: Datos o identificadores inválidos.
- 401: Sesión inexistente o inválida.
- 403: Permisos insuficientes.
- 404: Viaje o usuario inexistente.
- 409: Participantes repetidos.

Las respuestas de error contienen `{ message }`.

### Pruebas de Postman

Importar `postman/trips.postman_collection.json`, ajustar `baseUrl` si es necesario y ejecutar toda la colección en orden con Collection Runner.

Mantener habilitadas las cookies de Postman.

Cada ejecución registra tres usuarios con correos únicos, inicia sesión sucesivamente con cada uno y comprueba creación, consultas, actualización, participantes, permisos, eliminación y acceso sin sesión.

Los usuarios de prueba permanecen en la base de datos; el viaje se elimina al finalizar correctamente.

## Gestión de gastos (Persona 3 del Workshop 7)

Todos los endpoints de gastos requieren sesión.

Un gasto siempre pertenece a un viaje. Al eliminar el viaje se eliminan también sus gastos.

### Registrar un gasto

`POST /trips/:tripId/expenses`

Cuerpo JSON:

```json
{
  "description": "Hotel",
  "amount": 100,
  "paidBy": "ID_DEL_MIEMBRO_QUE_PAGO",
  "splitType": "equal",
  "participants": [
    "ID_MIEMBRO_1",
    "ID_MIEMBRO_2"
  ]
}
```

`description` y `amount` son obligatorios.

`amount` debe ser un número mayor que 0 con máximo 2 decimales.

`paidBy` es opcional (por defecto el usuario autenticado) y debe ser miembro del viaje.

El servidor asigna `createdBy` y `trip`; no se pueden enviar.

### Formas de distribuir el costo

**Equal (igualitario)**

Divide el monto en partes iguales entre `participants`.

Si no se envía, se reparte entre todos los miembros.

Los centavos sobrantes se asignan a los primeros participantes.

Ejemplo: 100 entre 3 = 33.34, 33.33 y 33.33.

**Custom (personalizado)**

Requiere `splits`, una lista de `{ "user", "amount" }` cuya suma debe ser igual a `amount`.

```json
{
  "description": "Tour",
  "amount": 80,
  "splitType": "custom",
  "splits": [
    {
      "user": "ID_MIEMBRO_1",
      "amount": 50
    },
    {
      "user": "ID_MIEMBRO_2",
      "amount": 30
    }
  ]
}
```

Todos los usuarios de `participants` y `splits` deben ser miembros del viaje, sin repetidos.

El gasto se responde con `paidBy`, `createdBy` y `splits.user` poblados con ID, nombre y correo.

### Endpoints de gastos

| Método y ruta | Resultado | Permiso |
|---|---|---|
| POST /trips/:tripId/expenses | 201, `{ expense }` | Miembro del viaje |
| GET /trips/:tripId/expenses | 200, `{ expenses, total }`, del más reciente | Miembro del viaje |
| PATCH /expenses/:expenseId | 200, `{ expense }` | Creador del gasto o propietario del viaje |
| DELETE /expenses/:expenseId | 204, sin cuerpo | Creador del gasto o propietario del viaje |

PATCH admite cualquier subconjunto no vacío de los campos de creación.

Si cambia `amount` o `splitType` sin enviar un nuevo reparto, se recalcula entre los mismos usuarios del reparto actual; en `custom` la suma debe seguir coincidiendo con el monto.

**Errores:**

- 400: Datos, montos, repartos o identificadores inválidos.
- 401: Sin sesión.
- 403: Usuario sin permisos.
- 404: Viaje o gasto inexistente.

### Pruebas de Postman de gastos

Importar `postman/expenses.postman_collection.json` y ejecutarla completa con Collection Runner, igual que la de viajes.

Registra propietario, miembro y usuario externo.

Comprueba repartos equitativo y personalizado, validaciones de monto, consulta, permisos de edición y eliminación, eliminación en cascada al borrar el viaje y acceso sin sesión.

## Pruebas automatizadas

Para ejecutar las pruebas automatizadas utilizar:

```bash
npm test
```

Las pruebas levantan la aplicación y una instancia temporal real de MongoDB mediante `mongodb-memory-server`.

Registran usuarios y verifican los endpoints HTTP utilizando cookies JWT.

Las pruebas no utilizan la base de datos configurada en `.env`.

La primera ejecución necesita Internet para descargar el binario de MongoDB. La instancia temporal se elimina al finalizar.

### Resultado de la última ejecución

En la última ejecución local se obtuvo:

- Pruebas ejecutadas: 2
- Pruebas aprobadas: 2
- Pruebas fallidas: 0

Se verificaron escenarios automatizados de viajes, participantes, gastos, validaciones y permisos.

## Comandos principales

| Comando | Función |
|---|---|
| `npm ci` | Instalar dependencias |
| `npm run dev` | Iniciar servidor en desarrollo |
| `npm start` | Iniciar servidor |
| `npm test` | Ejecutar pruebas automatizadas |

## Accesos principales

| Recurso | Dirección |
|---|---|
| API REST | http://localhost:3000 |
| Documentación interactiva Scalar | http://localhost:3000/docs |
| Especificación OpenAPI | http://localhost:3000/openapi.json |
