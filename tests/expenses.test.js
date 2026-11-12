const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');

test('Gastos: registro, reparto, consulta y permisos con MongoDB', async t => {
  process.env.JWT_SECRET = 'test-only-secret';
  const mongo = await MongoMemoryServer.create();
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    await mongo.stop();
  });
  await mongoose.connect(mongo.getUri());
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(method, path, body, cookie, status) {
    const res = await fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json', ...(cookie ? {cookie} : {}) },
      ...(body !== undefined ? {body: JSON.stringify(body)} : {})
    });
    const data = res.status === 204 ? null : await res.json();
    assert.equal(res.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
    return {data, cookie: res.headers.get('set-cookie')?.split(';')[0]};
  }
  const actors = {};
  for (const name of ['owner', 'member', 'second', 'outsider']) {
    const {data} = await call('POST', '/auth/register', {name, email: `${name}@example.com`, password:'Workshop123!'}, null, 201);
    const {cookie} = await call('POST', '/auth/login', {email:`${name}@example.com`, password:'Workshop123!'}, null, 200);
    actors[name] = {id:data.user.id, cookie};
  }
  const {owner, member, second, outsider} = Object.fromEntries(Object.entries(actors).map(([k, v]) => [k, v.cookie]));
  const {data:{trip}} = await call('POST','/trips',{name:'Playa', destination:'Tamarindo', startDate:'2027-03-01', endDate:'2027-03-05'},owner,201);
  const path = `/trips/${trip._id}/expenses`;
  await call('POST',`/trips/${trip._id}/members`,{userId:actors.member.id},owner,201);
  await call('POST',`/trips/${trip._id}/members`,{userId:actors.second.id},owner,201);

  // Sin sesión y sin membresía
  await call('POST', path, {description:'Hotel', amount:300}, null, 401);
  await call('GET', path, undefined, null, 401);
  await call('POST', path, {description:'Hotel', amount:300}, outsider, 403);
  await call('GET', path, undefined, outsider, 403);
  await call('GET', '/trips/invalid/expenses', undefined, owner, 400);
  await call('GET', `/trips/${new mongoose.Types.ObjectId()}/expenses`, undefined, owner, 404);

  // Validaciones
  const ok = {description:'Hotel', amount:100};
  for (const invalid of [
    {}, {amount:100}, {description:'Hotel'}, {...ok, amount:0}, {...ok, amount:-5}, {...ok, amount:'100'},
    {...ok, amount:10.555}, {...ok, description:'   '}, {...ok, trip:String(new mongoose.Types.ObjectId())},
    {...ok, createdBy:actors.member.id}, {...ok, paidBy:actors.outsider.id}, {...ok, paidBy:'bad'},
    {...ok, splitType:'otro'}, {...ok, participants:[]}, {...ok, participants:[actors.outsider.id]},
    {...ok, participants:[actors.owner.id, actors.owner.id]}, {...ok, splits:[{user:actors.owner.id, amount:100}]},
    {...ok, splitType:'custom'}, {...ok, splitType:'custom', splits:[{user:actors.owner.id, amount:60}, {user:actors.member.id, amount:30}]},
    {...ok, splitType:'custom', splits:[{user:actors.owner.id, amount:50}, {user:actors.owner.id, amount:50}]},
    {...ok, splitType:'custom', splits:[{user:actors.owner.id, amount:100, extra:true}]}
  ]) {
    await call('POST', path, invalid, owner, 400);
  }

  // Reparto equitativo entre todos los miembros, con centavos sobrantes
  const {data:{expense:hotel}} = await call('POST', path, {description:'Hotel', amount:100}, owner, 201);
  assert.equal(hotel.paidBy._id, actors.owner.id);
  assert.equal(hotel.createdBy.email, 'owner@example.com');
  assert.equal(hotel.splitType, 'equal');
  assert.deepEqual(hotel.splits.map(s => s.amount), [33.34, 33.33, 33.33]);
  assert.ok(!('password' in hotel.paidBy));

  // Reparto equitativo entre algunos participantes, pagado por otro miembro
  const {data:{expense:dinner}} = await call('POST', path, {description:'Cena', amount:45.5, paidBy:actors.second.id, participants:[actors.member.id, actors.second.id]}, member, 201);
  assert.equal(dinner.paidBy._id, actors.second.id);
  assert.deepEqual(dinner.splits.map(s => [s.user._id, s.amount]), [[actors.member.id, 22.75], [actors.second.id, 22.75]]);

  // Reparto personalizado
  const {data:{expense:tour}} = await call('POST', path, {description:'Tour', amount:80, splitType:'custom', splits:[{user:actors.owner.id, amount:50}, {user:actors.member.id, amount:30}]}, second, 201);
  assert.equal(tour.splitType, 'custom');

  // Consulta de gastos para cualquier miembro
  const {data:list} = await call('GET', path, undefined, second, 200);
  assert.equal(list.expenses.length, 3);
  assert.equal(list.total, 225.5);

  // Permisos de edición y eliminación
  const dinnerPath = `/expenses/${dinner._id}`;
  await call('PATCH', dinnerPath, {description:'Sin sesión'}, null, 401);
  await call('PATCH', dinnerPath, {description:'Ajeno'}, outsider, 403);
  await call('PATCH', dinnerPath, {description:'Ajeno'}, second, 403);
  await call('DELETE', dinnerPath, undefined, outsider, 403);
  await call('DELETE', dinnerPath, undefined, second, 403);
  await call('PATCH', '/expenses/invalid', {description:'X'}, owner, 400);
  await call('PATCH', `/expenses/${new mongoose.Types.ObjectId()}`, {description:'X'}, owner, 404);
  await call('PATCH', dinnerPath, {}, member, 400);
  await call('PATCH', dinnerPath, {amount:0}, member, 400);
  await call('PATCH', dinnerPath, {trip:String(new mongoose.Types.ObjectId())}, member, 400);
  await call('PATCH', dinnerPath, {splitType:'custom', participants:[actors.member.id]}, member, 400);
  await call('PATCH', dinnerPath, {participants:[actors.outsider.id]}, member, 400);

  // El creador cambia el monto y el reparto se recalcula entre los mismos participantes
  const {data:{expense:updated}} = await call('PATCH', dinnerPath, {amount:60, description:'Cena en la playa'}, member, 200);
  assert.equal(updated.description, 'Cena en la playa');
  assert.deepEqual(updated.splits.map(s => [s.user._id, s.amount]), [[actors.member.id, 30], [actors.second.id, 30]]);

  // El propietario del viaje puede editar gastos ajenos
  const tourPath = `/expenses/${tour._id}`;
  await call('PATCH', tourPath, {amount:90}, owner, 400);
  const {data:{expense:tourUpdated}} = await call('PATCH', tourPath, {amount:90, splits:[{user:actors.owner.id, amount:45}, {user:actors.second.id, amount:45}]}, owner, 200);
  assert.equal(tourUpdated.amount, 90);
  const {data:{expense:tourEqual}} = await call('PATCH', tourPath, {splitType:'equal'}, second, 200);
  assert.deepEqual(tourEqual.splits.map(s => s.amount), [45, 45]);

  // Eliminación por el creador y por el propietario
  await call('DELETE', dinnerPath, undefined, member, 204);
  await call('DELETE', dinnerPath, undefined, member, 404);
  await call('DELETE', tourPath, undefined, owner, 204);
  assert.equal((await call('GET', path, undefined, member, 200)).data.expenses.length, 1);

  // Al eliminar el viaje se eliminan sus gastos
  await call('DELETE', `/trips/${trip._id}`, undefined, owner, 204);
  await call('PATCH', `/expenses/${hotel._id}`, {description:'X'}, owner, 404);
});
