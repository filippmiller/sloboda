// ============================================
// SLOBODA - Interactive Scripts
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initLanguageSwitcher();
    initSloganRotation();
    initFounderSlider();
    initFormNavigation();
    initScrollAnimations();
    initModalHandlers();
    initSmoothScroll();
    initSocialProof();
    initShareBar();
    initInvestmentCalculator();
});

// ============================================
// LANGUAGE SWITCHER
// ============================================
let currentLang = 'ru';

function initLanguageSwitcher() {
    const langBtns = document.querySelectorAll('.lang-btn');

    langBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const lang = btn.dataset.lang;
            if (lang === currentLang) return;

            currentLang = lang;

            // Update button states and aria-pressed
            langBtns.forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-pressed', 'false');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-pressed', 'true');

            // Update all translatable elements
            updateLanguage(lang);
        });
    });
}

function updateLanguage(lang) {
    // Update elements with data-ru and data-en attributes
    const elements = document.querySelectorAll('[data-ru][data-en]');
    elements.forEach(el => {
        const text = el.dataset[lang];
        if (text) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                // For inputs, check for placeholder attributes
                const placeholderAttr = `data-${lang}-placeholder`;
                const placeholder = el.getAttribute(placeholderAttr);
                if (placeholder) {
                    el.placeholder = placeholder;
                }
            } else {
                el.textContent = text;
            }
        }
    });

    // Update placeholders specifically
    const placeholderElements = document.querySelectorAll('[data-ru-placeholder][data-en-placeholder]');
    placeholderElements.forEach(el => {
        const placeholder = el.getAttribute(`data-${lang}-placeholder`);
        if (placeholder) {
            el.placeholder = placeholder;
        }
    });

    // Update HTML lang attribute
    document.documentElement.lang = lang;
}

// ============================================
// SLOGAN ROTATION
// ============================================
function initSloganRotation() {
    const slogans = document.querySelectorAll('.slogan');
    if (slogans.length === 0) return;

    let currentIndex = 0;
    const rotationInterval = 5000; // 5 seconds

    function showNextSlogan() {
        // Hide current
        slogans[currentIndex].classList.remove('active');

        // Move to next
        currentIndex = (currentIndex + 1) % slogans.length;

        // Show next
        slogans[currentIndex].classList.add('active');
    }

    // Start rotation
    setInterval(showNextSlogan, rotationInterval);
}

// ============================================
// FOUNDER SLIDER
// ============================================
function initFounderSlider() {
    const slides = document.querySelectorAll('.founder-slide');
    const dots = document.querySelectorAll('.founder-dot');
    if (slides.length === 0) return;

    let currentSlide = 0;
    const autoRotateInterval = 7000; // 7 seconds
    let autoRotateTimer;

    function showSlide(index) {
        // Hide all slides
        slides.forEach(slide => slide.classList.remove('active'));
        dots.forEach(dot => dot.classList.remove('active'));

        // Show target slide
        currentSlide = index;
        slides[currentSlide].classList.add('active');
        dots[currentSlide].classList.add('active');
    }

    function nextSlide() {
        showSlide((currentSlide + 1) % slides.length);
    }

    function startAutoRotate() {
        autoRotateTimer = setInterval(nextSlide, autoRotateInterval);
    }

    function resetAutoRotate() {
        clearInterval(autoRotateTimer);
        startAutoRotate();
    }

    // Dot click handlers
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            showSlide(index);
            resetAutoRotate();
        });
    });

    // Start auto rotation
    startAutoRotate();
}

// ============================================
// FORM NAVIGATION
// ============================================
function initFormNavigation() {
    const form = document.getElementById('registerForm');
    if (!form) return;

    const steps = form.querySelectorAll('.form-step');
    const progressFill = form.querySelector('.progress-fill');
    const currentStepSpan = form.querySelector('.current-step');
    const totalSteps = 6;

    let currentStep = 1;
    let isInvestor = false;

    // Next buttons
    form.querySelectorAll('.form-next').forEach(btn => {
        btn.addEventListener('click', () => {
            // Validate current step
            const currentStepEl = form.querySelector(`.form-step[data-step="${currentStep}"]`);
            const requiredInputs = currentStepEl.querySelectorAll('input[required]');
            let isValid = true;

            requiredInputs.forEach(input => {
                if (!input.value.trim()) {
                    isValid = false;
                    input.style.borderColor = '#ff6b6b';
                } else {
                    input.style.borderColor = '';
                }
            });

            if (!isValid) return;

            // Check if investor step should be shown
            if (currentStep === 3) {
                const participation = form.querySelector('input[name="participation"]:checked');
                isInvestor = participation &&
                    (participation.value === 'investor' || participation.value === 'both');
            }

            // Move to next step
            let nextStep = currentStep + 1;

            // Skip investor step if not an investor
            if (nextStep === 5 && !isInvestor) {
                nextStep = 6;
            }

            goToStep(nextStep);
        });
    });

    // Previous buttons
    form.querySelectorAll('.form-prev').forEach(btn => {
        btn.addEventListener('click', () => {
            let prevStep = currentStep - 1;

            // Skip investor step if not an investor
            if (prevStep === 5 && !isInvestor) {
                prevStep = 4;
            }

            goToStep(prevStep);
        });
    });

    // Submit handler
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = form.querySelector('.form-submit');
        const originalText = submitBtn.textContent;

        // Disable button and show loading
        submitBtn.disabled = true;
        submitBtn.textContent = currentLang === 'ru' ? 'Отправка...' : 'Submitting...';

        // Collect form data
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Collect checkboxes (skills)
        const skills = [];
        form.querySelectorAll('input[name="skills"]:checked').forEach(cb => {
            skills.push(cb.value);
        });
        data.skills = skills;

        // Convert checkbox values to booleans
        data.newsletter = data.newsletter === 'on';

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.success) {
                // Show success modal
                document.getElementById('successModal').classList.add('active');

                // Reset form
                form.reset();
                goToStep(1);
            } else {
                alert(currentLang === 'ru'
                    ? 'Ошибка при отправке: ' + (result.error || 'Попробуйте позже')
                    : 'Submission error: ' + (result.error || 'Please try again'));
            }
        } catch (err) {
            console.error('Form submission error:', err);
            alert(currentLang === 'ru'
                ? 'Ошибка соединения. Попробуйте позже.'
                : 'Connection error. Please try again.');
        } finally {
            // Re-enable button
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });

    function goToStep(step) {
        // Hide all steps
        steps.forEach(s => s.classList.remove('active'));

        // Show target step
        const targetStep = form.querySelector(`.form-step[data-step="${step}"]`);
        if (targetStep) {
            targetStep.classList.add('active');
            currentStep = step;

            // Update progress
            const effectiveStep = isInvestor ? step : (step > 4 ? step - 1 : step);
            const effectiveTotal = isInvestor ? totalSteps : totalSteps - 1;
            const progress = (effectiveStep / effectiveTotal) * 100;

            progressFill.style.width = `${progress}%`;
            currentStepSpan.textContent = effectiveStep;

            // Scroll to top of form
            form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
}

// ============================================
// SCROLL ANIMATIONS
// ============================================
function initScrollAnimations() {
    const animatedElements = document.querySelectorAll(
        '.thesis-card, .value-card, .looking-item, .vision-feature, .comparison-card, .tier-card, .roadmap-step, .legal-card'
    );

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        },
        {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        }
    );

    animatedElements.forEach(el => observer.observe(el));
}

// ============================================
// MODAL HANDLERS
// ============================================
function initModalHandlers() {
    const modal = document.getElementById('successModal');
    if (!modal) return;

    const closeBtn = modal.querySelector('.modal-close');

    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            modal.classList.remove('active');
        }
    });
}

// ============================================
// SMOOTH SCROLL FOR CTA BUTTONS
// ============================================
function initSmoothScroll() {
    const ctaButtons = document.querySelectorAll('.cta-primary, .cta-secondary');

    ctaButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const registerSection = document.getElementById('register');
            if (registerSection) {
                registerSection.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
}

// ============================================
// PARALLAX EFFECT FOR HERO (optional enhancement)
// ============================================
function initParallax() {
    const hero = document.querySelector('.hero-bg');
    if (!hero) return;

    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        const rate = scrolled * 0.3;
        hero.style.transform = `translateY(${rate}px)`;
    });
}

// Uncomment to enable parallax
// initParallax();

// ============================================
// SOCIAL PROOF COUNTER
// ============================================
async function initSocialProof() {
    const proofContainer = document.getElementById('socialProof');
    const proofCount = document.getElementById('proofCount');

    if (!proofContainer || !proofCount) return;

    try {
        const response = await fetch('/api/stats');
        const data = await response.json();

        if (data.success && data.displayCount) {
            // Animate the counter
            animateCounter(proofCount, data.displayCount);
            proofContainer.style.display = 'flex';
        }
    } catch (err) {
        console.log('Could not load registration stats');
    }
}

function animateCounter(element, target) {
    const duration = 1500;
    const start = 0;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease out cubic
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = Math.floor(start + (target - start) * easeOut);

        element.textContent = current;

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.textContent = target;
        }
    }

    requestAnimationFrame(update);
}

// ============================================
// SOCIAL SHARE BAR
// ============================================
function initShareBar() {
    const shareBar = document.getElementById('shareBar');
    if (!shareBar) return;

    const pageUrl = encodeURIComponent(window.location.origin);
    const textRu = encodeURIComponent('SLOBODA — План Б, который существует. Сообщество для тех, кто думает на шаг вперёд.');
    const textEn = encodeURIComponent('SLOBODA — Plan B that exists. A community for those who think one step ahead.');

    const tgBtn = shareBar.querySelector('.share-telegram');
    const waBtn = shareBar.querySelector('.share-whatsapp');
    const vkBtn = shareBar.querySelector('.share-vk');

    function updateShareLinks() {
        const text = currentLang === 'ru' ? textRu : textEn;
        tgBtn.href = `https://t.me/share/url?url=${pageUrl}&text=${text}`;
        waBtn.href = `https://api.whatsapp.com/send?text=${text}%20${pageUrl}`;
        vkBtn.href = `https://vk.com/share.php?url=${pageUrl}`;
    }

    updateShareLinks();

    // Show after scrolling past hero
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                shareBar.classList.toggle('visible', !entry.isIntersecting);
            });
        },
        { threshold: 0.3 }
    );

    const hero = document.querySelector('.hero');
    if (hero) observer.observe(hero);

    // Update links when language changes
    const origUpdateLang = window.updateLanguage;
    if (typeof updateLanguage === 'function') {
        const origFn = updateLanguage;
        window.updateLanguage = function(lang) {
            origFn(lang);
            updateShareLinks();
        };
        // Re-bind the language switcher to use the wrapped function
    }
}

// ============================================
// INVESTMENT CALCULATOR
// ============================================
function initInvestmentCalculator() {
    const slider = document.getElementById('calcSlider');
    if (!slider) return;

    const amountEl = document.getElementById('calcAmount');
    const tierNameEl = document.getElementById('calcTierName');
    const landEl = document.getElementById('calcLand');
    const housingEl = document.getElementById('calcHousing');
    const rentalEl = document.getElementById('calcRental');
    const farmEl = document.getElementById('calcFarm');
    const savingsEl = document.getElementById('calcSavings');

    function formatUSD(val) {
        return '$' + val.toLocaleString('en-US');
    }

    function updateCalculator() {
        const amount = parseInt(slider.value);
        amountEl.textContent = formatUSD(amount);

        const isRu = currentLang === 'ru';

        // Determine tier
        let tierRu, tierEn, land, housingRu, housingEn, rental, farm;

        if (amount < 10000) {
            tierRu = 'Наблюдатель';
            tierEn = 'Observer';
            land = 0;
            housingRu = '—';
            housingEn = '—';
            rental = 0;
            farm = 0;
        } else if (amount < 30000) {
            tierRu = 'Пионер';
            tierEn = 'Pioneer';
            land = Math.round(8 + (amount - 10000) / 20000 * 4);
            housingRu = 'Бронь участка';
            housingEn = 'Plot reserved';
            rental = 0;
            farm = Math.round(300 + (amount - 10000) / 20000 * 400);
        } else if (amount < 50000) {
            tierRu = 'Строитель';
            tierEn = 'Builder';
            land = Math.round(12 + (amount - 30000) / 20000 * 3);
            housingRu = 'Доля дома';
            housingEn = 'House share';
            rental = Math.round(100 + (amount - 30000) / 20000 * 200);
            farm = Math.round(700 + (amount - 30000) / 20000 * 300);
        } else {
            tierRu = 'Основатель';
            tierEn = 'Founder';
            land = Math.round(15 + Math.min((amount - 50000) / 50000 * 5, 5));
            housingRu = 'Полный дом';
            housingEn = 'Full house';
            rental = Math.round(300 + Math.min((amount - 50000) / 50000 * 300, 300));
            farm = Math.round(1000 + Math.min((amount - 50000) / 50000 * 500, 500));
        }

        tierNameEl.textContent = isRu ? tierRu : tierEn;
        tierNameEl.setAttribute('data-ru', tierRu);
        tierNameEl.setAttribute('data-en', tierEn);

        if (land > 0) {
            landEl.innerHTML = land + ' <small>' + (isRu ? 'соток' : 'sotkas') + '</small>';
        } else {
            landEl.textContent = '—';
        }

        housingEl.textContent = isRu ? housingRu : housingEn;
        housingEl.setAttribute('data-ru', housingRu);
        housingEl.setAttribute('data-en', housingEn);

        rentalEl.textContent = rental > 0 ? '~' + formatUSD(rental) + (isRu ? '/мес' : '/mo') : '—';
        farmEl.textContent = farm > 0 ? '~' + formatUSD(farm) + (isRu ? '/год' : '/yr') : '—';

        // Annual savings vs city (fixed 136k RUB/month = 1.632M/year)
        savingsEl.innerHTML = '1.6 <small>' + (isRu ? 'млн ₽' : 'M ₽') + '</small>';
    }

    slider.addEventListener('input', updateCalculator);
    updateCalculator();
}
