-- Seed forum sample data

-- Create users
INSERT INTO users (name, email, telegram, location, password, environment)
VALUES
  ('Александр Иванов', 'alex.forum@example.com', '@alex_ivanov', 'Москва', '$2b$10$rKJ8YQXxvY7GvZ0hZqzOB.xK3qZ8QXxvY7GvZ0hZqzOB.xK3qZ8QX', 'production'),
  ('Мария Петрова', 'maria.forum@example.com', '@maria_p', 'Санкт-Петербург', '$2b$10$rKJ8YQXxvY7GvZ0hZqzOB.xK3qZ8QXxvY7GvZ0hZqzOB.xK3qZ8QX', 'production'),
  ('Дмитрий Сидоров', 'dmitry.forum@example.com', '@dmitry_s', 'Казань', '$2b$10$rKJ8YQXxvY7GvZ0hZqzOB.xK3qZ8QXxvY7GvZ0hZqzOB.xK3qZ8QX', 'production')
ON CONFLICT (email) DO NOTHING;

-- Get user IDs (will use them in threads)
DO $$
DECLARE
  user1_id INTEGER;
  user2_id INTEGER;
  user3_id INTEGER;
  thread1_id INTEGER;
  thread2_id INTEGER;
  thread3_id INTEGER;
  thread4_id INTEGER;
  thread5_id INTEGER;
BEGIN
  -- Get user IDs
  SELECT id INTO user1_id FROM users WHERE email = 'alex.forum@example.com';
  SELECT id INTO user2_id FROM users WHERE email = 'maria.forum@example.com';
  SELECT id INTO user3_id FROM users WHERE email = 'dmitry.forum@example.com';

  -- Create threads
  INSERT INTO forum_threads (title, body, type, author_id)
  VALUES ('Добро пожаловать в форум SLOBODA!',
          'Рады приветствовать всех участников нашего сообщества. Здесь мы обсуждаем вопросы устойчивого развития, экопоселений и осознанной жизни. Давайте знакомиться!',
          'discussion', user1_id)
  RETURNING id INTO thread1_id;

  INSERT INTO forum_threads (title, body, type, author_id)
  VALUES ('Вопрос о выборе участка для экопоселения',
          'Подскажите, какие критерии важны при выборе земли под экопоселение? Рассматриваем несколько вариантов в Подмосковье и Тверской области.',
          'question', user2_id)
  RETURNING id INTO thread2_id;

  INSERT INTO forum_threads (title, body, type, author_id)
  VALUES ('Опыт строительства экодома из соломы',
          'Делюсь опытом постройки дома из соломенных блоков. Прошло уже два года, и могу рассказать о плюсах и минусах этой технологии.',
          'discussion', user1_id)
  RETURNING id INTO thread3_id;

  INSERT INTO forum_threads (title, body, type, author_id)
  VALUES ('Организация системы водоснабжения',
          'Как лучше организовать автономное водоснабжение в поселении? Скважина, колодец или сбор дождевой воды? Какой у кого опыт?',
          'question', user3_id)
  RETURNING id INTO thread4_id;

  INSERT INTO forum_threads (title, body, type, author_id)
  VALUES ('Пермакультурное земледелие - с чего начать?',
          'Хочу начать применять принципы пермакультуры на своём участке. Кто может посоветовать хорошие книги и практические курсы по теме?',
          'question', user2_id)
  RETURNING id INTO thread5_id;

  -- Create comments
  INSERT INTO forum_comments (body, author_id, thread_id)
  VALUES
    ('Спасибо за создание этого форума! Очень рад присоединиться к сообществу единомышленников.', user2_id, thread1_id),
    ('Я живу в экопоселении уже 5 лет. Буду рад делиться опытом!', user3_id, thread1_id),
    ('Главное - доступность инфраструктуры. Нужно, чтобы был доступ к дорогам, медицине и школам для детей.', user1_id, thread2_id),
    ('Также важна почва и наличие воды. Рекомендую заказать геологическое исследование перед покупкой.', user3_id, thread2_id),
    ('Очень интересно! А как дом ведёт себя зимой? Не промерзает?', user2_id, thread3_id),
    ('Мы делали скважину 60 метров. Отличное качество воды, хватает на большую семью.', user1_id, thread4_id),
    ('Рекомендую начать с книг Зеппа Хольцера и Билла Моллисона. Очень практичные!', user3_id, thread5_id);

  -- Create forum roles
  INSERT INTO forum_roles (user_id, role, can_post, can_comment, can_create_threads, can_upvote, can_downvote, can_edit_own_posts)
  VALUES
    (user1_id, 'member', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
    (user2_id, 'member', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
    (user3_id, 'senior_member', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE)
  ON CONFLICT (user_id) DO NOTHING;

  -- Create reputation
  INSERT INTO forum_reputation (user_id, total_points, threads_created, posts_created)
  VALUES
    (user1_id, 45, 2, 3),
    (user2_id, 38, 2, 2),
    (user3_id, 62, 1, 3)
  ON CONFLICT (user_id) DO NOTHING;

  RAISE NOTICE 'Forum data seeded successfully!';
END$$;
