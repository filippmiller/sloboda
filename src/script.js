// ============================================
// SLOBODA — Landing Page Logic
// ============================================

document.addEventListener('DOMContentLoaded', () => {

    // ----------------------------------------
    // 1. Social Proof Counter
    // ----------------------------------------
    const counterEl = document.getElementById('socialCounter');
    if (counterEl) {
        fetch('/api/stats')
            .then(res => res.json())
            .then(data => {
                if (data.count && data.count >= 10) {
                    counterEl.textContent = `Уже с нами: ${data.count} человек`;
                    counterEl.classList.add('visible');
                }
            })
            .catch(() => {}); // Silent fail — counter is non-critical
    }

    // ----------------------------------------
    // 2. Sticky Header on Scroll
    // ----------------------------------------
    const stickyHeader = document.getElementById('stickyHeader');
    const hero = document.querySelector('.hero');

    if (stickyHeader && hero) {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    stickyHeader.classList.remove('visible');
                } else {
                    stickyHeader.classList.add('visible');
                }
            },
            { threshold: 0 }
        );
        observer.observe(hero);
    }

    // ----------------------------------------
    // 3. Progressive Form Disclosure
    // ----------------------------------------
    const expandBtn = document.getElementById('expandForm');
    const formStep2 = document.getElementById('formStep2');
    const nameInput = document.getElementById('f-name');
    const emailInput = document.getElementById('f-email');

    if (expandBtn && formStep2) {
        expandBtn.addEventListener('click', () => {
            const name = nameInput ? nameInput.value.trim() : '';
            const email = emailInput ? emailInput.value.trim() : '';

            if (!name) {
                nameInput.focus();
                return;
            }
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                emailInput.focus();
                return;
            }

            formStep2.classList.add('visible');
            expandBtn.classList.add('hidden');

            // Focus first field in step 2
            const telegramInput = document.getElementById('f-telegram');
            if (telegramInput) {
                setTimeout(() => telegramInput.focus(), 100);
            }
        });
    }

    // ----------------------------------------
    // 4. Form Submission
    // ----------------------------------------
    const form = document.getElementById('signupForm');
    const submitBtn = document.getElementById('submitBtn');
    const statusEl = document.getElementById('formStatus');

    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        submitBtn.disabled = true;
        submitBtn.textContent = 'Отправка...';
        statusEl.textContent = '';
        statusEl.className = 'form-status';

        const formData = new FormData(form);

        // Collect skills checkboxes
        const skills = formData.getAll('skills');

        // Map donate radio to participation field
        const donateValue = formData.get('donate');
        const participationMap = {
            'yes': 'donor',
            'no': 'community',
            'later': 'observer'
        };

        const payload = {
            name: formData.get('name'),
            email: formData.get('email'),
            telegram: formData.get('telegram') || '',
            location: formData.get('city') || '',
            skills: skills,
            about: formData.get('about') || '',
            participation: participationMap[donateValue] || 'observer',
            newsletter: true,
            privacy: true
        };

        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (data.success) {
                statusEl.textContent = 'Заявка отправлена. Мы свяжемся с вами.';
                statusEl.className = 'form-status success';
                form.reset();
                // Reset form to step 1
                if (formStep2) {
                    formStep2.classList.remove('visible');
                    if (expandBtn) expandBtn.classList.remove('hidden');
                }
            } else {
                statusEl.textContent = data.error || 'Ошибка при отправке. Попробуйте позже.';
                statusEl.className = 'form-status error';
            }
        } catch (err) {
            statusEl.textContent = 'Ошибка сети. Проверьте подключение и попробуйте снова.';
            statusEl.className = 'form-status error';
        }

        submitBtn.disabled = false;
        submitBtn.textContent = 'Отправить';
    });
});
