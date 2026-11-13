const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Trip = require('../models/Trip');
const Expense = require('../models/Expense');
const app = require('../app');

// Pruebas de gastos: registro, reparto, consulta y permisos.
// Los usuarios se crean una vez; cada prueba crea su propio viaje y sus gastos,
// y al terminar se eliminan los viajes y gastos generados.

let mongo;
let server;
let base;
const actors = {};
let owner, member, second, outsider;

// Hace una petición, comprueba el status y devuelve el body y la cookie emitida
async function call(method, path, body, cookie, status) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const data = res.status === 204 ? null : await res.json();
  assert.equal(res.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
  return { data, cookie: res.headers.get('set-cookie')?.split(';')[0] };
}

const ok = { description: 'Hotel', amount: 100 };
const newId = () => String(new mongoose.Types.ObjectId());

describe('Gastos: registro, reparto, consulta y permisos', () => {
  let trip;
  let path;

  before(async () => {
    process.env.JWT_SECRET = 'test-only-secret';
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;

    for (const name of ['owner', 'member', 'second', 'outsider']) {
      const credentials = { email: `${name}@example.com`, password: 'Workshop123!' };
      const { data } = await call('POST', '/auth/register', { name, ...credentials }, null, 201);
      const { cookie } = await call('POST', '/auth/login', credentials, null, 200);
      actors[name] = { id: data.user.id, cookie };
    }
    ({ owner, member, second, outsider } = Object.fromEntries(
      Object.entries(actors).map(([k, v]) => [k, v.cookie])
    ));
  });

  after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    await mongo.stop();
  });

  // Antes de cada prueba: un viaje del propietario con "member" y "second" como miembros
  beforeEach(async () => {
    const trips = await call('POST', '/trips', {
      name: 'Playa', destination: 'Tamarindo', startDate: '2027-03-01', endDate: '2027-03-05'
    }, owner, 201);
    trip = trips.data.trip;
    path = `/trips/${trip._id}/expenses`;
    await call('POST', `/trips/${trip._id}/members`, { userId: actors.member.id }, owner, 201);
    await call('POST', `/trips/${trip._id}/members`, { userId: actors.second.id }, owner, 201);
  });

  // Después de cada prueba: eliminar los viajes y gastos generados
  afterEach(async () => {
    await Expense.deleteMany({});
    await Trip.deleteMany({});
  });

  // Gasto de 45.5 creado por "member", pagado por "second" y repartido entre ambos
  async function crearCena() {
    const { data } = await call('POST', path, {
      description: 'Cena', amount: 45.5, paidBy: actors.second.id,
      participants: [actors.member.id, actors.second.id]
    }, member, 201);
    return data.expense;
  }

  // Gasto personalizado de 80 creado por "second"
  async function crearTour() {
    const { data } = await call('POST', path, {
      description: 'Tour', amount: 80, splitType: 'custom',
      splits: [{ user: actors.owner.id, amount: 50 }, { user: actors.member.id, amount: 30 }]
    }, second, 201);
    return data.expense;
  }

  describe('Registro y consulta', () => {
    it('rechaza registrar y consultar sin sesión', async () => {
      await call('POST', path, ok, null, 401);
      await call('GET', path, undefined, null, 401);
    });

    it('un usuario ajeno no puede registrar ni consultar gastos', async () => {
      await call('POST', path, ok, outsider, 403);
      await call('GET', path, undefined, outsider, 403);
    });

    it('devuelve 400 con un id de viaje inválido y 404 si el viaje no existe', async () => {
      await call('GET', '/trips/invalid/expenses', undefined, owner, 400);
      await call('GET', `/trips/${newId()}/expenses`, undefined, owner, 404);
    });

    it('rechaza gastos con datos inválidos', async () => {
      for (const invalid of [
        {}, { amount: 100 }, { description: 'Hotel' }, { ...ok, amount: 0 }, { ...ok, amount: -5 },
        { ...ok, amount: '100' }, { ...ok, amount: 10.555 }, { ...ok, description: '   ' },
        { ...ok, trip: newId() }, { ...ok, createdBy: actors.member.id },
        { ...ok, paidBy: actors.outsider.id }, { ...ok, paidBy: 'bad' }, { ...ok, splitType: 'otro' },
        { ...ok, participants: [] }, { ...ok, participants: [actors.outsider.id] },
        { ...ok, participants: [actors.owner.id, actors.owner.id] },
        { ...ok, splits: [{ user: actors.owner.id, amount: 100 }] },
        { ...ok, splitType: 'custom' },
        { ...ok, splitType: 'custom', splits: [{ user: actors.owner.id, amount: 60 }, { user: actors.member.id, amount: 30 }] },
        { ...ok, splitType: 'custom', splits: [{ user: actors.owner.id, amount: 50 }, { user: actors.owner.id, amount: 50 }] },
        { ...ok, splitType: 'custom', splits: [{ user: actors.owner.id, amount: 100, extra: true }] }
      ]) {
        await call('POST', path, invalid, owner, 400);
      }
      assert.equal(await Expense.countDocuments(), 0);
    });

    it('reparte por igual entre todos los miembros asignando los centavos sobrantes', async () => {
      const { data: { expense: hotel } } = await call('POST', path, ok, owner, 201);
      assert.equal(hotel.paidBy._id, actors.owner.id);
      assert.equal(hotel.createdBy.email, 'owner@example.com');
      assert.equal(hotel.splitType, 'equal');
      assert.deepEqual(hotel.splits.map(s => s.amount), [33.34, 33.33, 33.33]);
      assert.ok(!('password' in hotel.paidBy));
    });

    it('reparte por igual entre algunos participantes con otro miembro como pagador', async () => {
      const dinner = await crearCena();
      assert.equal(dinner.paidBy._id, actors.second.id);
      assert.deepEqual(
        dinner.splits.map(s => [s.user._id, s.amount]),
        [[actors.member.id, 22.75], [actors.second.id, 22.75]]
      );
    });

    it('acepta un reparto personalizado', async () => {
      const tour = await crearTour();
      assert.equal(tour.splitType, 'custom');
      assert.deepEqual(tour.splits.map(s => s.amount), [50, 30]);
    });

    it('cualquier miembro puede consultar los gastos y el total', async () => {
      await call('POST', path, ok, owner, 201);
      await crearCena();
      await crearTour();
      const { data: list } = await call('GET', path, undefined, second, 200);
      assert.equal(list.expenses.length, 3);
      assert.equal(list.total, 225.5);
    });
  });

  describe('Modificación', () => {
    it('rechaza modificar sin sesión', async () => {
      const dinner = await crearCena();
      await call('PATCH', `/expenses/${dinner._id}`, { description: 'Sin sesión' }, null, 401);
    });

    it('un usuario ajeno o un miembro que no creó el gasto no pueden modificarlo', async () => {
      const dinner = await crearCena();
      const dinnerPath = `/expenses/${dinner._id}`;
      await call('PATCH', dinnerPath, { description: 'Ajeno' }, outsider, 403);
      // "second" pagó la cena pero no la registró
      await call('PATCH', dinnerPath, { description: 'Ajeno' }, second, 403);
    });

    it('devuelve 400 con un id inválido y 404 si el gasto no existe', async () => {
      await call('PATCH', '/expenses/invalid', { description: 'X' }, owner, 400);
      await call('PATCH', `/expenses/${newId()}`, { description: 'X' }, owner, 404);
    });

    it('rechaza modificaciones con datos inválidos', async () => {
      const dinner = await crearCena();
      const dinnerPath = `/expenses/${dinner._id}`;
      for (const invalid of [
        {}, { amount: 0 }, { trip: newId() },
        { splitType: 'custom', participants: [actors.member.id] },
        { participants: [actors.outsider.id] }
      ]) {
        await call('PATCH', dinnerPath, invalid, member, 400);
      }
    });

    it('el creador cambia el monto y el reparto se recalcula', async () => {
      const dinner = await crearCena();
      const { data: { expense: updated } } = await call(
        'PATCH', `/expenses/${dinner._id}`, { amount: 60, description: 'Cena en la playa' }, member, 200
      );
      assert.equal(updated.description, 'Cena en la playa');
      assert.deepEqual(
        updated.splits.map(s => [s.user._id, s.amount]),
        [[actors.member.id, 30], [actors.second.id, 30]]
      );
    });

    it('el propietario del viaje puede modificar gastos ajenos con un reparto coherente', async () => {
      const tour = await crearTour();
      const tourPath = `/expenses/${tour._id}`;
      // Cambiar el monto de un reparto personalizado exige nuevos splits
      await call('PATCH', tourPath, { amount: 90 }, owner, 400);
      const { data: { expense } } = await call('PATCH', tourPath, {
        amount: 90,
        splits: [{ user: actors.owner.id, amount: 45 }, { user: actors.second.id, amount: 45 }]
      }, owner, 200);
      assert.equal(expense.amount, 90);
    });

    it('cambia un reparto personalizado a equitativo', async () => {
      const tour = await crearTour();
      const { data: { expense } } = await call('PATCH', `/expenses/${tour._id}`, { splitType: 'equal' }, second, 200);
      assert.equal(expense.splitType, 'equal');
      assert.deepEqual(expense.splits.map(s => s.amount), [40, 40]);
    });
  });

  describe('Eliminación', () => {
    it('un usuario ajeno o un miembro que no creó el gasto no pueden eliminarlo', async () => {
      const dinner = await crearCena();
      const dinnerPath = `/expenses/${dinner._id}`;
      await call('DELETE', dinnerPath, undefined, outsider, 403);
      await call('DELETE', dinnerPath, undefined, second, 403);
      assert.equal(await Expense.countDocuments(), 1);
    });

    it('el creador puede eliminar su gasto y volver a eliminarlo devuelve 404', async () => {
      const dinner = await crearCena();
      await call('DELETE', `/expenses/${dinner._id}`, undefined, member, 204);
      await call('DELETE', `/expenses/${dinner._id}`, undefined, member, 404);
      assert.equal((await call('GET', path, undefined, member, 200)).data.expenses.length, 0);
    });

    it('el propietario del viaje puede eliminar gastos ajenos', async () => {
      const tour = await crearTour();
      await call('DELETE', `/expenses/${tour._id}`, undefined, owner, 204);
      assert.equal((await call('GET', path, undefined, member, 200)).data.expenses.length, 0);
    });

    it('al eliminar el viaje se eliminan sus gastos', async () => {
      const { data: { expense: hotel } } = await call('POST', path, ok, owner, 201);
      await call('DELETE', `/trips/${trip._id}`, undefined, owner, 204);
      await call('PATCH', `/expenses/${hotel._id}`, { description: 'X' }, owner, 404);
      assert.equal(await Expense.countDocuments(), 0);
    });
  });
});
