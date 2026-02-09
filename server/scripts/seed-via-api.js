// Seed forum data via API endpoints
const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'https://sloboda-production.up.railway.app';

// Sample data
const users = [
  { name: 'Александр Иванов', email: 'alex.forum@example.com', telegram: '@alex_ivanov', location: 'Москва' },
  { name: 'Мария Петрова', email: 'maria.forum@example.com', telegram: '@maria_p', location: 'Санкт-Петербург' },
  { name: 'Дмитрий Сидоров', email: 'dmitry.forum@example.com', telegram: '@dmitry_s', location: 'Казань' }
];

const threads = [
  {
    title: 'Добро пожаловать в форум SLOBODA!',
    content: 'Рады приветствовать всех участников нашего сообщества. Здесь мы обсуждаем вопросы устойчивого развития, экопоселений и осознанной жизни. Давайте знакомиться!'
  },
  {
    title: 'Вопрос о выборе участка для экопоселения',
    content: 'Подскажите, какие критерии важны при выборе земли под экопоселение? Рассматриваем несколько вариантов в Подмосковье и Тверской области.'
  },
  {
    title: 'Опыт строительства экодома из соломы',
    content: 'Делюсь опытом постройки дома из соломенных блоков. Прошло уже два года, и могу рассказать о плюсах и минусах этой технологии.'
  },
  {
    title: 'Организация системы водоснабжения',
    content: 'Как лучше организовать автономное водоснабжение в поселении? Скважина, колодец или сбор дождевой воды? Какой у кого опыт?'
  },
  {
    title: 'Пермакультурное земледелие - с чего начать?',
    content: 'Хочу начать применять принципы пермакультуры на своём участке. Кто может посоветовать хорошие книги и практические курсы по теме?'
  }
];

const comments = [
  { threadIndex: 0, body: 'Спасибо за создание этого форума! Очень рад присоединиться к сообществу единомышленников.' },
  { threadIndex: 0, body: 'Я живу в экопоселении уже 5 лет. Буду рад делиться опытом!' },
  { threadIndex: 1, body: 'Главное - доступность инфраструктуры. Нужно, чтобы был доступ к дорогам, медицине и школам для детей.' },
  { threadIndex: 1, body: 'Также важна почва и наличие воды. Рекомендую заказать геологическое исследование перед покупкой.' },
  { threadIndex: 2, body: 'Очень интересно! А как дом ведёт себя зимой? Не промерзает?' },
  { threadIndex: 3, body: 'Мы делали скважину 60 метров. Отличное качество воды, хватает на большую семью.' },
  { threadIndex: 4, body: 'Рекомендую начать с книг Зеппа Хольцера и Билла Моллисона. Очень практичные!' }
];

async function main() {
  console.log('Starting forum data seeding via API...\n');

  try {
    // Direct database insert for users (using Railway CLI)
    console.log('Step 1: Create users via Railway...');
    console.log('Run this command in Railway CLI:');
    console.log('\nrailway run node -e "');
    console.log('const db = require(\'./server/db\');');
    console.log('const bcrypt = require(\'bcrypt\');');
    console.log('(async () => {');
    for (const user of users) {
      console.log(`  const hash${users.indexOf(user)} = await bcrypt.hash('Test123!@#', 10);`);
      console.log(`  await db.pool.query('INSERT INTO users (name, email, telegram, location, password, environment) VALUES (\\'${user.name}\\', \\'${user.email}\\', \\'${user.telegram}\\', \\'${user.location}\\', hash${users.indexOf(user)}, \\'production\\') ON CONFLICT (email) DO NOTHING');`);
    }
    console.log('  console.log(\\'Users created\\');');
    console.log('  process.exit(0);');
    console.log('})();"\n');

    console.log('\nStep 2: Get user IDs and create auth tokens...');
    console.log('Then use the user tokens to create threads via API\n');

    console.log('Step 3: Create threads and comments...');
    console.log('This requires authenticated API calls with user tokens\n');

    console.log('✓ Seed instructions generated');
    console.log('\nAlternatively, use admin panel to:');
    console.log('1. Create users manually in /admin/users');
    console.log('2. Have them post threads via /forum');
    console.log('3. Assign roles via /admin/forum/roles');

  } catch (error) {
    console.error('✗ Error:', error.message);
  }
}

main();
