const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');

// Pruebas de viajes y permisos (Persona 3)
// Cada prueba crea sus propios usuarios y viajes, y al terminar se vacía la base.

let mongo;
let server;
let base;

// Hace una petición a la API y devuelve el status, el body y la cookie (si viene)
async function api(method, path, body, cookie) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (cookie) options.headers.cookie = cookie;
  if (body !== undefined) options.body = JSON.stringify(body);

  const res = await fetch(base + path, options);
  const data = res.status === 204 ? null : await res.json();
  const setCookie = res.headers.get('set-cookie');

  return { status: res.status, data, cookie: setCookie ? setCookie.split(';')[0] : null };
}

// Registra un usuario, inicia sesión y devuelve su id y su cookie
async function crearUsuario(nombre) {
  const datos = { name: nombre, email: `${nombre}@example.com`, password: 'Workshop123!' };
  const registro = await api('POST', '/auth/register', datos);
  const login = await api('POST', '/auth/login', { email: datos.email, password: datos.password });
  return { id: registro.data.user.id, cookie: login.cookie };
}

const viajeValido = {
  name: 'Vacaciones',
  destination: 'Liberia',
  description: 'Viaje de prueba',
  startDate: '2027-01-10',
  endDate: '2027-01-15'
};

// Crea un viaje con el usuario indicado y devuelve el viaje
async function crearViaje(usuario, datos = viajeValido) {
  const res = await api('POST', '/trips', datos, usuario.cookie);
  assert.equal(res.status, 201);
  return res.data.trip;
}

describe('Viajes y permisos', () => {
  let owner, member, outsider;

  before(async () => {
    process.env.JWT_SECRET = 'test-only-secret';
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    await mongo.stop();
  });

  // Antes de cada prueba: tres usuarios nuevos
  beforeEach(async () => {
    owner = await crearUsuario('owner');
    member = await crearUsuario('member');
    outsider = await crearUsuario('outsider');
  });

  // Después de cada prueba: limpiar todas las colecciones
  afterEach(async () => {
    const colecciones = await mongoose.connection.db.collections();
    for (const coleccion of colecciones) {
      await coleccion.deleteMany({});
    }
  });

  // Agrega a "member" al viaje (lo hace el propietario)
  async function agregarMiembro(viaje) {
    const res = await api('POST', `/trips/${viaje._id}/members`, { userId: member.id }, owner.cookie);
    assert.equal(res.status, 201);
  }

  describe('Crear viaje', () => {
    it('crea un viaje y deja al usuario como propietario y miembro', async () => {
      const res = await api('POST', '/trips', viajeValido, owner.cookie);

      assert.equal(res.status, 201);
      assert.equal(res.data.trip.name, 'Vacaciones');
      assert.equal(res.data.trip.owner, owner.id);
      assert.deepEqual(res.data.trip.members, [owner.id]);
    });

    it('permite crear un viaje sin descripción', async () => {
      const { description, ...sinDescripcion } = viajeValido;
      const res = await api('POST', '/trips', sinDescripcion, owner.cookie);

      assert.equal(res.status, 201);
      assert.equal(res.data.trip.description, '');
    });

    it('rechaza la creación sin sesión', async () => {
      const res = await api('POST', '/trips', viajeValido);
      assert.equal(res.status, 401);
    });

    it('rechaza un cuerpo vacío o que no es un objeto', async () => {
      for (const body of [null, {}, []]) {
        const res = await api('POST', '/trips', body, owner.cookie);
        assert.equal(res.status, 400);
      }
    });

    it('rechaza cuando falta un campo obligatorio', async () => {
      for (const campo of ['name', 'destination', 'startDate', 'endDate']) {
        const datos = { ...viajeValido };
        delete datos[campo];
        const res = await api('POST', '/trips', datos, owner.cookie);
        assert.equal(res.status, 400, `debería fallar sin ${campo}`);
      }
    });

    it('rechaza campos con tipo o contenido inválido', async () => {
      const invalidos = [
        { ...viajeValido, name: '   ' },
        { ...viajeValido, name: 123 },
        { ...viajeValido, name: { $ne: '' } },
        { ...viajeValido, name: 'a'.repeat(121) },
        { ...viajeValido, destination: 'a'.repeat(201) },
        { ...viajeValido, description: 'a'.repeat(2001) }
      ];
      for (const datos of invalidos) {
        const res = await api('POST', '/trips', datos, owner.cookie);
        assert.equal(res.status, 400);
      }
    });

    it('rechaza fechas inválidas o inexistentes', async () => {
      const invalidos = [
        { ...viajeValido, startDate: 'incorrecta' },
        { ...viajeValido, startDate: '2027-02-30' },
        { ...viajeValido, startDate: '2027-02-29' },
        { ...viajeValido, endDate: '2027-04-31' },
        { ...viajeValido, endDate: 20270115 }
      ];
      for (const datos of invalidos) {
        const res = await api('POST', '/trips', datos, owner.cookie);
        assert.equal(res.status, 400);
      }
    });

    it('rechaza una fecha final anterior a la inicial', async () => {
      const res = await api('POST', '/trips', { ...viajeValido, endDate: '2027-01-01' }, owner.cookie);
      assert.equal(res.status, 400);
    });

    it('acepta que la fecha final sea igual a la inicial', async () => {
      const res = await api('POST', '/trips', { ...viajeValido, endDate: '2027-01-10' }, owner.cookie);
      assert.equal(res.status, 201);
    });

    it('rechaza campos que no están permitidos (por ejemplo owner)', async () => {
      const res = await api('POST', '/trips', { ...viajeValido, owner: outsider.id }, owner.cookie);
      assert.equal(res.status, 400);
    });
  });

  describe('Consultar viajes', () => {
    it('lista solo los viajes donde el usuario participa', async () => {
      await crearViaje(owner);

      const delOwner = await api('GET', '/trips', undefined, owner.cookie);
      const delAjeno = await api('GET', '/trips', undefined, outsider.cookie);

      assert.equal(delOwner.status, 200);
      assert.equal(delOwner.data.trips.length, 1);
      assert.equal(delAjeno.status, 200);
      assert.equal(delAjeno.data.trips.length, 0);
    });

    it('el propietario puede consultar su viaje', async () => {
      const viaje = await crearViaje(owner);
      const res = await api('GET', `/trips/${viaje._id}`, undefined, owner.cookie);

      assert.equal(res.status, 200);
      assert.equal(res.data.trip._id, viaje._id);
    });

    it('un miembro puede consultar el viaje y le aparece en su lista', async () => {
      const viaje = await crearViaje(owner);
      await agregarMiembro(viaje);

      const uno = await api('GET', `/trips/${viaje._id}`, undefined, member.cookie);
      const lista = await api('GET', '/trips', undefined, member.cookie);

      assert.equal(uno.status, 200);
      assert.equal(lista.data.trips.length, 1);
    });

    it('un usuario ajeno no puede consultar el viaje', async () => {
      const viaje = await crearViaje(owner);
      const res = await api('GET', `/trips/${viaje._id}`, undefined, outsider.cookie);
      assert.equal(res.status, 403);
    });

    it('rechaza consultar sin sesión', async () => {
      const viaje = await crearViaje(owner);

      const lista = await api('GET', '/trips');
      const uno = await api('GET', `/trips/${viaje._id}`);

      assert.equal(lista.status, 401);
      assert.equal(uno.status, 401);
    });

    it('devuelve 404 si el viaje no existe', async () => {
      const idInexistente = new mongoose.Types.ObjectId();
      const res = await api('GET', `/trips/${idInexistente}`, undefined, owner.cookie);
      assert.equal(res.status, 404);
    });

    it('devuelve 400 si el id no es válido', async () => {
      const res = await api('GET', '/trips/id-invalido', undefined, owner.cookie);
      assert.equal(res.status, 400);
    });
  });

  describe('Modificar viaje', () => {
    it('el propietario puede modificar un solo campo', async () => {
      const viaje = await crearViaje(owner);
      const res = await api('PATCH', `/trips/${viaje._id}`, { destination: 'Tamarindo' }, owner.cookie);

      assert.equal(res.status, 200);
      assert.equal(res.data.trip.destination, 'Tamarindo');
      assert.equal(res.data.trip.name, 'Vacaciones');
    });

    it('el propietario puede modificar varios campos a la vez', async () => {
      const viaje = await crearViaje(owner);
      const cambios = { name: 'Nuevo nombre', endDate: '2027-01-20' };
      const res = await api('PATCH', `/trips/${viaje._id}`, cambios, owner.cookie);

      assert.equal(res.status, 200);
      assert.equal(res.data.trip.name, 'Nuevo nombre');
      assert.equal(res.data.trip.endDate, '2027-01-20T00:00:00.000Z');
    });

    it('el cambio se ve cuando un miembro consulta el viaje', async () => {
      const viaje = await crearViaje(owner);
      await agregarMiembro(viaje);

      await api('PATCH', `/trips/${viaje._id}`, { destination: 'Tamarindo' }, owner.cookie);
      const res = await api('GET', `/trips/${viaje._id}`, undefined, member.cookie);

      assert.equal(res.data.trip.destination, 'Tamarindo');
    });

    it('un miembro no puede modificar el viaje', async () => {
      const viaje = await crearViaje(owner);
      await agregarMiembro(viaje);

      const res = await api('PATCH', `/trips/${viaje._id}`, { name: 'Prohibido' }, member.cookie);
      assert.equal(res.status, 403);

      const actual = await api('GET', `/trips/${viaje._id}`, undefined, owner.cookie);
      assert.equal(actual.data.trip.name, 'Vacaciones');
    });

    it('un usuario ajeno no puede modificar el viaje', async () => {
      const viaje = await crearViaje(owner);

      const res = await api('PATCH', `/trips/${viaje._id}`, { name: 'Prohibido' }, outsider.cookie);
      assert.equal(res.status, 403);

      const actual = await api('GET', `/trips/${viaje._id}`, undefined, owner.cookie);
      assert.equal(actual.data.trip.name, 'Vacaciones');
    });

    it('rechaza modificar sin sesión', async () => {
      const viaje = await crearViaje(owner);
      const res = await api('PATCH', `/trips/${viaje._id}`, { name: 'Prohibido' });
      assert.equal(res.status, 401);
    });

    it('rechaza datos inválidos al modificar', async () => {
      const viaje = await crearViaje(owner);
      const invalidos = [
        {},
        { name: '' },
        { name: 5 },
        { endDate: '2026-01-01' },
        { endDate: '2027-02-30' },
        { startDate: 'incorrecta' },
        { owner: outsider.id },
        { members: [outsider.id] }
      ];
      for (const cambios of invalidos) {
        const res = await api('PATCH', `/trips/${viaje._id}`, cambios, owner.cookie);
        assert.equal(res.status, 400, JSON.stringify(cambios));
      }
    });

    it('devuelve 404 al modificar un viaje que no existe', async () => {
      const idInexistente = new mongoose.Types.ObjectId();
      const res = await api('PATCH', `/trips/${idInexistente}`, { name: 'Nuevo' }, owner.cookie);
      assert.equal(res.status, 404);
    });

    it('devuelve 400 al modificar con un id inválido', async () => {
      const res = await api('PATCH', '/trips/id-invalido', { name: 'Nuevo' }, owner.cookie);
      assert.equal(res.status, 400);
    });
  });

  describe('Eliminar viaje', () => {
    it('el propietario puede eliminar el viaje', async () => {
      const viaje = await crearViaje(owner);

      const borrado = await api('DELETE', `/trips/${viaje._id}`, undefined, owner.cookie);
      const consulta = await api('GET', `/trips/${viaje._id}`, undefined, owner.cookie);

      assert.equal(borrado.status, 204);
      assert.equal(consulta.status, 404);
    });

    it('al eliminarlo desaparece de la lista de los miembros', async () => {
      const viaje = await crearViaje(owner);
      await agregarMiembro(viaje);

      await api('DELETE', `/trips/${viaje._id}`, undefined, owner.cookie);
      const lista = await api('GET', '/trips', undefined, member.cookie);

      assert.equal(lista.data.trips.length, 0);
    });

    it('un miembro no puede eliminar el viaje', async () => {
      const viaje = await crearViaje(owner);
      await agregarMiembro(viaje);

      const res = await api('DELETE', `/trips/${viaje._id}`, undefined, member.cookie);
      const consulta = await api('GET', `/trips/${viaje._id}`, undefined, owner.cookie);

      assert.equal(res.status, 403);
      assert.equal(consulta.status, 200);
    });

    it('un usuario ajeno no puede eliminar el viaje', async () => {
      const viaje = await crearViaje(owner);

      const res = await api('DELETE', `/trips/${viaje._id}`, undefined, outsider.cookie);
      const consulta = await api('GET', `/trips/${viaje._id}`, undefined, owner.cookie);

      assert.equal(res.status, 403);
      assert.equal(consulta.status, 200);
    });

    it('rechaza eliminar sin sesión', async () => {
      const viaje = await crearViaje(owner);
      const res = await api('DELETE', `/trips/${viaje._id}`);
      assert.equal(res.status, 401);
    });

    it('devuelve 404 al eliminar un viaje que no existe', async () => {
      const idInexistente = new mongoose.Types.ObjectId();
      const res = await api('DELETE', `/trips/${idInexistente}`, undefined, owner.cookie);
      assert.equal(res.status, 404);
    });

    it('devuelve 400 al eliminar con un id inválido', async () => {
      const res = await api('DELETE', '/trips/id-invalido', undefined, owner.cookie);
      assert.equal(res.status, 400);
    });
  });

  describe('Participantes', () => {
    it('el propietario puede agregar a un usuario existente', async () => {
      const viaje = await crearViaje(owner);
      const res = await api('POST', `/trips/${viaje._id}/members`, { userId: member.id }, owner.cookie);

      assert.equal(res.status, 201);
      assert.equal(res.data.trip.members.length, 2);
      assert.ok(res.data.trip.members.includes(member.id));
    });

    it('un miembro no puede agregar participantes', async () => {
      const viaje = await crearViaje(owner);
      await agregarMiembro(viaje);

      const res = await api('POST', `/trips/${viaje._id}/members`, { userId: outsider.id }, member.cookie);
      assert.equal(res.status, 403);
    });

    it('un usuario ajeno no puede agregar participantes', async () => {
      const viaje = await crearViaje(owner);
      const res = await api('POST', `/trips/${viaje._id}/members`, { userId: member.id }, outsider.cookie);
      assert.equal(res.status, 403);
    });

    it('rechaza agregar a alguien que ya es miembro', async () => {
      const viaje = await crearViaje(owner);
      await agregarMiembro(viaje);

      const repetido = await api('POST', `/trips/${viaje._id}/members`, { userId: member.id }, owner.cookie);
      const propietario = await api('POST', `/trips/${viaje._id}/members`, { userId: owner.id }, owner.cookie);

      assert.equal(repetido.status, 409);
      assert.equal(propietario.status, 409);
    });

    it('rechaza un usuario que no existe', async () => {
      const viaje = await crearViaje(owner);
      const idInexistente = String(new mongoose.Types.ObjectId());
      const res = await api('POST', `/trips/${viaje._id}/members`, { userId: idInexistente }, owner.cookie);
      assert.equal(res.status, 404);
    });

    it('rechaza un userId inválido o con campos extra', async () => {
      const viaje = await crearViaje(owner);
      const invalidos = [{}, { userId: 'malo' }, { userId: 123 }, { userId: member.id, extra: true }];
      for (const body of invalidos) {
        const res = await api('POST', `/trips/${viaje._id}/members`, body, owner.cookie);
        assert.equal(res.status, 400, JSON.stringify(body));
      }
    });

    it('devuelve 404 al agregar miembros a un viaje que no existe', async () => {
      const idInexistente = new mongoose.Types.ObjectId();
      const res = await api('POST', `/trips/${idInexistente}/members`, { userId: member.id }, owner.cookie);
      assert.equal(res.status, 404);
    });

    it('el propietario y los miembros pueden ver los participantes sin datos sensibles', async () => {
      const viaje = await crearViaje(owner);
      await agregarMiembro(viaje);

      for (const usuario of [owner, member]) {
        const res = await api('GET', `/trips/${viaje._id}/members`, undefined, usuario.cookie);
        assert.equal(res.status, 200);
        assert.equal(res.data.members.length, 2);
        for (const persona of res.data.members) {
          assert.ok(persona.name);
          assert.ok(persona.email);
          assert.ok(!('password' in persona));
        }
      }
    });

    it('un usuario ajeno no puede ver los participantes', async () => {
      const viaje = await crearViaje(owner);
      const res = await api('GET', `/trips/${viaje._id}/members`, undefined, outsider.cookie);
      assert.equal(res.status, 403);
    });

    it('rechaza ver participantes sin sesión', async () => {
      const viaje = await crearViaje(owner);
      const res = await api('GET', `/trips/${viaje._id}/members`);
      assert.equal(res.status, 401);
    });
  });
});
