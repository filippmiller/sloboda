// Direct database seed - run with: railway run node server/scripts/seed-direct.js
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function seed() {
  const client = await pool.connect();

  try {
    console.log('Creating users...');

    const hash = await bcrypt.hash('Test123!@#', 10);

    // Create users
    const users = [
      { name: 'Александр Иванов', email: 'alex.forum@example.com', telegram: '@alex_ivanov', location: 'Москва' },
      { name: 'Мария Петрова', email: 'maria.forum@example.com', telegram: '@maria_p', location: 'Санкт-Петербург' },
      { name: 'Дмитрий Сидоров', email: 'dmitry.forum@example.com', telegram: '@dmitry_s', location: 'Казань' }
    ];

    const userIds = [];
    for (const user of users) {
      const result = await client.query(
        `INSERT INTO users (name, email, telegram, location, password, environment)
         VALUES ($1, $2, $3, $4, $5, 'production')
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [user.name, user.email, user.telegram, user.location, hash]
      );
      userIds.push(result.rows[0].id);
      console.log(`✓ User: ${user.name}`);
    }

    console.log('\nCreating threads...');

    // Create threads
    const threads = [
      { title: 'Добро пожаловать в форум SLOBODA!', body: 'Рады приветствовать всех участников нашего сообщества. Здесь мы обсуждаем вопросы устойчивого развития, экопоселений и осознанной жизни. Давайте знакомиться!', authorIdx: 0 },
      { title: 'Вопрос о выборе участка для экопоселения', body: 'Подскажите, какие критерии важны при выборе земли под экопоселение? Рассматриваем несколько вариантов в Подмосковье и Тверской области.', authorIdx: 1 },
      { title: 'Опыт строительства экодома из соломы', body: 'Делюсь опытом постройки дома из соломенных блоков. Прошло уже два года, и могу рассказать о плюсах и минусах этой технологии.', authorIdx: 0 },
      { title: 'Организация системы водоснабжения', body: 'Как лучше организовать автономное водоснабжение в поселении? Скважина, колодец или сбор дождевой воды? Какой у кого опыт?', authorIdx: 2 },
      { title: 'Пермакультурное земледелие - с чего начать?', body: 'Хочу начать применять принципы пермакультуры на своём участке. Кто может посоветовать хорошие книги и практические курсы по теме?', authorIdx: 1 }
    ];

    const threadIds = [];
    for (const thread of threads) {
      const result = await client.query(
        `INSERT INTO forum_threads (title, body, type, author_id)
         VALUES ($1, $2, 'discussion', $3)
         RETURNING id`,
        [thread.title, thread.body, userIds[thread.authorIdx]]
      );
      threadIds.push(result.rows[0].id);
      console.log(`✓ Thread: ${thread.title.substring(0, 40)}...`);
    }

    console.log('\nCreating comments...');

    // Create comments
    const comments = [
      { body: 'Спасибо за создание этого форума! Очень рад присоединиться к сообществу единомышленников.', threadIdx: 0, authorIdx: 1 },
      { body: 'Я живу в экопоселении уже 5 лет. Буду рад делиться опытом!', threadIdx: 0, authorIdx: 2 },
      { body: 'Главное - доступность инфраструктуры. Нужно, чтобы был доступ к дорогам, медицине и школам для детей.', threadIdx: 1, authorIdx: 0 },
      { body: 'Также важна почва и наличие воды. Рекомендую заказать геологическое исследование перед покупкой.', threadIdx: 1, authorIdx: 2 },
      { body: 'Очень интересно! А как дом ведёт себя зимой? Не промерзает?', threadIdx: 2, authorIdx: 1 },
      { body: 'Мы делали скважину 60 метров. Отличное качество воды, хватает на большую семью.', threadIdx: 3, authorIdx: 0 },
      { body: 'Рекомендую начать с книг Зеппа Хольцера и Билла Моллисона. Очень практичные!', threadIdx: 4, authorIdx: 2 }
    ];

    for (const comment of comments) {
      await client.query(
        `INSERT INTO forum_comments (body, author_id, thread_id)
         VALUES ($1, $2, $3)`,
        [comment.body, userIds[comment.authorIdx], threadIds[comment.threadIdx]]
      );
      console.log(`✓ Comment: ${comment.body.substring(0, 40)}...`);
    }

    console.log('\nCreating roles and reputation...');

    // Create roles
    for (let i = 0; i < userIds.length; i++) {
      const role = i === 2 ? 'senior_member' : 'member';
      await client.query(
        `INSERT INTO forum_roles (user_id, role, can_post, can_comment, can_create_threads, can_upvote, can_downvote, can_edit_own_posts)
         VALUES ($1, $2, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE)
         ON CONFLICT (user_id) DO NOTHING`,
        [userIds[i], role]
      );
      console.log(`✓ Role: ${role} for user ${i + 1}`);
    }

    // Create reputation
    const reputationData = [
      { points: 45, threads: 2, posts: 3 },
      { points: 38, threads: 2, posts: 2 },
      { points: 62, threads: 1, posts: 3 }
    ];

    for (let i = 0; i < userIds.length; i++) {
      await client.query(
        `INSERT INTO forum_reputation (user_id, total_points, threads_created, posts_created)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO NOTHING`,
        [userIds[i], reputationData[i].points, reputationData[i].threads, reputationData[i].posts]
      );
      console.log(`✓ Reputation: ${reputationData[i].points} points for user ${i + 1}`);
    }

    console.log('\n✓ Forum data seeded successfully!');
    console.log(`\nCreated:`);
    console.log(`  - ${userIds.length} users`);
    console.log(`  - ${threadIds.length} threads`);
    console.log(`  - ${comments.length} comments`);

  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
