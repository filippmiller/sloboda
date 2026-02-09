// Temporary admin endpoint to seed forum data
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const bcrypt = require('bcrypt');

let db;

function setDb(database) {
  db = database;
}

// POST /api/admin/seed-forum - One-time data seeding
router.post('/seed-forum', requireAuth, async (req, res) => {
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const results = {
      users: [],
      threads: [],
      comments: [],
      roles: [],
      reputation: []
    };

    // Create users
    const hash = await bcrypt.hash('Test123!@#', 10);
    const users = [
      { name: 'Александр Иванов', email: 'alex.forum@example.com', telegram: '@alex_ivanov', location: 'Москва' },
      { name: 'Мария Петрова', email: 'maria.forum@example.com', telegram: '@maria_p', location: 'Санкт-Петербург' },
      { name: 'Дмитрий Сидоров', email: 'dmitry.forum@example.com', telegram: '@dmitry_s', location: 'Казань' }
    ];

    const userIds = [];
    for (const user of users) {
      const result = await client.query(
        `INSERT INTO users (name, email, telegram, location, password_hash, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
         RETURNING id, name`,
        [user.name, user.email, user.telegram, user.location, hash]
      );
      userIds.push(result.rows[0].id);
      results.users.push(result.rows[0].name);
    }

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
         RETURNING id, title`,
        [thread.title, thread.body, userIds[thread.authorIdx]]
      );
      threadIds.push(result.rows[0].id);
      results.threads.push(result.rows[0].title);
    }

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
      results.comments.push(comment.body.substring(0, 50) + '...');
    }

    // Create roles
    const roleNames = ['member', 'member', 'senior_member'];
    for (let i = 0; i < userIds.length; i++) {
      await client.query(
        `INSERT INTO forum_roles (user_id, role, can_post, can_comment, can_create_threads, can_upvote, can_downvote, can_edit_own_posts, can_delete_own_posts, can_upload_images, can_bookmark)
         VALUES ($1, $2, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, $3, $3, TRUE)
         ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role`,
        [userIds[i], roleNames[i], roleNames[i] === 'senior_member']
      );
      results.roles.push(`${users[i].name} → ${roleNames[i]}`);
    }

    // Create reputation
    const reputationData = [45, 38, 62];
    for (let i = 0; i < userIds.length; i++) {
      await client.query(
        `INSERT INTO forum_reputation (user_id, total_points, threads_created, posts_created)
         VALUES ($1, $2, 0, 0)
         ON CONFLICT (user_id) DO UPDATE SET total_points = EXCLUDED.total_points`,
        [userIds[i], reputationData[i]]
      );
      results.reputation.push(`${users[i].name} → ${reputationData[i]} points`);
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Forum data seeded successfully',
      results: {
        users_created: results.users.length,
        threads_created: results.threads.length,
        comments_created: results.comments.length,
        roles_created: results.roles.length,
        reputation_created: results.reputation.length
      },
      details: results
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Seed error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to seed data',
      details: error.message
    });
  } finally {
    client.release();
  }
});

module.exports = { router, setDb };
