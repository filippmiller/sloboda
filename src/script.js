// ============================================
// SLOBODA — Form Submission
// ============================================

document.addEventListener('DOMContentLoaded', () => {
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
