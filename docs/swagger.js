
const path = require("path");
const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "API de Viajes Compartidos y Gastos",
      version: "1.0.0",
      description:
        "Documentación de la API REST para gestionar viajes, participantes y gastos compartidos."
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Servidor local"
      }
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "token",
          description: "Autenticación mediante cookie de sesión."
        }
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            message: { type: "string", example: "Viaje no encontrado" }
          }
        }
      }
    }
  },
  // Rutas absolutas para que la especificación se genere desde cualquier carpeta.
  // Los patrones glob necesitan "/" también en Windows.
  apis: [
    path.join(__dirname, "../routes/*.js"),
    path.join(__dirname, "expenses.js")
  ].map(file => file.replace(/\\/g, "/"))
};

const spec = swaggerJsdoc(options);

// Mensajes reales que devuelve la API para cada código de error.
// Se usan como ejemplos en las respuestas que solo tienen descripción.
function errorExamples(route, method, code) {
  const isExpense = route.startsWith("/expenses");
  const isMembers = route.endsWith("/members");
  const isTripExpenses = route.endsWith("/expenses") && !isExpense;
  const hasId = route.includes("{");

  switch (code) {
    case "400": {
      const examples = {
        validacion: {
          summary: "Datos inválidos",
          value: {
            message: isExpense || isTripExpenses
              ? "El campo amount debe ser un número mayor que 0 con máximo 2 decimales"
              : isMembers
                ? "Envía únicamente un userId válido"
                : "El campo name es obligatorio"
          }
        }
      };
      if (hasId) {
        examples.idInvalido = {
          summary: "Identificador inválido",
          value: { message: isExpense ? "Identificador de gasto inválido" : "Identificador de viaje inválido" }
        };
      }
      return examples;
    }
    case "401":
      return {
        sinSesion: { summary: "Sin cookie de sesión", value: { message: "Acceso denegado. Debes iniciar sesión" } },
        sesionInvalida: { summary: "Token inválido o expirado", value: { message: "Sesión inválida o expirada" } }
      };
    case "403": {
      let message = "Debes ser miembro del viaje";
      if (isExpense) message = "Solo el creador del gasto o el propietario del viaje puede modificarlo o eliminarlo";
      else if (method === "patch" || method === "delete" || (isMembers && method === "post")) {
        message = "Solo el propietario puede administrar el viaje";
      }
      return { sinPermiso: { summary: "Sin permiso", value: { message } } };
    }
    case "404": {
      const examples = {
        noEncontrado: {
          summary: isExpense ? "Gasto inexistente" : "Viaje inexistente",
          value: { message: isExpense ? "Gasto no encontrado" : "Viaje no encontrado" }
        }
      };
      if (isMembers && method === "post") {
        examples.usuarioNoEncontrado = { summary: "Usuario inexistente", value: { message: "Usuario no encontrado" } };
      }
      return examples;
    }
    case "409":
      return { yaEsMiembro: { summary: "Usuario repetido", value: { message: "El usuario ya es miembro del viaje" } } };
    case "500":
      return { errorInterno: { summary: "Error inesperado", value: { message: "Error interno del servidor" } } };
    default:
      return null;
  }
}

for (const [route, operations] of Object.entries(spec.paths)) {
  for (const [method, operation] of Object.entries(operations)) {
    for (const [code, response] of Object.entries(operation.responses || {})) {
      if (response.content || !code.startsWith("4") && code !== "500") continue;
      const examples = errorExamples(route, method, code);
      if (!examples) continue;
      response.content = {
        "application/json": {
          schema: { $ref: "#/components/schemas/ErrorResponse" },
          examples
        }
      };
    }
  }
}

// El cierre de sesión ordena al navegador borrar la cookie
const logout = spec.paths["/auth/logout"]?.post?.responses?.["200"];
if (logout && !logout.headers) {
  logout.headers = {
    "Set-Cookie": {
      description: "Elimina la cookie de sesión vaciándola y con una fecha de expiración pasada.",
      schema: {
        type: "string",
        example: "token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax"
      }
    }
  };
}

module.exports = spec;
