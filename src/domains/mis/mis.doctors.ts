import { MISDoctor } from './mis.types';

/**
 * Младше этого возраста пациент — ребёнок и записывается только к педиатрическим врачам
 * (`is_pediatric` в МИС); с этого возраста — только ко взрослым.
 */
export const PEDIATRIC_AGE_LIMIT = 16;

/**
 * Полных лет на `now`. Дату принимаем так, как её хранят у нас (`YYYY-MM-DD`) и отдаёт
 * страховая (`YYYY-MM-DDT00:00:00`), и на всякий случай `DD.MM.YYYY`. Время и часовой пояс
 * отбрасываются: день рождения — это дата, и смещение не должно сдвигать его на сутки.
 * `null`, если дату разобрать не удалось.
 */
export const ageOn = (birthDate: string | null | undefined, now: Date): number | null => {
  const value = (birthDate ?? '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const dotted = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);

  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : dotted
      ? [Number(dotted[3]), Number(dotted[2]), Number(dotted[1])]
      : [NaN, NaN, NaN];

  if (!year || !month || !day || month > 12 || day > 31) return null;

  const hadBirthdayThisYear =
    now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day);
  const age = now.getFullYear() - year - (hadBirthdayThisYear ? 0 : 1);

  return age >= 0 ? age : null;
};

/**
 * Врачи, к которым может записаться пациент этого возраста: ребёнку — только с
 * `is_pediatric`, взрослому — все остальные. Возраст неизвестен — список не трогаем:
 * пустой список врачей хуже, чем лишний в нём.
 */
export const filterDoctorsByAge = <T extends Pick<MISDoctor, 'is_pediatric'>>(
  doctors: T[],
  age: number | null
): T[] => {
  if (age === null) return doctors;

  const isChild = age < PEDIATRIC_AGE_LIMIT;

  return doctors.filter((doctor) => (doctor.is_pediatric === true) === isChild);
};
