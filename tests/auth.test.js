const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../models/User');

test('Autenticación y control de acceso mediante cookies', async t => {
  const secret = 'workshop-auth-test-secret';
  const previousSecret = process.env.JWT_SECRET;
  const previousEnvironment = process.env.NODE_ENV;
  process.env.JWT_SECRET = secret;
  process.env.NODE_ENV = 'production';

  let mongo;
  let server;
  t.after(async () => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;

    if (server) await new Promise(resolve => server.close(resolve));
    try {
      await mongoose.disconnect();
    } finally {
      await mongo?.stop();
    }
  });

  const app = require('../app');
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.init();
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const baseUrl = 'http://127.0.0.1:' + server.address().port;

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

  const registration = {
    name: '  Daniela  ',
    email: '  Daniela@Example.com  ',
    password: 'Workshop123!'
  };
  const credentials = { email: registration.email, password: registration.password };

  await t.test('rechaza datos de registro inválidos sin guardar usuarios', async () => {
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

  let user;
  await t.test('registra un usuario y guarda su contraseña como hash', async () => {
    const { data, cookies } = await request('POST', '/auth/register', 201, { body: registration });
    user = data.user;
    const saved = await User.findOne({ email: 'daniela@example.com' }).select('+password').orFail();
    assert.deepEqual(user, { id: saved.id, name: 'Daniela', email: 'daniela@example.com' });
    assert.deepEqual(cookies, []);
    assert.notEqual(saved.password, registration.password);
    assert.equal(await bcrypt.compare(registration.password, saved.password), true);
  });

  await t.test('rechaza el mismo correo aunque cambien las mayúsculas y los espacios', async () => {
    const body = { ...registration, email: 'DANIELA@example.COM' };
    const { data, cookies } = await request('POST', '/auth/register', 409, { body });
    assert.equal(data.message, 'El correo ya está registrado');
    assert.deepEqual(cookies, []);
    assert.equal(await User.countDocuments({ email: 'daniela@example.com' }), 1);
  });

  await t.test('rechaza credenciales incorrectas o incompletas sin emitir cookies', async () => {
    for (const body of [
      { ...credentials, password: 'Incorrecta123!' },
      { ...credentials, email: 'desconocido@example.com' }
    ]) {
      const { data, cookies } = await request('POST', '/auth/login', 401, { body });
      assert.deepEqual(data, { message: 'Credenciales incorrectas' });
      assert.deepEqual(cookies, []);
    }
    const { cookies } = await request('POST', '/auth/login', 400, {
      body: { email: credentials.email }
    });
    assert.deepEqual(cookies, []);
  });

  let sessionCookie;
  await t.test('inicia sesión y emite una cookie segura con vigencia de 24 horas', async () => {
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
    sessionCookie = cookie;
  });

  const protectedPaths = ['/auth/me', '/trips'];
  await t.test('permite el acceso con sesión y lo rechaza sin cookie', async () => {
    for (const path of protectedPaths) {
      await request('GET', path, 401);
    }
    const profile = await request('GET', '/auth/me', 200, { cookie: sessionCookie });
    assert.deepEqual(profile.data.user, user);
    const trips = await request('GET', '/trips', 200, { cookie: sessionCookie });
    assert.deepEqual(trips.data.trips, []);
  });

  await t.test('rechaza cookies con un JWT de firma inválida o expirado', async () => {
    const invalid = jwt.sign({ id: user.id }, 'different-secret');
    const expired = jwt.sign({ id: user.id }, secret, { expiresIn: -60 });
    for (const token of [invalid, expired]) {
      for (const path of protectedPaths) {
        await request('GET', path, 401, { cookie: 'token=' + token });
      }
    }
  });

  await t.test('al cerrar sesión, ordena borrar la cookie y el acceso posterior devuelve 401', async () => {
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
