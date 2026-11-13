const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../models/User');

// Guardar el entorno original y configurar el de pruebas antes de cargar la app:
// las opciones de la cookie (atributo Secure) se calculan al cargar el controlador.
const secret = 'workshop-auth-test-secret';
const previousEnv = { JWT_SECRET: process.env.JWT_SECRET, NODE_ENV: process.env.NODE_ENV };
process.env.JWT_SECRET = secret;
process.env.NODE_ENV = 'production';

const app = require('../app');

// Pruebas de autenticación y control de acceso mediante cookies.
// Cada prueba crea sus propios usuarios y, al terminar, se vacía la base.

const protectedPaths = ['/auth/me', '/trips'];

const registration = {
  name: '  Daniela  ',
  email: '  Daniela@Example.com  ',
  password: 'Workshop123!'
};
const credentials = { email: registration.email, password: registration.password };

let mongo;
let server;
let baseUrl;

// Hace una petición, comprueba el status y devuelve el body y las cookies emitidas
async function request(method, path, status, { body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(baseUrl + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json();
  assert.equal(response.status, status, method + ' ' + path + ': ' + JSON.stringify(data));
  return { data, cookies: response.headers.getSetCookie() };
}

// Registra al usuario de prueba y devuelve sus datos públicos
async function registrar() {
  const { data } = await request('POST', '/auth/register', 201, { body: registration });
  return data.user;
}

// Registra al usuario, inicia sesión y devuelve el usuario y la cookie "token=..."
async function iniciarSesion() {
  const user = await registrar();
  const { cookies } = await request('POST', '/auth/login', 200, { body: credentials });
  return { user, cookie: cookies[0].split('; ')[0] };
}

describe('Autenticación y control de acceso mediante cookies', () => {
  before(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await User.init();
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    baseUrl = 'http://127.0.0.1:' + server.address().port;
  });

  after(async () => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (server) await new Promise(resolve => server.close(resolve));
    try {
      await mongoose.disconnect();
    } finally {
      await mongo?.stop();
    }
  });

  // Después de cada prueba: limpiar todas las colecciones
  afterEach(async () => {
    for (const collection of await mongoose.connection.db.collections()) {
      await collection.deleteMany({});
    }
  });

  describe('Registro', () => {
    it('rechaza datos de registro inválidos sin guardar usuarios', async () => {
      const invalidRegistrations = [
        ['campos faltantes', {}],
        ['nombre vacío', { ...registration, name: ' ' }],
        ['correo inválido', { ...registration, email: 'daniela.example.com' }],
        ['contraseña corta', { ...registration, password: '1234567' }],
        ['contraseña de tipo incorrecto', { ...registration, password: 12345678 }]
      ];
      for (const [description, body] of invalidRegistrations) {
        const { data, cookies } = await request('POST', '/auth/register', 400, { body });
        assert.ok(data.message, description);
        assert.deepEqual(cookies, [], description);
      }
      assert.equal(await User.countDocuments(), 0);
    });

    it('registra un usuario y guarda su contraseña como hash', async () => {
      const { data, cookies } = await request('POST', '/auth/register', 201, { body: registration });
      const saved = await User.findOne({ email: 'daniela@example.com' }).select('+password').orFail();
      assert.deepEqual(data.user, { id: saved.id, name: 'Daniela', email: 'daniela@example.com' });
      assert.deepEqual(cookies, []);
      assert.notEqual(saved.password, registration.password);
      assert.equal(await bcrypt.compare(registration.password, saved.password), true);
    });

    it('rechaza el mismo correo aunque cambien las mayúsculas y los espacios', async () => {
      await registrar();
      const body = { ...registration, email: 'DANIELA@example.COM' };
      const { data, cookies } = await request('POST', '/auth/register', 409, { body });
      assert.equal(data.message, 'El correo ya está registrado');
      assert.deepEqual(cookies, []);
      assert.equal(await User.countDocuments({ email: 'daniela@example.com' }), 1);
    });
  });

  describe('Inicio de sesión', () => {
    it('rechaza credenciales incorrectas sin emitir cookies', async () => {
      await registrar();
      for (const body of [
        { ...credentials, password: 'Incorrecta123!' },
        { ...credentials, email: 'desconocido@example.com' }
      ]) {
        const { data, cookies } = await request('POST', '/auth/login', 401, { body });
        assert.deepEqual(data, { message: 'Credenciales incorrectas' });
        assert.deepEqual(cookies, []);
      }
    });

    it('rechaza credenciales incompletas sin emitir cookies', async () => {
      await registrar();
      const { cookies } = await request('POST', '/auth/login', 400, {
        body: { email: credentials.email }
      });
      assert.deepEqual(cookies, []);
    });

    it('inicia sesión y emite una cookie segura con vigencia de 24 horas', async () => {
      const user = await registrar();
      const { data, cookies } = await request('POST', '/auth/login', 200, { body: credentials });
      assert.deepEqual(data, { message: 'Inicio de sesión exitoso', user });
      assert.equal(cookies.length, 1);
      const [cookie, ...attributes] = cookies[0].split('; ');
      for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=86400']) {
        assert.ok(attributes.includes(attribute), 'Falta el atributo ' + attribute);
      }
      assert.match(cookie, /^token=.+$/);
      const claims = jwt.verify(cookie.slice('token='.length), secret, { algorithms: ['HS256'] });
      assert.equal(claims.id, user.id);
      assert.equal(claims.exp - claims.iat, 86400);
    });
  });

  describe('Rutas protegidas', () => {
    it('rechaza el acceso sin cookie', async () => {
      for (const path of protectedPaths) {
        await request('GET', path, 401);
      }
    });

    it('permite el acceso con una sesión válida', async () => {
      const { user, cookie } = await iniciarSesion();
      const profile = await request('GET', '/auth/me', 200, { cookie });
      assert.deepEqual(profile.data.user, user);
      const trips = await request('GET', '/trips', 200, { cookie });
      assert.deepEqual(trips.data.trips, []);
    });

    it('rechaza cookies con un JWT de firma inválida o expirado', async () => {
      const user = await registrar();
      const invalid = jwt.sign({ id: user.id }, 'different-secret');
      const expired = jwt.sign({ id: user.id }, secret, { expiresIn: -60 });
      for (const token of [invalid, expired]) {
        for (const path of protectedPaths) {
          await request('GET', path, 401, { cookie: 'token=' + token });
        }
      }
    });
  });

  describe('Cierre de sesión', () => {
    it('ordena borrar la cookie y el acceso posterior devuelve 401', async () => {
      const { cookie: sessionCookie } = await iniciarSesion();
      const { data, cookies } = await request('POST', '/auth/logout', 200, { cookie: sessionCookie });
      assert.equal(data.message, 'Sesión cerrada correctamente');
      assert.equal(cookies.length, 1);
      const [cookie, ...attributes] = cookies[0].split('; ');
      assert.equal(cookie, 'token=');
      for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) {
        assert.ok(attributes.includes(attribute), 'Falta el atributo ' + attribute);
      }
      const expires = attributes.find(attribute => attribute.startsWith('Expires='));
      assert.ok(expires && Date.parse(expires.slice('Expires='.length)) < Date.now());
      for (const path of protectedPaths) {
        await request('GET', path, 401, { cookie });
      }
    });
  });
});
