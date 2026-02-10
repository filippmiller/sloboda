// Landing page i18n - lightweight translation for static elements
(function () {
  const TRANSLATIONS = {
    ru: {
      'nav.why': 'Почему',
      'nav.how': 'Как это работает',
      'nav.about': 'О нас',
      'nav.faq': 'Вопросы',
      'nav.join': 'Присоединиться',
      'logo': 'СЛОБОДА',
    },
    en: {
      'nav.why': 'Why',
      'nav.how': 'How It Works',
      'nav.about': 'About Us',
      'nav.faq': 'FAQ',
      'nav.join': 'Join Us',
      'logo': 'SLOBODA',
    },
    es: {
      'nav.why': 'Por qué',
      'nav.how': 'Cómo funciona',
      'nav.about': 'Sobre nosotros',
      'nav.faq': 'Preguntas',
      'nav.join': 'Unirse',
      'logo': 'SLOBODA',
    },
    de: {
      'nav.why': 'Warum',
      'nav.how': 'Wie es funktioniert',
      'nav.about': 'Über uns',
      'nav.faq': 'FAQ',
      'nav.join': 'Beitreten',
      'logo': 'SLOBODA',
    },
    fr: {
      'nav.why': 'Pourquoi',
      'nav.how': 'Comment ça marche',
      'nav.about': 'À propos',
      'nav.faq': 'Questions',
      'nav.join': 'Rejoindre',
      'logo': 'SLOBODA',
    },
  };

  const SUPPORTED = ['ru', 'en', 'es', 'de', 'fr'];
  const FLAGS = { ru: '🇷🇺', en: '🇬🇧', es: '🇪🇸', de: '🇩🇪', fr: '🇫🇷' };
  const LABELS = { ru: 'RU', en: 'EN', es: 'ES', de: 'DE', fr: 'FR' };

  function getStoredLang() {
    try {
      return localStorage.getItem('sloboda_language') || null;
    } catch { return null; }
  }

  function detectLang() {
    const stored = getStoredLang();
    if (stored && SUPPORTED.includes(stored)) return stored;
    const nav = (navigator.language || '').split('-')[0];
    return SUPPORTED.includes(nav) ? nav : 'ru';
  }

  function setLang(lang) {
    if (!SUPPORTED.includes(lang)) return;
    try { localStorage.setItem('sloboda_language', lang); } catch {}
    document.documentElement.lang = lang;
    applyTranslations(lang);
    updateSwitcher(lang);
  }

  function applyTranslations(lang) {
    const t = TRANSLATIONS[lang] || TRANSLATIONS.ru;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      const key = el.getAttribute('data-i18n');
      if (t[key]) el.textContent = t[key];
    });
  }

  function updateSwitcher(lang) {
    var btn = document.getElementById('langSwitcherBtn');
    if (btn) btn.textContent = FLAGS[lang] + ' ' + LABELS[lang];
    document.querySelectorAll('.lang-option').forEach(function (el) {
      el.classList.toggle('active', el.dataset.lang === lang);
    });
  }

  function createSwitcher() {
    var wrapper = document.createElement('div');
    wrapper.className = 'lang-switcher';
    wrapper.innerHTML =
      '<button class="lang-switcher-btn" id="langSwitcherBtn" aria-label="Change language"></button>' +
      '<div class="lang-dropdown" id="langDropdown">' +
      SUPPORTED.map(function (l) {
        return '<button class="lang-option" data-lang="' + l + '">' + FLAGS[l] + ' ' + LABELS[l] + '</button>';
      }).join('') +
      '</div>';

    var headerInner = document.querySelector('.header-inner');
    if (headerInner) {
      var ctaBtn = headerInner.querySelector('.cta-btn-header');
      if (ctaBtn) headerInner.insertBefore(wrapper, ctaBtn);
      else headerInner.appendChild(wrapper);
    }

    var btn = wrapper.querySelector('#langSwitcherBtn');
    var dropdown = wrapper.querySelector('#langDropdown');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
    dropdown.querySelectorAll('.lang-option').forEach(function (opt) {
      opt.addEventListener('click', function () {
        setLang(opt.dataset.lang);
        dropdown.classList.remove('open');
      });
    });
    document.addEventListener('click', function () {
      dropdown.classList.remove('open');
    });
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', function () {
    createSwitcher();
    var lang = detectLang();
    setLang(lang);
  });
})();
