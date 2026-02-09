// Seed script for forum sample data
const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3001';

// Sample users to create
const sampleUsers = [
  {
    name: 'Александр Иванов',
    email: 'alex.ivanov@example.com',
    telegram: '@alex_ivanov',
    location: 'Москва',
    password: 'Test123!@#'
  },
  {
    name: 'Мария Петрова',
    email: 'maria.petrova@example.com',
    telegram: '@maria_p',
    location: 'Санкт-Петербург',
    password: 'Test123!@#'
  },
  {
    name: 'Дмитрий Сидоров',
    email: 'dmitry.sidorov@example.com',
    telegram: '@dmitry_s',
    location: 'Казань',
    password: 'Test123!@#'
  }
];

// Sample threads
const sampleThreads = [
  {
    title: 'Добро пожаловать в форум SLOBODA!',
    body: 'Рады приветствовать всех участников нашего сообщества. Здесь мы обсуждаем вопросы устойчивого развития, экопоселений и осознанной жизни. Давайте знакомиться!',
    type: 'discussion'
  },
  {
    title: 'Вопрос о выборе участка для экопоселения',
    body: 'Подскажите, какие критерии важны при выборе земли под экопоселение? Рассматриваем несколько вариантов в Подмосковье и Тверской области.',
    type: 'question'
  },
  {
    title: 'Опыт строительства экодома из соломы',
    body: 'Делюсь опытом постройки дома из соломенных блоков. Прошло уже два года, и могу рассказать о плюсах и минусах этой технологии.',
    type: 'discussion'
  },
  {
    title: 'Организация системы водоснабжения',
    body: 'Как лучше организовать автономное водоснабжение в поселении? Скважина, колодец или сбор дождевой воды? Какой у кого опыт?',
    type: 'question'
  },
  {
    title: 'Пермакультурное земледелие - с чего начать?',
    body: 'Хочу начать применять принципы пермакультуры на своём участке. Кто может посоветовать хорошие книги и практические курсы по теме?',
    type: 'question'
  }
];

// Sample comments
const sampleComments = [
  {
    body: 'Спасибо за создание этого форума! Очень рад присоединиться к сообществу единомышленников.',
    threadIndex: 0
  },
  {
    body: 'Я живу в экопоселении уже 5 лет. Буду рад делиться опытом!',
    threadIndex: 0
  },
  {
    body: 'Главное - доступность инфраструктуры. Нужно, чтобы был доступ к дорогам, медицине и школам для детей.',
    threadIndex: 1
  },
  {
    body: 'Также важна почва и наличие воды. Рекомендую заказать геологическое исследование перед покупкой.',
    threadIndex: 1
  },
  {
    body: 'Очень интересно! А как дом ведёт себя зимой? Не промерзает?',
    threadIndex: 2
  },
  {
    body: 'Мы делали скважину 60 метров. Отличное качество воды, хватает на большую семью.',
    threadIndex: 3
  },
  {
    body: 'Рекомендую начать с книг Зеппа Хольцера и Билла Моллисона. Очень практичные!',
    threadIndex: 4
  }
];

async function seedUsers() {
  console.log('Creating sample users...');
  const createdUsers = [];

  for (const userData of sampleUsers) {
    try {
      // Check if user exists
      const existing = await axios.get(`${BASE_URL}/api/user/profile`, {
        headers: { 'Authorization': `Bearer dummy_${userData.email}` }
      }).catch(() => null);

      if (existing) {
        console.log(`User ${userData.email} already exists, skipping`);
        createdUsers.push(existing.data);
        continue;
      }

      // Create registration
      const regResponse = await axios.post(`${BASE_URL}/api/registrations`, {
        name: userData.name,
        email: userData.email,
        telegram: userData.telegram,
        location: userData.location,
        motivation: 'Интересуюсь экопоселениями',
        participation: 'active_resident',
        skills: ['строительство', 'садоводство'],
        investment_range: '1000000-3000000'
      });

      console.log(`Created registration for ${userData.email}`);

      // Auto-approve and create user (simulating admin action)
      // This would normally be done through admin API
      const db = require('../db');
      const hashedPassword = await require('bcrypt').hash(userData.password, 10);

      const userResult = await db.pool.query(`
        INSERT INTO users (name, email, telegram, location, password, environment)
        VALUES ($1, $2, $3, $4, $5, 'production')
        RETURNING id, name, email
      `, [userData.name, userData.email, userData.telegram, userData.location, hashedPassword]);

      createdUsers.push(userResult.rows[0]);
      console.log(`Created user: ${userData.name}`);
    } catch (error) {
      console.error(`Error creating user ${userData.email}:`, error.message);
    }
  }

  return createdUsers;
}

async function seedThreads(users) {
  console.log('\nCreating sample threads...');
  const createdThreads = [];

  const db = require('../db');

  for (let i = 0; i < sampleThreads.length; i++) {
    const thread = sampleThreads[i];
    const author = users[i % users.length];

    try {
      const result = await db.pool.query(`
        INSERT INTO forum_threads (title, body, type, author_id)
        VALUES ($1, $2, $3, $4)
        RETURNING id, title
      `, [thread.title, thread.body, thread.type, author.id]);

      createdThreads.push(result.rows[0]);
      console.log(`Created thread: ${thread.title}`);
    } catch (error) {
      console.error(`Error creating thread "${thread.title}":`, error.message);
    }
  }

  return createdThreads;
}

async function seedComments(threads, users) {
  console.log('\nCreating sample comments...');

  const db = require('../db');

  for (const comment of sampleComments) {
    const thread = threads[comment.threadIndex];
    const author = users[Math.floor(Math.random() * users.length)];

    if (!thread) continue;

    try {
      await db.pool.query(`
        INSERT INTO forum_comments (body, author_id, thread_id)
        VALUES ($1, $2, $3)
      `, [comment.body, author.id, thread.id]);

      console.log(`Created comment on thread "${thread.title}"`);
    } catch (error) {
      console.error(`Error creating comment:`, error.message);
    }
  }
}

async function seedRoles(users) {
  console.log('\nCreating forum roles...');

  const db = require('../db');

  const roles = ['new_user', 'member', 'senior_member'];

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const role = roles[i % roles.length];

    try {
      // Check if role exists
      const existing = await db.pool.query(
        'SELECT id FROM forum_roles WHERE user_id = $1',
        [user.id]
      );

      if (existing.rows.length > 0) {
        console.log(`Role for ${user.name} already exists`);
        continue;
      }

      // Create role with appropriate permissions
      const permissions = {
        new_user: {
          can_post: false,
          can_comment: true,
          can_create_threads: false,
          can_upvote: true,
          can_downvote: false
        },
        member: {
          can_post: true,
          can_comment: true,
          can_create_threads: true,
          can_upvote: true,
          can_downvote: true,
          can_edit_own_posts: true
        },
        senior_member: {
          can_post: true,
          can_comment: true,
          can_create_threads: true,
          can_upvote: true,
          can_downvote: true,
          can_edit_own_posts: true,
          can_delete_own_posts: true,
          can_upload_images: true
        }
      };

      const perms = permissions[role];

      await db.pool.query(`
        INSERT INTO forum_roles (
          user_id, role, can_post, can_comment, can_create_threads,
          can_upvote, can_downvote, can_edit_own_posts,
          can_delete_own_posts, can_upload_images
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        user.id, role,
        perms.can_post || false,
        perms.can_comment || false,
        perms.can_create_threads || false,
        perms.can_upvote || false,
        perms.can_downvote || false,
        perms.can_edit_own_posts || false,
        perms.can_delete_own_posts || false,
        perms.can_upload_images || false
      ]);

      // Create reputation entry
      await db.pool.query(`
        INSERT INTO forum_reputation (user_id, total_points, threads_created, posts_created)
        VALUES ($1, $2, $3, $4)
      `, [user.id, Math.floor(Math.random() * 100) + 10, 0, 0]);

      console.log(`Created ${role} role for ${user.name}`);
    } catch (error) {
      console.error(`Error creating role for ${user.name}:`, error.message);
    }
  }
}

async function main() {
  console.log('Starting forum data seeding...\n');

  try {
    const users = await seedUsers();
    if (users.length === 0) {
      console.error('No users created, cannot continue');
      return;
    }

    const threads = await seedThreads(users);
    await seedComments(threads, users);
    await seedRoles(users);

    console.log('\n✓ Forum data seeding completed successfully!');
    console.log(`Created: ${users.length} users, ${threads.length} threads`);
  } catch (error) {
    console.error('\n✗ Error seeding data:', error);
    process.exit(1);
  }
}

main();
