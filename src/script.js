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
    // 1.5. Live Finance Counter
    // ----------------------------------------
    const liveFinanceEl = document.getElementById('liveFinance');
    if (liveFinanceEl) {
        fetch('/api/public/finance/summary')
            .then(res => res.json())
            .then(data => {
                if (!data.success) return;
                const d = data.data;
                const totalRaisedEl = document.getElementById('totalRaised');
                const totalSpentEl = document.getElementById('totalSpent');
                const balanceEl = document.getElementById('currentBalance');

                function fmtRub(n) {
                    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';
                }

                if (totalRaisedEl) totalRaisedEl.textContent = fmtRub(d.totalIncome || 0);
                if (totalSpentEl) totalSpentEl.textContent = fmtRub(d.totalExpenses || 0);
                if (balanceEl) balanceEl.textContent = fmtRub(d.balance || 0);
            })
            .catch(() => {}); // Silent fail
    }

    // ----------------------------------------
    // 2. Sticky Header + Navigation
    // ----------------------------------------
    const stickyHeader = document.getElementById('stickyHeader');
    const stickyMenu = document.getElementById('stickyMenu');
    const backToTopBtn = document.getElementById('backToTop');
    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (backToTopBtn) {
        backToTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
        });
    }

    // Close mobile menu on link click / outside click / Escape
    if (stickyMenu) {
        stickyMenu.addEventListener('click', (e) => {
            const link = e.target.closest('a[href]');
            if (!link) return;
            stickyMenu.removeAttribute('open');
        });

        document.addEventListener('click', (e) => {
            if (!stickyMenu.open) return;
            if (!stickyMenu.contains(e.target)) stickyMenu.removeAttribute('open');
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && stickyMenu.open) stickyMenu.removeAttribute('open');
        });
    }

    const navLinks = Array.from(document.querySelectorAll('.sticky-nav a[href^=\"#\"]'));
    const navTargets = navLinks
        .map((a) => {
            const href = a.getAttribute('href');
            if (!href) return null;
            const el = document.querySelector(href);
            if (!el) return null;
            return { href, a, el };
        })
        .filter(Boolean);

    const headerH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h'), 10) || 64;

    function updateNavState() {
        if (stickyHeader) stickyHeader.classList.toggle('scrolled', window.scrollY > 8);
        if (backToTopBtn) backToTopBtn.classList.toggle('visible', window.scrollY > 500);

        if (!navTargets.length) return;

        const y = headerH + 24;

        let currentHref = navTargets[0].href;
        for (const t of navTargets) {
            const top = t.el.getBoundingClientRect().top;
            if (top <= y) currentHref = t.href;
        }

        navLinks.forEach((a) => {
            a.classList.toggle('active', a.getAttribute('href') === currentHref);
        });
    }

    updateNavState();

    let ticking = false;
    window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(() => {
            updateNavState();
            ticking = false;
        });
    }, { passive: true });

    // ----------------------------------------
    // 3. Donate Section
    // ----------------------------------------
    const donateAmounts = document.getElementById('donateAmounts');
    const donateCustomRow = document.getElementById('donateCustomRow');
    const donateCustomInput = document.getElementById('donateCustomInput');
    const donateWhatLabel = document.getElementById('donateWhatLabel');
    const donateBtn = document.getElementById('donateBtn');
    const donateModal = document.getElementById('donateModal');
    const donateModalClose = document.getElementById('donateModalClose');
    const modalAmount = document.getElementById('modalAmount');

    let selectedAmount = 3000;

    const amountDescriptions = {
        500: '500 \u20BD — поддержка домена и почты на год',
        1000: '1 000 \u20BD — покрывает месяц хостинга',
        3000: '3 000 \u20BD — юридическая консультация на час',
        5000: '5 000 \u20BD — треть стоимости регистрации НКО',
        10000: '10 000 \u20BD — две трети регистрации НКО'
    };

    function formatAmount(n) {
        return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }

    function updateDonateLabel(amount) {
        if (donateWhatLabel) {
            if (amountDescriptions[amount]) {
                donateWhatLabel.textContent = amountDescriptions[amount];
            } else if (amount && amount >= 100) {
                donateWhatLabel.textContent = formatAmount(amount) + ' \u20BD — ваш вклад в строительство СЛОБОДА';
            } else {
                donateWhatLabel.textContent = '';
            }
        }
    }

    if (donateAmounts) {
        donateAmounts.addEventListener('click', (e) => {
            const btn = e.target.closest('.donate-amt');
            if (!btn) return;

            // Update active state
            donateAmounts.querySelectorAll('.donate-amt').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const val = btn.dataset.amount;

            if (val === 'custom') {
                donateCustomRow.classList.add('visible');
                donateCustomInput.focus();
                const customVal = parseInt(donateCustomInput.value) || 0;
                selectedAmount = customVal;
                updateDonateLabel(customVal);
            } else {
                donateCustomRow.classList.remove('visible');
                selectedAmount = parseInt(val);
                updateDonateLabel(selectedAmount);
            }
        });
    }

    if (donateCustomInput) {
        donateCustomInput.addEventListener('input', () => {
            const val = parseInt(donateCustomInput.value) || 0;
            selectedAmount = val;
            updateDonateLabel(val);
        });
    }

    // Open modal
    if (donateBtn && donateModal) {
        donateBtn.addEventListener('click', () => {
            const display = selectedAmount >= 100 ? formatAmount(selectedAmount) + ' \u20BD' : '...';
            if (modalAmount) modalAmount.textContent = display;
            donateModal.classList.add('visible');
            document.body.style.overflow = 'hidden';
        });
    }

    // Close modal
    function closeDonateModal() {
        if (donateModal) {
            donateModal.classList.remove('visible');
            document.body.style.overflow = '';
        }
    }

    if (donateModalClose) {
        donateModalClose.addEventListener('click', closeDonateModal);
    }

    if (donateModal) {
        donateModal.addEventListener('click', (e) => {
            if (e.target === donateModal) closeDonateModal();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeDonateModal();
        });
    }

    // ----------------------------------------
    // 4. Progressive Form Disclosure
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
    // 5. Form Submission
    // ----------------------------------------
    const form = document.getElementById('signupForm');
    const submitBtn = document.getElementById('submitBtn');
    const statusEl = document.getElementById('formStatus');

    if (form && submitBtn && statusEl) {
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
    }
});
