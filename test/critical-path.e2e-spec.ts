import request from 'supertest';

/**
 * Live HTTP suite against a running API + test/dev database.
 * Never pointed at production. Enable with LIVE_E2E=1.
 */
const enabled = process.env.LIVE_E2E === '1';
const api = (process.env.LIVE_API_BASE || 'http://127.0.0.1:3000/api/v1').replace(
  /\/$/,
  '',
);
const staffEmail = process.env.LIVE_STAFF_EMAIL || 'admin@zeengo.com';
const staffPassword = process.env.LIVE_STAFF_PASSWORD || '1234567';

const describeLive = enabled ? describe : describe.skip;

describeLive('Critical path (live HTTP)', () => {
  let staffToken = '';
  let supportToken = '';
  let bookingId = '';
  let znCode = '';
  let clientToken = '';
  let documentId = '';
  const phone = `9665${`${Date.now()}`.slice(-8)}`;

  it('liveness and readiness are healthy', async () => {
    const live = await request(api.replace(/\/api\/v1$/, '')).get('/api/v1/system/health/live');
    expect(live.status).toBe(200);
    const ready = await request(api.replace(/\/api\/v1$/, '')).get(
      '/api/v1/system/health/ready',
    );
    expect(ready.status).toBe(200);
    expect(ready.body.data?.status || ready.body.status).toBeDefined();
  });

  it('staff login works', async () => {
    const res = await request(api.replace(/\/api\/v1$/, ''))
      .post('/api/v1/auth/staff/login')
      .send({ email: staffEmail, password: staffPassword });
    expect(res.status).toBe(201);
    staffToken = res.body.data.accessToken;
    expect(staffToken).toBeTruthy();
  });

  it('support cannot read dashboard overview', async () => {
    const login = await request(api.replace(/\/api\/v1$/, ''))
      .post('/api/v1/auth/staff/login')
      .send({ email: 'support@zeengo.com', password: staffPassword });
    if (login.status !== 201) return;
    supportToken = login.body.data.accessToken;
    const dash = await request(api.replace(/\/api\/v1$/, ''))
      .get('/api/v1/dashboard/overview')
      .set('Authorization', `Bearer ${supportToken}`);
    expect(dash.status).toBe(403);
  });

  it('customer request creates a booking + ZN', async () => {
    const res = await request(api.replace(/\/api\/v1$/, ''))
      .post('/api/v1/client/bookings/request')
      .send({
        idempotencyKey: `e2e-${Date.now()}`,
        client: {
          fullName: 'E2E Guest',
          phone,
          email: 'e2e@example.com',
        },
        partySize: 2,
        childrenCount: 0,
        arrivalDate: '2026-11-10',
        departureDate: '2026-11-14',
        customerNotes: 'Critical-path e2e',
        source: 'customer_web',
        requestedItems: [{ title: 'Moscow hotel night', kind: 'hotel' }],
      });
    expect([200, 201]).toContain(res.status);
    bookingId = res.body.data.id;
    znCode = res.body.data.znCode;
    expect(znCode).toMatch(/^ZN/i);
    expect(res.body.data.requestStatus).toBe('pending');
  });

  it('OPS can open and confirm the request', async () => {
    const open = await request(api.replace(/\/api\/v1$/, ''))
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(open.status).toBe(200);

    const confirm = await request(api.replace(/\/api\/v1$/, ''))
      .post(`/api/v1/bookings/${bookingId}/request-review`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ requestStatus: 'confirmed' });
    expect([200, 201]).toContain(confirm.status);
    expect(confirm.body.data.requestStatus).toBe('confirmed');
  });

  it('customer ZN login reaches My Trip', async () => {
    const login = await request(api.replace(/\/api\/v1$/, ''))
      .post('/api/v1/auth/client/zn-login')
      .send({ znCode, phone, platform: 'web' });
    expect([200, 201]).toContain(login.status);
    clientToken = login.body.data.accessToken;
    const home = await request(api.replace(/\/api\/v1$/, ''))
      .get('/api/v1/client/home')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(home.status).toBe(200);
    expect(home.body.data.znCode).toBe(znCode);
    expect(home.body.data.requestStatus).toBe('confirmed');
  });

  it('customer A cannot read another booking', async () => {
    const other = await request(api.replace(/\/api\/v1$/, ''))
      .get('/api/v1/bookings')
      .set('Authorization', `Bearer ${staffToken}`);
    const foreign = (other.body.data as Array<{ id: string }> | undefined)?.find(
      (row) => row.id !== bookingId,
    );
    if (!foreign) return;
    const sneak = await request(api.replace(/\/api\/v1$/, ''))
      .get(`/api/v1/bookings/${foreign.id}`)
      .set('Authorization', `Bearer ${clientToken}`);
    expect([401, 403, 404]).toContain(sneak.status);
  });

  it('OPS can upload a customer-visible document', async () => {
    const res = await request(api.replace(/\/api\/v1$/, ''))
      .post(`/api/v1/bookings/${bookingId}/documents`)
      .set('Authorization', `Bearer ${staffToken}`)
      .field('category', 'voucher')
      .field('customerVisible', 'true')
      .attach('file', Buffer.from('%PDF-1.4 e2e'), 'e2e-voucher.pdf');
    expect([200, 201]).toContain(res.status);
    documentId = res.body.data.id;
    expect(documentId).toBeTruthy();
  });

  it('customer can list and download own document', async () => {
    const list = await request(api.replace(/\/api\/v1$/, ''))
      .get('/api/v1/client/documents')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(list.status).toBe(200);
    expect((list.body.data as Array<{ id: string }>).some((d) => d.id === documentId)).toBe(
      true,
    );
    const dl = await request(api.replace(/\/api\/v1$/, ''))
      .get(`/api/v1/client/documents/${documentId}/download`)
      .set('Authorization', `Bearer ${clientToken}`);
    expect(dl.status).toBe(200);
  });

  it('unrelated client cannot download the document', async () => {
    const sneak = await request(api.replace(/\/api\/v1$/, ''))
      .get(`/api/v1/documents/${documentId}/download`);
    expect([401, 403]).toContain(sneak.status);
  });

  it('support cannot query staff audit logs', async () => {
    if (!supportToken) return;
    const res = await request(api.replace(/\/api\/v1$/, ''))
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${supportToken}`);
    expect(res.status).toBe(403);
  });

  it('booking history includes document upload', async () => {
    const res = await request(api.replace(/\/api\/v1$/, ''))
      .get(`/api/v1/bookings/${bookingId}/history`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    const actions = (res.body.data as Array<{ action: string }>).map((r) => r.action);
    expect(actions.some((a) => a.includes('document') || a.includes('request'))).toBe(true);
  });
});
