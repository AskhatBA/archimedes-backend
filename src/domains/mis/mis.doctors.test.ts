import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ageOn, filterDoctorsByAge } from './mis.doctors';

const NOW = new Date(2026, 9, 13); // 13 октября 2026

describe('ageOn', () => {
  it('counts full years in every format we receive', () => {
    assert.equal(ageOn('2010-10-13', NOW), 16);
    assert.equal(ageOn('2010-10-13T00:00:00', NOW), 16);
    assert.equal(ageOn('13.10.2010', NOW), 16);
  });

  it('does not count a birthday that has not come yet this year', () => {
    assert.equal(ageOn('2010-10-14', NOW), 15);
    assert.equal(ageOn('2010-11-01', NOW), 15);
  });

  it('gives null for a date it cannot read', () => {
    assert.equal(ageOn('', NOW), null);
    assert.equal(ageOn(null, NOW), null);
    assert.equal(ageOn('not a date', NOW), null);
    assert.equal(ageOn('2030-01-01', NOW), null);
  });
});

describe('filterDoctorsByAge', () => {
  const doctors = [
    { id: 'kid', is_pediatric: true },
    { id: 'adult', is_pediatric: false },
    { id: 'unflagged' },
  ];
  const ids = (age: number | null) => filterDoctorsByAge(doctors, age).map((d) => d.id);

  it('leaves a child only the pediatric doctors', () => {
    assert.deepEqual(ids(0), ['kid']);
    assert.deepEqual(ids(15), ['kid']);
  });

  it('takes the pediatric doctors away from anyone 16 or older', () => {
    assert.deepEqual(ids(16), ['adult', 'unflagged']);
    assert.deepEqual(ids(40), ['adult', 'unflagged']);
  });

  it('keeps the whole list when the age is unknown', () => {
    assert.deepEqual(ids(null), ['kid', 'adult', 'unflagged']);
  });
});
