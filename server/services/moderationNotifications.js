// Moderation notification service
const email = require('./email');

/**
 * Send notification when a user is banned
 */
async function notifyUserBanned(ban) {
  const { user_email, user_name, ban_type, reason, expires_at, banned_by_name } = ban;

  try {
    const expiryText = ban_type === 'permanent'
      ? 'постоянно'
      : `до ${new Date(expires_at).toLocaleDateString('ru-RU')}`;

    await email.sendEmail({
      to: user_email,
      subject: 'Уведомление о блокировке в форуме SLOBODA',
      html: `
        <h2>Уведомление о блокировке</h2>
        <p>Здравствуйте, ${user_name}!</p>
        <p>Ваш аккаунт был заблокирован на форуме SLOBODA ${expiryText}.</p>
        <p><strong>Причина:</strong> ${reason}</p>
        <p><strong>Модератор:</strong> ${banned_by_name || 'Система'}</p>
        <hr>
        <p>Если вы считаете, что это ошибка, свяжитесь с администрацией.</p>
        <p>С уважением,<br>Команда SLOBODA</p>
      `,
      text: `
        Уведомление о блокировке

        Здравствуйте, ${user_name}!

        Ваш аккаунт был заблокирован на форуме SLOBODA ${expiryText}.

        Причина: ${reason}
        Модератор: ${banned_by_name || 'Система'}

        Если вы считаете, что это ошибка, свяжитесь с администрацией.

        С уважением,
        Команда SLOBODA
      `
    });

    console.log(`[Notifications] Ban notification sent to ${user_email}`);
  } catch (error) {
    console.error(`[Notifications] Failed to send ban notification:`, error.message);
  }
}

/**
 * Send notification when a user receives a warning
 */
async function notifyUserWarned(warning) {
  const { user_email, user_name, severity, reason, issued_by_name } = warning;

  try {
    const severityText = {
      low: 'Низкая',
      medium: 'Средняя',
      high: 'Высокая'
    }[severity] || severity;

    await email.sendEmail({
      to: user_email,
      subject: 'Предупреждение на форуме SLOBODA',
      html: `
        <h2>Предупреждение</h2>
        <p>Здравствуйте, ${user_name}!</p>
        <p>Вы получили предупреждение на форуме SLOBODA.</p>
        <p><strong>Степень:</strong> ${severityText}</p>
        <p><strong>Причина:</strong> ${reason}</p>
        <p><strong>Модератор:</strong> ${issued_by_name || 'Система'}</p>
        <hr>
        <p>Пожалуйста, ознакомьтесь с правилами сообщества и следуйте им.</p>
        <p>Накопление предупреждений может привести к блокировке аккаунта.</p>
        <p>С уважением,<br>Команда SLOBODA</p>
      `,
      text: `
        Предупреждение

        Здравствуйте, ${user_name}!

        Вы получили предупреждение на форуме SLOBODA.

        Степень: ${severityText}
        Причина: ${reason}
        Модератор: ${issued_by_name || 'Система'}

        Пожалуйста, ознакомьтесь с правилами сообщества и следуйте им.
        Накопление предупреждений может привести к блокировке аккаунта.

        С уважением,
        Команда SLOBODA
      `
    });

    console.log(`[Notifications] Warning notification sent to ${user_email}`);
  } catch (error) {
    console.error(`[Notifications] Failed to send warning notification:`, error.message);
  }
}

/**
 * Send notification when user is promoted to new role
 */
async function notifyRolePromotion(promotion) {
  const { user_email, user_name, old_role, new_role, is_automatic } = promotion;

  try {
    const roleNames = {
      new_user: 'Новичок',
      member: 'Участник',
      senior_member: 'Опытный участник',
      moderator: 'Модератор',
      super_moderator: 'Супермодератор'
    };

    await email.sendEmail({
      to: user_email,
      subject: 'Повышение роли на форуме SLOBODA',
      html: `
        <h2>Поздравляем с повышением!</h2>
        <p>Здравствуйте, ${user_name}!</p>
        <p>Вы получили новую роль на форуме SLOBODA: <strong>${roleNames[new_role]}</strong>!</p>
        ${is_automatic ? '<p>Это повышение произошло автоматически благодаря вашей активности и вкладу в сообщество.</p>' : ''}
        <p>С новой ролью вы получаете дополнительные возможности:</p>
        <ul>
          ${new_role === 'member' ? '<li>Создание новых тем</li><li>Редактирование своих сообщений</li><li>Голосование за комментарии</li>' : ''}
          ${new_role === 'senior_member' ? '<li>Удаление своих сообщений</li><li>Загрузка изображений</li><li>Просмотр статистики голосов</li>' : ''}
          ${new_role === 'moderator' ? '<li>Модерация контента</li><li>Управление пользователями</li><li>Доступ к модераторским инструментам</li>' : ''}
        </ul>
        <p>Продолжайте в том же духе!</p>
        <p>С уважением,<br>Команда SLOBODA</p>
      `,
      text: `
        Поздравляем с повышением!

        Здравствуйте, ${user_name}!

        Вы получили новую роль на форуме SLOBODA: ${roleNames[new_role]}!

        ${is_automatic ? 'Это повышение произошло автоматически благодаря вашей активности и вкладу в сообщество.' : ''}

        Продолжайте в том же духе!

        С уважением,
        Команда SLOBODA
      `
    });

    console.log(`[Notifications] Role promotion notification sent to ${user_email}`);
  } catch (error) {
    console.error(`[Notifications] Failed to send promotion notification:`, error.message);
  }
}

/**
 * Send notification to moderators about reported content
 */
async function notifyModeratorsAboutReport(report) {
  const { reporter_name, content_type, content_id, reason } = report;

  try {
    // Get moderator emails
    const db = require('../db');
    const result = await db.pool.query(`
      SELECT DISTINCT u.email, u.name
      FROM users u
      INNER JOIN forum_roles fr ON u.id = fr.user_id
      WHERE fr.can_view_reports = TRUE
        AND u.environment = 'production'
    `);

    const moderators = result.rows;

    for (const mod of moderators) {
      await email.sendEmail({
        to: mod.email,
        subject: `Новая жалоба на форуме SLOBODA`,
        html: `
          <h2>Новая жалоба</h2>
          <p>Здравствуйте, ${mod.name}!</p>
          <p>Пользователь ${reporter_name} отправил жалобу на ${content_type === 'thread' ? 'тему' : 'комментарий'}.</p>
          <p><strong>Причина:</strong> ${reason}</p>
          <p><strong>ID контента:</strong> ${content_id}</p>
          <hr>
          <p>Пожалуйста, проверьте жалобу в админ-панели.</p>
          <p><a href="https://sloboda-production.up.railway.app/admin/forum/moderation">Перейти к модерации</a></p>
        `,
        text: `
          Новая жалоба

          Здравствуйте, ${mod.name}!

          Пользователь ${reporter_name} отправил жалобу на ${content_type === 'thread' ? 'тему' : 'комментарий'}.

          Причина: ${reason}
          ID контента: ${content_id}

          Пожалуйста, проверьте жалобу в админ-панели.
          Ссылка: https://sloboda-production.up.railway.app/admin/forum/moderation
        `
      });
    }

    console.log(`[Notifications] Report notifications sent to ${moderators.length} moderators`);
  } catch (error) {
    console.error(`[Notifications] Failed to send moderator notifications:`, error.message);
  }
}

module.exports = {
  notifyUserBanned,
  notifyUserWarned,
  notifyRolePromotion,
  notifyModeratorsAboutReport
};
