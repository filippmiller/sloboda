// ============================================
// SLOBODA - Interactive Scripts
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initLanguageSwitcher();
    initSloganRotation();
    initFormNavigation();
    initScrollAnimations();
    initModalHandlers();
    initSmoothScroll();
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

            // Update button states
            langBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

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
    form.addEventListener('submit', (e) => {
        e.preventDefault();

        // Collect form data
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Collect checkboxes (skills)
        const skills = [];
        form.querySelectorAll('input[name="skills"]:checked').forEach(cb => {
            skills.push(cb.value);
        });
        data.skills = skills;

        console.log('Form submitted:', data);

        // Show success modal
        document.getElementById('successModal').classList.add('active');

        // Reset form
        form.reset();
        goToStep(1);
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
        '.thesis-card, .value-card, .looking-item'
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
