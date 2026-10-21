import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toLogRow } from './log-row';

describe('toLogRow', () => {
  it('reads a pino-http request line', () => {
    const row = toLogRow(
      JSON.stringify({
        level: 'warn',
        time: '2026-10-20T11:59:36.750Z',
        reqId: 'c763f858-8c22-4af6-acfa-19fbf4d5e5e8',
        req: { method: 'POST', url: '/v1/api/auth/request-otp' },
        res: { statusCode: 404 },
        responseTime: 73,
        msg: 'request completed',
      })
    );

    assert.equal(row?.method, 'POST');
    assert.equal(row?.url, '/v1/api/auth/request-otp');
    assert.equal(row?.statusCode, 404);
    assert.equal(row?.durationMs, 73);
    assert.equal(row?.level, 'warn');
    assert.equal(row?.userId, null);
  });

  it('reads the error handler line, which keeps method/url at the top level', () => {
    const row = toLogRow(
      JSON.stringify({
        level: 'warn',
        method: 'GET',
        url: '/v1/api/patient/profile',
        statusCode: 401,
        userId: '8de88dbd-b775-476a-92d9-4d39be17b2fd',
        msg: 'Request rejected with application error',
      })
    );

    assert.equal(row?.statusCode, 401);
    assert.equal(row?.url, '/v1/api/patient/profile');
    assert.equal(row?.userId, '8de88dbd-b775-476a-92d9-4d39be17b2fd');
  });

  it('skips the log screen polling itself and lines that are not JSON', () => {
    assert.equal(
      toLogRow(JSON.stringify({ req: { method: 'GET', url: '/v1/api/audit/admin/logs' } })),
      null
    );
    assert.equal(toLogRow('beneficiaryId:  undefined'), null);
  });

  it('keeps only a preview of an oversized line', () => {
    const row = toLogRow(JSON.stringify({ level: 'info', msg: 'x'.repeat(70 * 1024) }));

    assert.deepEqual(Object.keys(row?.data as object), ['truncated', 'preview']);
  });
});
