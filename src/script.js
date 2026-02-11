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
    initFundingThermometer();
    initExitIntent();
    initMultiStepForm();
    initDonationModal();
    initDonationForm();
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

// ===== FUNDING THERMOMETER =====
async function initFundingThermometer() {
    try {
        const response = await fetch('/api/public/funding-goal');
        if (!response.ok) {
            console.log('Funding goal API not available');
            return;
        }

        const data = await response.json();
        if (!data.success || !data.goal) {
            console.log('No active funding goal');
            return;
        }

        const goal = data.goal;
        const thermometer = document.getElementById('fundingThermometer');
        const fill = document.getElementById('thermometerFill');
        const percentage = document.getElementById('thermometerPercentage');
        const currentAmount = document.getElementById('currentAmount');
        const targetAmount = document.getElementById('targetAmount');
        const description = document.getElementById('goalDescription');
        const title = document.getElementById('funding-goal-title');

        if (!thermometer || !fill) return;

        // Update title
        if (title && goal.name) {
            title.textContent = goal.name;
        }

        // Format numbers with Russian locale
        const formatRubles = (amount) => {
            return new Intl.NumberFormat('ru-RU', {
                style: 'currency',
                currency: 'RUB',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            }).format(amount);
        };

        // Update amounts
        if (currentAmount) currentAmount.textContent = formatRubles(goal.current_amount);
        if (targetAmount) targetAmount.textContent = formatRubles(goal.target_amount);
        if (percentage) percentage.textContent = goal.percentage + '%';

        // Show thermometer
        thermometer.style.display = 'block';

        // Animate fill after a short delay
        setTimeout(() => {
            fill.style.width = goal.percentage + '%';
        }, 300);

        // Update description if exists
        if (description && goal.end_date) {
            const endDate = new Date(goal.end_date);
            description.textContent = `Цель до ${endDate.toLocaleDateString('ru-RU')}`;
        }

        trackEvent('funding_goal_viewed', { goal_id: goal.id, percentage: goal.percentage });
    } catch (error) {
        console.error('Error loading funding goal:', error);
    }
}

// ===== EXIT-INTENT POPUP =====
function initExitIntent() {
    const modal = document.getElementById('exitIntentModal');
    const overlay = document.getElementById('exitIntentOverlay');
    const closeBtn = document.getElementById('exitIntentClose');
    const form = document.getElementById('exitIntentForm');

    if (!modal) return;

    // Check if already shown or user already registered
    const exitIntentShown = sessionStorage.getItem('exitIntentShown');
    const userRegistered = localStorage.getItem('userRegistered');

    if (exitIntentShown || userRegistered) {
        return;
    }

    let lastY = 0;
    let lastTime = Date.now();
    let triggered = false;

    // Desktop: Mouse exit detection
    function handleMouseLeave(e) {
        if (triggered) return;

        const now = Date.now();
        const timeDiff = now - lastTime;
        const yDiff = lastY - e.clientY;

        // Mouse moving upward fast toward browser top
        if (e.clientY < 50 && yDiff > 50 && timeDiff < 200) {
            showExitIntent();
        }

        lastY = e.clientY;
        lastTime = now;
    }

    // Mobile: Inactivity timeout
    let inactivityTimer;
    function resetInactivityTimer() {
        clearTimeout(inactivityTimer);
        if (!triggered && window.innerWidth <= 768) {
            inactivityTimer = setTimeout(showExitIntent, 30000); // 30 seconds
        }
    }

    function showExitIntent() {
        if (triggered) return;
        triggered = true;
        modal.classList.remove('hidden');
        modal.classList.add('active');
        sessionStorage.setItem('exitIntentShown', 'true');
        trackEvent('exit_intent_shown');

        // Remove listeners
        document.removeEventListener('mousemove', handleMouseLeave);
        document.removeEventListener('touchstart', resetInactivityTimer);
        document.removeEventListener('scroll', resetInactivityTimer);
    }

    function closeExitIntent() {
        modal.classList.remove('active');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }

    // Desktop detection
    if (window.innerWidth > 768) {
        document.addEventListener('mousemove', handleMouseLeave);
    } else {
        // Mobile inactivity detection
        document.addEventListener('touchstart', resetInactivityTimer);
        document.addEventListener('scroll', resetInactivityTimer);
        resetInactivityTimer();
    }

    // Close handlers
    overlay?.addEventListener('click', closeExitIntent);
    closeBtn?.addEventListener('click', closeExitIntent);

    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeExitIntent();
        }
    });

    // Form submission
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(form);
        const data = {
            email: formData.get('email'),
            name: formData.get('name'),
            source: 'exit_intent'
        };

        try {
            const response = await fetch('/api/register', {
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

            localStorage.setItem('userRegistered', 'true');
            trackEvent('exit_intent_conversion', { email: data.email });

            // Show success
            modal.querySelector('.exit-intent-content').innerHTML = `
                <div class="success-icon">✓</div>
                <h2>Спасибо!</h2>
                <p>Гайд отправлен на ${data.email}</p>
            `;

            setTimeout(closeExitIntent, 3000);
        } catch (error) {
            console.error('Exit intent submission error:', error);
            alert('Ошибка: ' + error.message);
        }
    });
}

// ===== MULTI-STEP FORM =====
function initMultiStepForm() {
    const form = document.getElementById('joinForm');
    if (!form) return;

    let currentStep = 1;
    const totalSteps = 3;

    const steps = form.querySelectorAll('.form-step');
    const progressSteps = form.querySelectorAll('.progress-step');
    const nextButtons = form.querySelectorAll('.btn-next');
    const prevButtons = form.querySelectorAll('.btn-prev');

    // Load saved progress from localStorage
    const savedData = localStorage.getItem('formProgress');
    if (savedData) {
        try {
            const data = JSON.parse(savedData);
            Object.keys(data).forEach(key => {
                const input = form.elements[key];
                if (input) {
                    if (input.type === 'checkbox') {
                        const values = data[key];
                        form.querySelectorAll(`input[name="${key}"]`).forEach(checkbox => {
                            checkbox.checked = values.includes(checkbox.value);
                        });
                    } else {
                        input.value = data[key];
                    }
                }
            });
        } catch (e) {
            console.error('Error loading form progress:', e);
        }
    }

    function showStep(stepNumber) {
        // Hide all steps
        steps.forEach(step => step.classList.remove('active'));
        progressSteps.forEach(step => {
            step.classList.remove('active');
            if (parseInt(step.getAttribute('data-step')) < stepNumber) {
                step.classList.add('completed');
            } else {
                step.classList.remove('completed');
            }
        });

        // Show current step
        const currentStepEl = form.querySelector(`.form-step[data-step="${stepNumber}"]`);
        const currentProgressEl = form.querySelector(`.progress-step[data-step="${stepNumber}"]`);

        if (currentStepEl) {
            currentStepEl.classList.add('active');
        }
        if (currentProgressEl) {
            currentProgressEl.classList.add('active');
        }

        currentStep = stepNumber;

        // Scroll to form
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function validateStep(stepNumber) {
        const stepEl = form.querySelector(`.form-step[data-step="${stepNumber}"]`);
        if (!stepEl) return true;

        const requiredInputs = stepEl.querySelectorAll('[required]');
        for (const input of requiredInputs) {
            if (!input.value.trim()) {
                input.focus();
                alert('Пожалуйста, заполните все обязательные поля');
                return false;
            }

            // Email validation
            if (input.type === 'email' && !isValidEmail(input.value)) {
                input.focus();
                alert('Пожалуйста, введите корректный email');
                return false;
            }
        }

        // Special validation for step 2 (participation checkboxes)
        if (stepNumber === 2) {
            const checkboxes = stepEl.querySelectorAll('input[name="participation"]:checked');
            if (checkboxes.length === 0) {
                alert('Пожалуйста, выберите хотя бы один вариант участия');
                return false;
            }
        }

        return true;
    }

    function saveFormProgress() {
        const formData = new FormData(form);
        const data = {};
        for (const [key, value] of formData.entries()) {
            if (form.elements[key].type === 'checkbox') {
                data[key] = formData.getAll(key);
            } else {
                data[key] = value;
            }
        }
        localStorage.setItem('formProgress', JSON.stringify(data));
    }

    // Next button handlers
    nextButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            if (validateStep(currentStep)) {
                saveFormProgress();
                const nextStep = parseInt(btn.getAttribute('data-next'));
                showStep(nextStep);
                trackEvent('form_step_completed', { step: currentStep });
            }
        });
    });

    // Previous button handlers
    prevButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            saveFormProgress();
            const prevStep = parseInt(btn.getAttribute('data-prev'));
            showStep(prevStep);
        });
    });

    // Form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!validateStep(currentStep)) {
            return;
        }

        const formData = new FormData(form);
        const data = {
            email: formData.get('email'),
            name: formData.get('name'),
            telegram: formData.get('telegram'),
            motivation: formData.get('motivation'),
            participation: formData.getAll('participation'),
            location: formData.get('location'),
            skills: formData.get('skills'),
            budget: formData.get('budget'),
        };

        try {
            const response = await fetch('/api/register', {
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

            // Clear saved progress
            localStorage.removeItem('formProgress');
            localStorage.setItem('userRegistered', 'true');

            // Show success message
            steps.forEach(step => step.classList.remove('active'));
            const successMessage = document.getElementById('successMessage');
            if (successMessage) {
                successMessage.classList.remove('form-step-hidden');
            }

            // Refresh counters
            fetchAndUpdateCounters();

            trackEvent('registration_completed', { source: 'multi_step_form' });

            // Reset form after delay
            setTimeout(() => {
                form.reset();
                showStep(1);
                if (successMessage) {
                    successMessage.classList.add('form-step-hidden');
                }
            }, 30000);

        } catch (error) {
            console.error('Registration error:', error);
            alert('Ошибка регистрации: ' + error.message);
        }
    });

    // Auto-save on input
    form.addEventListener('input', debounce(saveFormProgress, 1000));
}

// ===== DONATION FORM WITH PRESETS =====
function initDonationForm() {
    const presetBtns = document.querySelectorAll('.preset-btn');
    const customAmountInput = document.getElementById('custom-amount');
    const donationTypeRadios = document.querySelectorAll('input[name="donation-type"]');
    const donateBtn = document.getElementById('donate-btn');

    let selectedAmount = 5000; // Default to popular option
    let donationType = 'recurring';

    // Initialize popular preset as selected
    const popularBtn = document.querySelector('.preset-btn.popular');
    if (popularBtn) {
        popularBtn.classList.add('selected');
    }

    // Preset button selection
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove selected class from all
            presetBtns.forEach(b => b.classList.remove('selected'));
            
            // Add selected class to clicked
            btn.classList.add('selected');
            
            // Get amount
            selectedAmount = parseInt(btn.getAttribute('data-amount'));
            
            // Clear custom input
            if (customAmountInput) {
                customAmountInput.value = '';
            }

            // Track event
            trackEvent('donation_preset_selected', {
                amount: selectedAmount,
                type: donationType
            });
        });
    });

    // Custom amount input
    if (customAmountInput) {
        customAmountInput.addEventListener('input', () => {
            // Remove selected from presets
            presetBtns.forEach(b => b.classList.remove('selected'));
            
            // Update selected amount
            selectedAmount = parseInt(customAmountInput.value) || 0;

            // Track event
            trackEvent('donation_custom_amount', {
                amount: selectedAmount,
                type: donationType
            });
        });
    }

    // Donation type toggle
    donationTypeRadios.forEach(radio => {
        const card = radio.closest('.radio-card');
        
        card.addEventListener('click', () => {
            // Remove active from all cards
            document.querySelectorAll('.radio-card').forEach(c => c.classList.remove('active'));
            
            // Add active to clicked card
            card.classList.add('active');
            
            // Check the radio
            radio.checked = true;
            
            // Update donation type
            donationType = radio.value;

            // Track event
            trackEvent('donation_type_selected', {
                type: donationType,
                amount: selectedAmount
            });
        });
    });

    // Donate button click
    if (donateBtn) {
        donateBtn.addEventListener('click', () => {
            if (!selectedAmount || selectedAmount < 100) {
                alert('Минимальная сумма: 100 рублей');
                return;
            }

            // Track event
            trackEvent('donation_initiated', {
                amount: selectedAmount,
                type: donationType
            });

            // For now, redirect to Telegram (will integrate with payment processor later)
            const message = `Благодарим за поддержку!\n\nСумма: ${selectedAmount}₽\nТип: ${donationType === 'recurring' ? 'Ежемесячно' : 'Один раз'}\n\nДля завершения платежа напишите нам в Telegram.`;
            
            if (confirm(message + '\n\nПерейти в Telegram?')) {
                window.open('https://t.me/sloboda_land', '_blank');
            }

            // TODO: Production implementation:
            // 1. Send donation intent to backend
            // 2. Create payment with payment processor (Stripe, YooMoney, etc.)
            // 3. Redirect to checkout
            // 4. Handle webhook callback
            // 5. Show success/failure message
        });
    }

    // Video placeholder click (show video modal)
    const videoPlaceholder = document.querySelector('.video-placeholder');
    const videoBtn = document.getElementById('videoBtn');
    
    if (videoPlaceholder && videoBtn) {
        videoPlaceholder.addEventListener('click', () => {
            videoBtn.click();
        });
    }
}

// Track donation events (extend existing trackEvent function)
// Events: donation_preset_selected, donation_custom_amount, donation_type_selected, donation_initiated

