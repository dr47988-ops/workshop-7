
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
      }
    }
  },
  apis: ["./routes/*.js"]
};

module.exports = swaggerJsdoc(options);
