import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseAuthAttemptSearch, parseLogSearch } from './audit.search';

describe('parseAuthAttemptSearch', () => {
  it('reads a 12-digit IIN', () => {
    assert.deepEqual(parseAuthAttemptSearch('951127222222'), { iin: '951127222222' });
  });

  it('normalises every way a phone is written to 7XXXXXXXXXX', () => {
    for (const typed of ['77022737109', '87022737109', '+7 (702) 273-71-09', '7022737109']) {
      assert.deepEqual(parseAuthAttemptSearch(typed), { phone: '77022737109' }, typed);
    }
  });

  it('refuses partial numbers instead of guessing', () => {
    assert.equal(parseAuthAttemptSearch('70227'), null);
    assert.equal(parseAuthAttemptSearch('97022737109'), null);
    assert.equal(parseAuthAttemptSearch('Иванов'), null);
  });
});

describe('parseLogSearch', () => {
  it('treats a full phone or IIN as a person to resolve', () => {
    assert.deepEqual(parseLogSearch('+7 702 273 71 09'), { person: { phone: '77022737109' } });
    assert.deepEqual(parseLogSearch('951127222222'), { person: { iin: '951127222222' } });
  });

  it('reads a pasted request or user id', () => {
    assert.deepEqual(parseLogSearch(' C763F858-8C22-4AF6-ACFA-19FBF4D5E5E8 '), {
      id: 'c763f858-8c22-4af6-acfa-19fbf4d5e5e8',
    });
  });

  it('falls back to text for anything else, short numbers included', () => {
    assert.deepEqual(parseLogSearch('/auth/request-otp'), { text: '/auth/request-otp' });
    assert.deepEqual(parseLogSearch('404'), { text: '404' });
  });
});
