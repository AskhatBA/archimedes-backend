/**
 * Seed (or re-seed) the check-up catalogue served at `GET /v1/api/checkups`.
 *
 * The catalogue below is the clinic's check-up price list — one entry per row of
 * the source spreadsheet, with the `Описание` column split on `;` into the service
 * checklist the app renders.
 *
 * Upserts on `code`, so the script is safe to re-run: it refreshes what the price
 * list owns (title, price, services, ordering) and leaves the columns an operator
 * curates in the database — `description`, `duration`, `coverage`, `popular` —
 * untouched on rows that already exist. Entries missing from the list are left
 * alone too; retire one by flipping its `isActive` flag rather than deleting it.
 *
 * Run with:  npm run db:seed-checkups
 */
import { prismaClient } from '@/infrastructure/db';

interface CheckupSeed {
  code: string;
  title: string;
  /** Price in tenge. */
  price: number;
  sortOrder: number;
  services: string[];
}

const CHECKUPS: CheckupSeed[] = [
  {
    code: 'thyroid',
    title: 'Чек-ап «Щитовидка без сюрпризов»',
    price: 25300,
    sortOrder: 10,
    services: [
      'Консультация эндокринолога',
      'УЗИ щитовидной железы',
      'ТТГ',
      'Антитела к тиреоидной пероксидазе (Анти-ТПО)',
      'Т4 свободный',
      'Т3 свободный',
      'Общий анализ крови (развернутый)',
    ],
  },
  {
    code: 'heart',
    title: 'Чек-ап «Сердце без тревог»',
    price: 35000,
    sortOrder: 20,
    services: [
      'Консультация кардиолога',
      'Общий анализ крови (развернутый)',
      'Общий холестерин',
      'ЛПНП, ЛПВП',
      'Глюкоза, АЛТ, АСТ, ТГ, креатинин',
      'Электрокардиография (ЭКГ)',
      'Эхокардиография (ЭхоКГ)',
    ],
  },
  {
    code: 'liver',
    title: 'Чек-ап «Здоровая печень»',
    price: 36400,
    sortOrder: 30,
    services: [
      'Консультация терапевта/ВОП',
      'УЗИ органов брюшной полости',
      'Общий анализ крови (развернутый)',
      'Общий анализ мочи',
      'Общий билирубин, прямой билирубин',
      'АСТ, АЛТ, ГГТП, щелочная фосфотаза',
      'Гепатит В, гепатит С',
    ],
  },
  {
    code: 'anemia',
    title: 'Чек-ап «Стоп анемия»',
    price: 18000,
    sortOrder: 40,
    services: [
      'Консультация терапевта/педиатра',
      'Общий анализ крови (развернутый)',
      'Ферритин',
      'Витамин В12',
      'Фолиевая кислота',
    ],
  },
  {
    code: 'kidneys',
    title: 'Чек-ап «Здоровые почки»',
    price: 15400,
    sortOrder: 50,
    services: [
      'Консультация терапевта/педиатра/ВОП',
      'УЗИ почек',
      'Общий анализ крови (развернутый)',
      'Общий анализ мочи',
      'Глюкоза',
      'Мочевина',
      'Креатинин',
      'Мочевая кислота',
    ],
  },
  {
    code: 'womens-balance',
    title: 'Чек-ап «Женский баланс»',
    price: 21700,
    sortOrder: 60,
    services: [
      'Консультация гинеколога',
      'УЗИ органов малого таза',
      'Кольпоскопия',
      'Гинекологический мазок',
    ],
  },
  {
    code: 'diabetes',
    title: 'Чек-ап «Стоп диабет»',
    price: 17900,
    sortOrder: 70,
    services: [
      'Консультация эндокринолога',
      'Гликированный гемоглобин',
      'Глюкоза',
      'Инсулин',
      'Общий анализ крови (развернутый)',
      'Общий анализ мочи',
    ],
  },
  {
    code: 'womens-health',
    title: 'Чек-ап «Женское здоровье»',
    price: 20100,
    sortOrder: 80,
    services: [
      'Консультация гинеколога (два приема)',
      'ПАП-тест (жидкостная цитология)',
      'Мазок на флору',
      'УЗИ органов малого таза',
    ],
  },
  {
    code: 'womens-health-plus',
    title: 'Чек-ап «Женское здоровье Плюс»',
    price: 45900,
    sortOrder: 90,
    services: [
      'Консультация гинеколога (два приема)',
      'ПАП-тест (жидкостная цитология)',
      'ВПЧ высокого канцерогенного риска',
      'Мазок на флору',
      'ПЦР на ИППП',
      'УЗИ органов малого таза',
      'Видеокольпоскопия',
    ],
  },
  {
    code: 'preconception-male',
    title: 'Прегравидарная подготовка «Первые шаги к будущему отцовству»',
    price: 62200,
    sortOrder: 100,
    services: [
      'Консультация врача-уролога (два приема)',
      'ТТГ',
      'Общий анализ крови (развернутый)',
      'Группа крови и резус-фактор',
      'Глюкоза',
      'Гепатит В и С',
      'Витамин Д',
      'Реакция Вассермана',
      'ВИЧ',
      'ПЦР на 4 (четыре) ИППП',
    ],
  },
  {
    code: 'preconception-female',
    title: 'Прегравидарная подготовка «Первые шаги к будущему материнству»',
    price: 103600,
    sortOrder: 110,
    services: [
      'Консультация гинеколога (два приема)',
      'УЗИ органов малого таза',
      'ТТГ',
      'Общий анализ крови (развернутый)',
      'Группа крови и резус-фактор',
      'Ферритин',
      'Глюкоза',
      'Гепатит В и С',
      'Витамин Д',
      'Реакция Вассермана',
      'ВИЧ',
      'ИФА на токсоплазмоз и краснуху',
      'ПЦР на 4 (четыре) ИППП',
      'Жидкостная цитология',
    ],
  },
];

const main = async () => {
  for (const checkup of CHECKUPS) {
    const { code, ...fields } = checkup;

    await prismaClient.checkup.upsert({
      where: { code },
      update: { ...fields, isActive: true },
      create: { code, ...fields },
    });
  }

  console.log(`✓ Seeded ${CHECKUPS.length} check-up(s).`);
};

main()
  .catch((err) => {
    console.error('✗ Failed to seed the check-up catalogue:', err);
    process.exit(1);
  })
  .finally(() => prismaClient.$disconnect());
