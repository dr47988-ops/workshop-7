const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');

test('Viajes: persistencia, participantes, validación y permisos con MongoDB', async t => {
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
  for (const name of ['owner', 'member', 'outsider']) {
    const {data} = await call('POST', '/auth/register', {name, email: `${name}@example.com`, password:'Workshop123!'}, null, 201);
    const {cookie} = await call('POST', '/auth/login', {email:`${name}@example.com`, password:'Workshop123!'}, null, 200);
    actors[name] = {id:data.user.id, cookie};
  }
  const owner = actors.owner.cookie;
  const member = actors.member.cookie;
  const outsider = actors.outsider.cookie;
  const body = {name:'Vacaciones', destination:'Liberia', startDate:'2027-01-10', endDate:'2027-01-15'};
  await call('POST', '/trips', body, null, 401);
  for (const invalid of [null, {}, {...body,owner:actors.outsider.id}, {...body,endDate:'2027-01-01'}, {...body,name:{$ne:''}}, {...body,startDate:'incorrecta'}]) {
    await call('POST', '/trips', invalid, owner, 400);
  }
  const {data:{trip}} = await call('POST','/trips',body,owner,201);
  assert.deepEqual(trip.members,[actors.owner.id]);
  const path = `/trips/${trip._id}`;
  assert.equal((await call('GET','/trips',undefined,owner,200)).data.trips.length,1);
  assert.equal((await call('GET','/trips',undefined,outsider,200)).data.trips.length,0);
  await call('GET',path,undefined,owner,200);
  await call('GET','/trips/invalid',undefined,owner,400);
  await call('GET',`/trips/${new mongoose.Types.ObjectId()}`,undefined,owner,404);
  await call('GET',path,undefined,outsider,403);
  await call('GET',path+'/members',undefined,outsider,403);
  await call('POST',path+'/members',{userId:actors.member.id},outsider,403);
  await call('POST',path+'/members',{userId:String(new mongoose.Types.ObjectId())},owner,404);
  await call('POST',path+'/members',{userId:'bad'},owner,400);
  await call('POST',path+'/members',{userId:actors.member.id},owner,201);
  await call('POST',path+'/members',{userId:actors.member.id},owner,409);
  await call('POST',path+'/members',{userId:actors.owner.id},owner,409);
  assert.equal((await call('GET','/trips',undefined,member,200)).data.trips.length,1);
  await call('GET',path,undefined,member,200);
  const {data:{members}} = await call('GET',path+'/members',undefined,member,200);
  assert.equal(members.length,2);
  members.forEach(user => {assert.ok(user.name); assert.ok(user.email); assert.ok(!('password' in user));});
  for (const cookie of [member,outsider]) {
    await call('PATCH',path,{name:'Prohibido'},cookie,403);
    await call('DELETE',path,undefined,cookie,403);
    await call('POST',path+'/members',{userId:actors.outsider.id},cookie,403);
  }
  await call('PATCH',path,{members:[actors.outsider.id]},owner,400);
  await call('PATCH',path,{owner:actors.outsider.id},owner,400);
  await call('PATCH',path,{endDate:'2026-01-01'},owner,400);
  await call('PATCH',path,{},owner,400);
  assert.equal((await call('PATCH',path,{destination:'Tamarindo'},owner,200)).data.trip.destination,'Tamarindo');
  assert.equal((await call('GET',path,undefined,member,200)).data.trip.destination,'Tamarindo');
  await call('DELETE',path,undefined,owner,204);
  await call('GET',path,undefined,owner,404);
  assert.equal((await call('GET','/trips',undefined,member,200)).data.trips.length,0);
});

