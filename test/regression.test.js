// integration tests against real mysql and express, no mocks
// needs .env db settings, session secret, and npm run db:migrate first
import 'dotenv/config';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { DateTime } from 'luxon';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { closeSessionStore } from '../src/config/session.js';

const password = 'RegTest12!';
const password2 = 'RegTest34!';

function futureSlotDate(daysAhead = 14) {
  return DateTime.now()
    .setZone('America/Montreal')
    .plus({ days: daysAhead })
    .startOf('day')
    .toISODate();
}

// next monday on or after today plus daysFromNow, iso string; recurrence uses dow 0 = mon
function nextMondayIso(daysFromNow = 55) {
  let d = DateTime.now()
    .setZone('America/Montreal')
    .startOf('day')
    .plus({ days: daysFromNow });
  while (d.weekday !== 1) {
    d = d.plus({ days: 1 });
  }
  return d.toISODate();
}

describe('McGill Bookings comprehensive API tests', () => {
  const runId = `${Date.now()}_${process.pid}`;
  const ownerEmail = `own_${runId}@mcgill.ca`;
  const studentEmail = `stu_${runId}@mail.mcgill.ca`;
  const p2Email = `p2_${runId}@mail.mcgill.ca`;

  let ownerId;
  let p2Id;
  let inviteToken;
  let slotId;
  let groupMeetingId;
  let groupOptionId;
  let recurrencePatternId;
  let teamRequestId;

  before(async () => {
    await pool.query('SELECT 1');
  });

  after(async () => {
    try {
      await pool.query('DELETE FROM users WHERE email IN (?, ?, ?)', [
        studentEmail,
        ownerEmail,
        p2Email,
      ]);
    } catch {
      // ignore cleanup errors
    }
    await closeSessionStore();
    await pool.end();
  });

  // health and validation
  test('GET /api/health', async () => {
    const res = await request(app).get('/api/health').expect(200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data?.database, true);
  });

  test('POST /api/auth/register rejects non-McGill email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'bad@gmail.com',
        password,
        firstName: 'X',
        lastName: 'Y',
      })
      .expect(422);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Validation failed');
    assert.ok(Array.isArray(res.body.details));
  });

  test('register owner, student, and second student (group participant)', async () => {
    const o = await request(app)
      .post('/api/auth/register')
      .send({
        email: ownerEmail,
        password,
        firstName: 'Owner',
        lastName: 'Test',
      })
      .expect(201);
    ownerId = o.body.data.user.id;
    inviteToken = o.body.data.user.inviteToken;
    assert.equal(o.body.data.user.isOwner, true);

    const s = await request(app)
      .post('/api/auth/register')
      .send({
        email: studentEmail,
        password,
        firstName: 'Student',
        lastName: 'Test',
      })
      .expect(201);
    assert.ok(s.body.data.user.id);

    const p2 = await request(app)
      .post('/api/auth/register')
      .send({
        email: p2Email,
        password,
        firstName: 'Peer',
        lastName: 'Two',
      })
      .expect(201);
    p2Id = p2.body.data.user.id;
  });

  test('duplicate register returns 409', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        email: studentEmail,
        password,
        firstName: 'A',
        lastName: 'B',
      })
      .expect(409);
  });

  test('login failure for wrong password', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ email: ownerEmail, password: 'wrongpass' })
      .expect(401);
  });

  test('GET /api/users/me and /api/auth/me return 401 without session', async () => {
    await request(app).get('/api/users/me').expect(401);
    await request(app).get('/api/auth/me').expect(401);
  });

  // office hours create activate browse invite
  test('owner: slots CRUD, owner directory, invite page', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: ownerEmail, password }).expect(200);

    const me = await agent.get('/api/users/me').expect(200);
    assert.equal(me.body.data.user.email, ownerEmail);

    const dateStr = futureSlotDate(14);
    const created = await agent
      .post('/api/slots')
      .send({
        slots: [{ date: dateStr, startTime: '10:00', endTime: '10:30' }],
      })
      .expect(201);
    slotId = created.body.data.slots[0].id;

    await agent.patch(`/api/slots/${slotId}/activate`).expect(200);

    const owners = await agent.get('/api/owners').expect(200);
    assert.ok(owners.body.data.owners.some((o) => o.id === ownerId));

    const inv = request.agent(app);
    await inv.post('/api/auth/login').send({ email: studentEmail, password }).expect(200);
    const invRes = await inv.get(`/api/invite/${inviteToken}`).expect(200);
    assert.ok(invRes.body.data.slots.length >= 1);
  });

  test('owner cannot book own active slot (403)', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: ownerEmail, password }).expect(200);
    await agent.post(`/api/slots/${slotId}/book`).expect(403);
  });

  test('student: book, dashboard, owner mailto, cancel + notify mailto', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: studentEmail, password }).expect(200);

    await agent.post(`/api/slots/${slotId}/book`).expect(200);

    const dash = await agent.get('/api/dashboard').expect(200);
    assert.equal(dash.body.data.isOwner, false);
    assert.ok(dash.body.data.appointments.some((a) => a.slotId === slotId));

    const ownerAgent = request.agent(app);
    await ownerAgent.post('/api/auth/login').send({ email: ownerEmail, password }).expect(200);
    const mailto = await ownerAgent.get(`/api/slots/${slotId}/mailto`).expect(200);
    assert.ok(String(mailto.body.data.mailto).startsWith('mailto:'));

    const cancel = await agent.delete(`/api/bookings/slots/${slotId}`).expect(200);
    assert.ok(String(cancel.body.data.notifyOwnerMailto).startsWith('mailto:'));
  });

  test('owner dashboard lists slots and pending meeting requests (empty ok)', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: ownerEmail, password }).expect(200);
    const dash = await agent.get('/api/dashboard').expect(200);
    assert.equal(dash.body.data.isOwner, true);
    assert.ok(Array.isArray(dash.body.data.appointments));
    assert.ok(Array.isArray(dash.body.data.meetingRequestsPending));
  });

  test('PUT /api/users/me updates profile', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: studentEmail, password }).expect(200);
    const res = await agent
      .put('/api/users/me')
      .send({ firstName: 'Student2', lastName: 'Renamed' })
      .expect(200);
    assert.equal(res.body.data.user.firstName, 'Student2');
  });

  test('overlapping slots in one POST returns 422', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: ownerEmail, password }).expect(200);
    const d = futureSlotDate(20);
    await agent
      .post('/api/slots')
      .send({
        slots: [
          { date: d, startTime: '09:00', endTime: '10:00' },
          { date: d, startTime: '09:30', endTime: '10:30' },
        ],
      })
      .expect(422);
  });

  test('bulk-activate two drafts', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: ownerEmail, password }).expect(200);
    const d1 = futureSlotDate(21);
    const d2 = futureSlotDate(22);
    const cr = await agent
      .post('/api/slots')
      .send({
        slots: [
          { date: d1, startTime: '11:00', endTime: '11:30' },
          { date: d2, startTime: '12:00', endTime: '12:30' },
        ],
      })
      .expect(201);
    const a = cr.body.data.slots[0].id;
    const b = cr.body.data.slots[1].id;
    const bulk = await agent
      .patch('/api/slots/bulk-activate')
      .send({ slotIds: [a, b] })
      .expect(200);
    assert.equal(bulk.body.data.activated, 2);
  });

  test('deactivate then delete a slot', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: ownerEmail, password }).expect(200);
    const d = futureSlotDate(23);
    const cr = await agent
      .post('/api/slots')
      .send({
        slots: [{ date: d, startTime: '13:00', endTime: '13:30' }],
      })
      .expect(201);
    const sid = cr.body.data.slots[0].id;
    await agent.patch(`/api/slots/${sid}/activate`).expect(200);
    await agent.patch(`/api/slots/${sid}/deactivate`).expect(200);
    await agent.delete(`/api/slots/${sid}`).expect(200);
  });

  test('GET /api/bookings (legacy list) requires auth and returns 200', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: studentEmail, password }).expect(200);
    const res = await agent.get('/api/bookings').expect(200);
    assert.ok(Array.isArray(res.body.data.bookings));
  });

  test('GET /api/appointments/export returns ICS for booked slot', async () => {
    const ownerAgent = request.agent(app);
    await ownerAgent.post('/api/auth/login').send({ email: ownerEmail, password }).expect(200);
    const dateStr = futureSlotDate(30);
    const cr = await ownerAgent
      .post('/api/slots')
      .send({
        slots: [{ date: dateStr, startTime: '15:00', endTime: '15:30' }],
      })
      .expect(201);
    const sid = cr.body.data.slots[0].id;
    await ownerAgent.patch(`/api/slots/${sid}/activate`).expect(200);

    const stu = request.agent(app);
    await stu.post('/api/auth/login').send({ email: studentEmail, password }).expect(200);
    await stu.post(`/api/slots/${sid}/book`).expect(200);

    const ics = await stu.get('/api/appointments/export').expect(200);
    assert.ok(String(ics.text).includes('BEGIN:VCALENDAR'));
  });

  // type 1 meeting request flow
  test('meeting request: create, owner accepts, appears for student', async () => {
    const stu = request.agent(app);
    await stu.post('/api/auth/login').send({ email: studentEmail, password }).expect(200);
    const cre = await stu
      .post('/api/meeting-requests')
      .send({ ownerId, message: 'Need help with A1' })
      .expect(201);
    assert.ok(cre.body.data.request?.id);
    const reqId = cre.body.data.request.id;
    assert.ok(String(cre.body.data.notifyOwnerMailto || '').startsWith('mailto:'));

    const own = request.agent(app);
    await own.post('/api/auth/login').send({ email: ownerEmail, password }).expect(200);
    const recv = await own.get('/api/meeting-requests/received').expect(200);
    assert.ok(recv.body.data.requests.some((r) => r.id === reqId));

    const meetDate = futureSlotDate(40);
    await own
      .patch(`/api/meeting-requests/${reqId}`)
      .send({
        status: 'accepted',
        date: meetDate,
        startTime: '14:00',
        endTime: '14:30',
      })
      .expect(200);

    const sent = await stu.get('/api/meeting-requests/sent').expect(200);
    const row = sent.body.data.requests.find((r) => r.id === reqId);
    assert.equal(row?.status, 'accepted');
  });

  // type 2 group meeting poll
  test('group meeting: create, participant votes, owner finalizes', async () => {
    const own = request.agent(app);
    await own.post('/api/auth/login').send({ email: ownerEmail, password }).expect(200);

    const optDate = futureSlotDate(33);
    const optDate2 = futureSlotDate(34);
    const created = await own
      .post('/api/group-meetings')
      .send({
        title: 'Project sync',
        options: [
          { date: optDate, startTime: '10:00', endTime: '11:00' },
          { date: optDate2, startTime: '15:00', endTime: '16:00' },
        ],
        participantEmails: [studentEmail, p2Email],
      })
      .expect(201);

    const meeting = created.body.data.meeting;
    assert.ok(meeting?.id);
    groupMeetingId = meeting.id;
    assert.ok(meeting.options?.length >= 2);
    groupOptionId = meeting.options[0].id;
    assert.ok(String(created.body.data.notifyParticipantsMailto || '').startsWith('mailto:'));

    const p2Agent = request.agent(app);
    await p2Agent.post('/api/auth/login').send({ email: p2Email, password }).expect(200);
    await p2Agent
      .post(`/api/group-meetings/${groupMeetingId}/vote`)
      .send({ optionIds: [groupOptionId] })
      .expect(200);

    await own
      .patch(`/api/group-meetings/${groupMeetingId}/finalize`)
      .send({ selectedOptionId: groupOptionId, isRecurring: false })
      .expect(200);

    const detail = await own.get(`/api/group-meetings/${groupMeetingId}`).expect(200);
    assert.equal(detail.body.data.meeting.status, 'finalized');
  });

  // type 3 recurrence patterns
  test('recurrence patterns: create, list mine, delete', async () => {
    const own = request.agent(app);
    await own.post('/api/auth/login').send({ email: ownerEmail, password }).expect(200);

    const startDate = nextMondayIso(70);
    const created = await own
      .post('/api/recurrence-patterns')
      .send({
        startDate,
        numWeeks: 2,
        patterns: [{ dayOfWeek: 0, startTime: '09:00', endTime: '09:30' }],
      })
      .expect(201);
    assert.ok(created.body.data.slotsGenerated >= 1);
    assert.ok(created.body.data.patterns?.[0]?.id);
    recurrencePatternId = created.body.data.patterns[0].id;

    const mine = await own.get('/api/recurrence-patterns/mine').expect(200);
    assert.ok(mine.body.data.patterns.some((p) => p.id === recurrencePatternId));

    await own.delete(`/api/recurrence-patterns/${recurrencePatternId}`).expect(200);
  });

  // teamfinder team requests
  test('team requests: create, list, get, join, duplicate join 409, leave, remove member, delete', async () => {
    const stu = request.agent(app);
    await stu.post('/api/auth/login').send({ email: studentEmail, password }).expect(200);

    const cre = await stu
      .post('/api/team-requests')
      .send({
        courseCode: 'COMP307',
        teamName: `Team ${runId}`,
        description: 'Regression team',
        maxMembers: 4,
      })
      .expect(201);
    teamRequestId = cre.body.data.teamRequest.id;

    const list = await stu.get('/api/team-requests').expect(200);
    assert.ok(list.body.data.teamRequests.some((t) => t.id === teamRequestId));

    const one = await stu.get(`/api/team-requests/${teamRequestId}`).expect(200);
    assert.ok(one.body.data.teamRequest.members.length >= 1);

    const p2Agent = request.agent(app);
    await p2Agent.post('/api/auth/login').send({ email: p2Email, password }).expect(200);
    const join = await p2Agent.post(`/api/team-requests/${teamRequestId}/join`).expect(200);
    assert.ok(String(join.body.data.mailto || '').startsWith('mailto:'));

    await p2Agent.post(`/api/team-requests/${teamRequestId}/join`).expect(409);

    const leave = await p2Agent.delete(`/api/team-requests/${teamRequestId}/leave`).expect(200);
    assert.ok(String(leave.body.data.mailto || '').startsWith('mailto:'));

    await p2Agent.post(`/api/team-requests/${teamRequestId}/join`).expect(200);

    await stu.delete(`/api/team-requests/${teamRequestId}/members/${p2Id}`).expect(200);

    await stu.delete(`/api/team-requests/${teamRequestId}`).expect(200);
  });

  // auth logout and password change
  test('logout clears session; wrong password change rejected', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: p2Email, password }).expect(200);
    await agent.get('/api/auth/me').expect(200);
    await agent.post('/api/auth/logout').expect(200);
    await agent.get('/api/auth/me').expect(401);

    const own = request.agent(app);
    await own.post('/api/auth/login').send({ email: ownerEmail, password }).expect(200);
    await own
      .put('/api/users/me/password')
      .send({ oldPassword: 'wrong', newPassword: password2 })
      .expect(401);

    await own
      .put('/api/users/me/password')
      .send({ oldPassword: password, newPassword: password2 })
      .expect(200);

    await own.post('/api/auth/logout').expect(200);
    await own.post('/api/auth/login').send({ email: ownerEmail, password: password2 }).expect(200);
  });
});
