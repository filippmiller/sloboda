/**
 * SLOBODA V2 - Enhanced Landing Page Interactions
 * Social Psychology Optimized
 */

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    loadDynamicContent();
    initBookmarkBanner();
    initMobileMenu();
    initVideoModal();
    initSocialProof();
    initProgressiveForm();
    initDonationModal();
    initFloatingCTA();
    initScrollBehavior();
});

// ===== DYNAMIC CONTENT LOADING =====
async function loadDynamicContent() {
    try {
        const response = await fetch('/api/public/landing-content');
        if (!response.ok) {
            console.error('Failed to load landing content');
            return; // Fall back to hardcoded content
        }

        const sections = await response.json();
        const contentMap = sections.reduce((acc, section) => {
            acc[section.section] = section.content;
            return acc;
        }, {});

        // Render each section
        if (contentMap.bookmark_banner) renderBookmarkBanner(contentMap.bookmark_banner);
        if (contentMap.hero) renderHero(contentMap.hero);
        if (contentMap.reality_cards) renderRealityCards(contentMap.reality_cards);
        if (contentMap.testimonials) renderTestimonials(contentMap.testimonials);
        if (contentMap.features) renderFeatures(contentMap.features);
        if (contentMap.donation_amounts) renderDonationAmounts(contentMap.donation_amounts);
    } catch (error) {
        console.error('Error loading dynamic content:', error);
        // Fall back to hardcoded content
    }
}

function renderBookmarkBanner(content) {
    const bannerText = document.querySelector('.bookmark-text');
    if (bannerText) {
        bannerText.innerHTML = `<strong>${content.title}</strong> ${content.subtitle}`;
    }
}

function renderHero(content) {
    const badge = document.querySelector('.hero-badge');
    const title = document.querySelector('.hero-title');
    const text = document.querySelector('.hero-text');
    const answer = document.querySelector('.hero-answer');

    if (badge) badge.textContent = content.badge;
    if (title) title.innerHTML = content.title;
    if (text) text.innerHTML = content.body;
    if (answer) answer.innerHTML = content.cta;
}

function renderRealityCards(cards) {
    const grid = document.querySelector('.reality-grid');
    if (!grid || !Array.isArray(cards)) return;

    grid.innerHTML = cards.map((card, index) => {
        const typeClass = index === 0 ? 'reality-card-urgent' : index === 1 ? 'reality-card-consequence' : 'reality-card-action';
        return `
            <div class="reality-card ${typeClass}">
                <h3>${card.title}</h3>
                ${card.question ? `<p class="reality-question"><strong>${card.question}</strong></p>` : ''}
                ${card.answer ? `<p class="reality-answer"><em>${card.answer}</em></p>` : ''}
                ${card.warning ? `<p class="reality-warning"><strong>${card.warning}</strong></p>` : ''}
                ${card.content ? `<p>${card.content}</p>` : ''}
                ${card.cta ? `<div class="reality-cta"><a href="#join" class="cta-btn cta-btn-primary">${card.cta}</a></div>` : ''}
            </div>
        `;
    }).join('');
}

function renderTestimonials(testimonials) {
    const container = document.querySelector('.testimonials-grid');
    if (!container || !Array.isArray(testimonials)) return;

    container.innerHTML = testimonials.map(t => `
        <div class="testimonial-card">
            <div class="testimonial-header">
                <img src="${t.avatar}" alt="${t.name}" class="testimonial-avatar">
                <div class="testimonial-meta">
                    <h4>${t.name}</h4>
                    <p>${t.location} • ${t.role}</p>
                </div>
            </div>
            <blockquote>${t.quote}</blockquote>
            <div class="testimonial-date">${t.date}</div>
        </div>
    `).join('');
}

function renderFeatures(features) {
    const container = document.querySelector('.value-props');
    if (!container || !Array.isArray(features)) return;

    container.innerHTML = features.map(f => `
        <div class="value-prop">
            <div class="value-icon">${f.icon}</div>
            <h3>${f.title}</h3>
            <p>${f.description}</p>
        </div>
    `).join('');
}

function renderDonationAmounts(amounts) {
    // Store for use in donation modal
    window.donationAmounts = amounts;
}

// ===== BOOKMARK BANNER =====
function initBookmarkBanner() {
    const banner = document.getElementById('bookmarkBanner');
    const closeBtn = document.getElementById('bookmarkClose');

    if (!banner || !closeBtn) return;

    // Check if banner was already closed
    const bannerClosed = localStorage.getItem('bookmarkBannerClosed');
    if (bannerClosed) {
        banner.classList.add('hidden');
        return;
    }

    // Close banner and remember
    closeBtn.addEventListener('click', () => {
        banner.classList.add('hidden');
        localStorage.setItem('bookmarkBannerClosed', 'true');

        // Adjust header position
        const header = document.querySelector('.header');
        if (header) {
            header.style.top = '0';
        }
    });
}

// ===== MOBILE MENU =====
function initMobileMenu() {
    const toggle = document.getElementById('menuToggle');
    const menu = document.getElementById('mobileMenu');

    if (!toggle || !menu) return;

    toggle.addEventListener('click', () => {
        menu.classList.toggle('active');

        // Animate hamburger icon
        toggle.classList.toggle('active');
    });

    // Close menu when clicking a link
    menu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            menu.classList.remove('active');
            toggle.classList.remove('active');
        });
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!toggle.contains(e.target) && !menu.contains(e.target)) {
            menu.classList.remove('active');
            toggle.classList.remove('active');
        }
    });
}

// ===== VIDEO MODAL =====
function initVideoModal() {
    const videoBtn = document.getElementById('videoBtn');
    const modal = document.getElementById('videoModal');
    const modalOverlay = document.getElementById('modalOverlay');
    const modalClose = document.getElementById('modalClose');

    if (!videoBtn || !modal) return;

    const openModal = () => {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    const closeModal = () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    };

    videoBtn.addEventListener('click', openModal);
    modalOverlay?.addEventListener('click', closeModal);
    modalClose?.addEventListener('click', closeModal);

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    });
}

// ===== SOCIAL PROOF COUNTERS & ACTIVITY =====
function initSocialProof() {
    fetchAndUpdateCounters();
    startActivityFeed();

    // Refresh counters every 30 seconds
    setInterval(fetchAndUpdateCounters, 30000);
}

async function fetchAndUpdateCounters() {
    try {
        const response = await fetch('/api/public/stats');
        if (!response.ok) throw new Error('Failed to fetch stats');

        const data = await response.json();

        // Update member count
        const memberCountEl = document.getElementById('memberCount');
        if (memberCountEl && data.memberCount) {
            animateNumber(memberCountEl, parseInt(memberCountEl.textContent), data.memberCount, 1000);
        }

        // Update donation amount
        const donationAmountEl = document.getElementById('donationAmount');
        if (donationAmountEl && data.donationTotal) {
            const formattedAmount = '₽' + (Math.round(data.donationTotal / 1000)) + 'K';
            donationAmountEl.textContent = formattedAmount;
        }

        // Update progress bar
        const progressFillEl = document.querySelector('.progress-fill');
        const progressPercentEl = document.getElementById('progressPercent');
        if (progressFillEl && data.progressPercent) {
            progressFillEl.style.width = data.progressPercent + '%';
            if (progressPercentEl) {
                progressPercentEl.textContent = data.progressPercent + '%';
            }
        }
    } catch (error) {
        console.log('Stats API not available, using static values');
        // Fail silently - page still works with static values
    }
}

function animateNumber(element, start, end, duration) {
    const startTime = performance.now();
    const difference = end - start;

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Easing function (ease-out)
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = Math.floor(start + difference * easeOut);

        element.textContent = current;

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.textContent = end;
        }
    }

    requestAnimationFrame(update);
}

function startActivityFeed() {
    const activityEl = document.getElementById('recentActivity');
    if (!activityEl) return;

    const activities = [
        { name: 'Дмитрий', city: 'Москвы', time: 12 },
        { name: 'Анастасия', city: 'Санкт-Петербурга', time: 34 },
        { name: 'Иван', city: 'Екатеринбурга', time: 56 },
        { name: 'Ольга', city: 'Новосибирска', time: 78 },
        { name: 'Сергей', city: 'Казани', time: 91 },
        { name: 'Мария', city: 'Москвы', time: 105 },
    ];

    let currentIndex = 0;

    function updateActivity() {
        const activity = activities[currentIndex];
        activityEl.innerHTML = `
            <span class="pulse-dot"></span>
            ${activity.name} из ${activity.city} присоединился ${activity.time} минут назад
        `;

        currentIndex = (currentIndex + 1) % activities.length;
    }

    // Update activity every 8 seconds
    setInterval(updateActivity, 8000);
}

// ===== PROGRESSIVE FORM =====
function initProgressiveForm() {
    const form = document.getElementById('joinForm');
    if (!form) return;

    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const successMessage = document.getElementById('successMessage');
    const continueBtn = document.getElementById('continueBtn');
    const backBtn = document.getElementById('backBtn');

    // Step 1 → Step 2
    continueBtn?.addEventListener('click', () => {
        const email = document.getElementById('email');
        const name = document.getElementById('name');

        if (!email?.value || !name?.value) {
            alert('Пожалуйста, заполните email и имя');
            return;
        }

        if (!isValidEmail(email.value)) {
            alert('Пожалуйста, введите корректный email');
            return;
        }

        // Show step 2
        step1?.classList.add('form-step-hidden');
        step2?.classList.remove('form-step-hidden');

        // Scroll to form top
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Step 2 → Step 1 (back)
    backBtn?.addEventListener('click', () => {
        step2?.classList.add('form-step-hidden');
        step1?.classList.remove('form-step-hidden');

        // Scroll to form top
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(form);
        const data = {
            email: formData.get('email'),
            name: formData.get('name'),
            city: formData.get('city'),
            telegram: formData.get('telegram'),
            skills: formData.getAll('skills'),
            support: formData.get('support'),
        };

        try {
            const response = await fetch('/api/registrations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Ошибка регистрации');
            }

            // Show success message
            step2?.classList.add('form-step-hidden');
            successMessage?.classList.remove('form-step-hidden');

            // Refresh counters
            fetchAndUpdateCounters();

            // Reset form (for next use)
            setTimeout(() => {
                form.reset();
                successMessage?.classList.add('form-step-hidden');
                step1?.classList.remove('form-step-hidden');
            }, 30000); // Reset after 30 seconds

        } catch (error) {
            console.error('Registration error:', error);
            alert('Ошибка регистрации: ' + error.message);
        }
    });
}

function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// ===== DONATION MODAL =====
function initDonationModal() {
    const modal = document.getElementById('donationModal');
    const modalOverlay = document.getElementById('donationModalOverlay');
    const modalClose = document.getElementById('donationModalClose');
    const donationButtons = document.querySelectorAll('.donation-btn');
    const customDonationBtn = document.getElementById('customDonationBtn');
    const donationAmountInput = document.getElementById('donationAmount');
    const donationSubmitBtn = document.getElementById('donationSubmitBtn');

    if (!modal) return;

    const openModal = (amount = '') => {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (amount && donationAmountInput) {
            donationAmountInput.value = amount;
        }
    };

    const closeModal = () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    };

    // Open modal with preset amount
    donationButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const amount = btn.getAttribute('data-amount');
            openModal(amount);
        });
    });

    // Open modal with custom amount
    customDonationBtn?.addEventListener('click', () => {
        openModal();
    });

    modalOverlay?.addEventListener('click', closeModal);
    modalClose?.addEventListener('click', closeModal);

    // Submit donation
    donationSubmitBtn?.addEventListener('click', async () => {
        const amount = donationAmountInput?.value;
        const email = document.getElementById('donationEmail')?.value;
        const recurring = document.getElementById('donationRecurring')?.checked;

        if (!amount || amount < 100) {
            alert('Минимальная сумма: 100 рублей');
            return;
        }

        if (!email || !isValidEmail(email)) {
            alert('Пожалуйста, введите корректный email');
            return;
        }

        try {
            // TODO: Integrate with actual payment processor (Yandex.Pay, Tinkoff Pay, etc.)
            // For now, redirect to Telegram
            const message = `Спасибо! Для завершения платежа напишите нам в Telegram:\n\nСумма: ₽${amount}\nEmail: ${email}\nРегулярный платёж: ${recurring ? 'Да' : 'Нет'}`;
            alert(message);
            window.open('https://t.me/sloboda_land', '_blank');
            closeModal();

            // In production, you would:
            // 1. Create payment intent on backend
            // 2. Redirect to payment processor
            // 3. Handle callback and update UI

        } catch (error) {
            console.error('Donation error:', error);
            alert('Ошибка: ' + error.message);
        }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    });
}

// ===== FLOATING CTA =====
function initFloatingCTA() {
    const floatingCTA = document.getElementById('floatingCta');
    if (!floatingCTA) return;

    let lastScrollY = window.scrollY;
    let ticking = false;

    function updateFloatingCTA() {
        const scrollY = window.scrollY;
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;

        // Show CTA after scrolling past hero (approximately)
        if (scrollY > windowHeight * 0.8 && scrollY < documentHeight - windowHeight * 1.5) {
            floatingCTA.classList.add('visible');
        } else {
            floatingCTA.classList.remove('visible');
        }

        lastScrollY = scrollY;
        ticking = false;
    }

    function requestTick() {
        if (!ticking) {
            requestAnimationFrame(updateFloatingCTA);
            ticking = true;
        }
    }

    window.addEventListener('scroll', requestTick, { passive: true });
}

// ===== SCROLL BEHAVIOR =====
function initScrollBehavior() {
    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href === '#') return;

            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });

                // Update URL without jumping
                history.pushState(null, '', href);
            }
        });
    });

    // Add scroll-margin to sections for better anchor positioning
    document.querySelectorAll('section[id]').forEach(section => {
        section.style.scrollMarginTop = '100px';
    });
}

// ===== UTILITY FUNCTIONS =====
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// ===== ANALYTICS (Optional) =====
function trackEvent(eventName, eventData = {}) {
    // Integrate with your analytics provider (Google Analytics, Mixpanel, etc.)
    if (typeof gtag !== 'undefined') {
        gtag('event', eventName, eventData);
    }
    console.log('Event tracked:', eventName, eventData);
}

// Track CTA clicks
document.querySelectorAll('.cta-btn-primary').forEach(btn => {
    btn.addEventListener('click', () => {
        trackEvent('cta_click', {
            button_text: btn.textContent.trim(),
            button_location: btn.closest('section')?.id || 'unknown'
        });
    });
});

// Track form starts
document.getElementById('email')?.addEventListener('focus', () => {
    trackEvent('form_start', { form_name: 'registration' });
}, { once: true });

// Track video plays
document.getElementById('videoBtn')?.addEventListener('click', () => {
    trackEvent('video_play', { video_name: 'overview' });
});
