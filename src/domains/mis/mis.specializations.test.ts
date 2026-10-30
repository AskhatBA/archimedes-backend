import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  filterInsuredSpecializations,
  filterTelemedicineSpecializations,
} from './mis.specializations';

/** The default of TELEMEDICINE_EXCLUDED_SPECIALTIES. */
const DEFAULT_EXCLUDED = ['УЗИ', 'МАССАЖ', 'СТОМАТОЛОГ', 'ВЫЕЗДН', 'ПСИХОЛОГ', 'РЕНТГЕН'];

const specialty = (name: string) => ({ id: name, name });

/** Names as the 14 branches list them in MIS (OQ-2), plus ordinary specialties. */
const BRANCH = [
  'Врач УЗИ',
  'Врач УЗИ (ЭХО КГ)',
  'Массажист',
  'Стоматолог',
  'Выездная служба',
  'Психолог',
  'Рентгенолог',
  'Терапевт',
  'Педиатр',
  'Невропатолог',
  'Кардиолог',
  'Гинеколог',
].map(specialty);

describe('filterTelemedicineSpecializations', () => {
  it('drops the six categories and keeps every other specialty', () => {
    const names = filterTelemedicineSpecializations(BRANCH, DEFAULT_EXCLUDED).map((s) => s.name);

    assert.deepEqual(names, ['Терапевт', 'Педиатр', 'Невропатолог', 'Кардиолог', 'Гинеколог']);
  });

  it('matches without regard to case on either side', () => {
    const list = ['врач узи', 'МАССАЖИСТ', 'Хирург'].map(specialty);

    assert.deepEqual(
      filterTelemedicineSpecializations(list, ['Узи', 'массаж']).map((s) => s.name),
      ['Хирург']
    );
  });

  it('follows whatever list it is given', () => {
    assert.deepEqual(
      filterTelemedicineSpecializations(BRANCH, ['ТЕРАПЕВТ']).map((s) => s.name),
      BRANCH.map((s) => s.name).filter((name) => name !== 'Терапевт')
    );
  });

  it('passes the list through untouched when nothing is excluded', () => {
    assert.deepEqual(filterTelemedicineSpecializations(BRANCH, []), BRANCH);
    assert.deepEqual(filterTelemedicineSpecializations(BRANCH, [' ', '']), BRANCH);
  });

  it('keeps the original objects and order', () => {
    const [first] = filterTelemedicineSpecializations(BRANCH, DEFAULT_EXCLUDED);

    assert.equal(first, BRANCH[7]);
  });

  it('tolerates a specialty without a name', () => {
    const list = [{ id: 'x', name: undefined as unknown as string }, specialty('Терапевт')];

    assert.equal(filterTelemedicineSpecializations(list, DEFAULT_EXCLUDED).length, 2);
  });
});

/** Almaty, Kaldayakova 79 — the default of MIS_INSURED_HIDDEN_SPECIALTIES. */
const KALDAYAKOVA = 'db0b5ba6-c4e7-4bc9-8860-e72282f58ed3';
const HIDDEN_BY_BRANCH = { [KALDAYAKOVA]: ['ПСИХОЛОГ'] };

describe('filterInsuredSpecializations', () => {
  it('drops the listed specialty at the listed branch only', () => {
    const names = filterInsuredSpecializations(BRANCH, KALDAYAKOVA, HIDDEN_BY_BRANCH).map(
      (s) => s.name
    );

    assert.deepEqual(
      names,
      BRANCH.map((s) => s.name).filter((name) => name !== 'Психолог')
    );
  });

  it('passes any other branch through untouched', () => {
    assert.deepEqual(
      filterInsuredSpecializations(BRANCH, 'other-branch', HIDDEN_BY_BRANCH),
      BRANCH
    );
  });

  it('passes the list through when no branch is configured', () => {
    assert.deepEqual(filterInsuredSpecializations(BRANCH, KALDAYAKOVA, {}), BRANCH);
  });

  it('matches without regard to case', () => {
    const list = ['психолог', 'Детский ПСИХОЛОГ', 'Терапевт'].map(specialty);

    assert.deepEqual(
      filterInsuredSpecializations(list, KALDAYAKOVA, { [KALDAYAKOVA]: ['Психолог'] }).map(
        (s) => s.name
      ),
      ['Терапевт']
    );
  });
});
