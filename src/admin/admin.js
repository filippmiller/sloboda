// ============================================
// SLOBODA Admin Panel - Client-Side Application
// ============================================

const App = {
    currentAdmin: null,
    currentPage: 'dashboard',
    currentRegistration: null,

    // ============================================
    // INITIALIZATION
    // ============================================

    async init() {
        // Check current path
        const path = window.location.pathname;

        // Handle accept-invite page
        if (path.includes('accept-invite')) {
            this.renderAcceptInvitePage();
            return;
        }

        // Check authentication
        const isAuthenticated = await this.checkAuth();

        if (!isAuthenticated) {
            this.renderLoginPage();
            return;
        }

        // Render main admin layout
        this.renderAdminLayout();
        this.setupRouting();
        this.navigateToPath(path);
    },

    // ============================================
    // AUTHENTICATION
    // ============================================

    async checkAuth() {
        try {
            const response = await fetch('/api/auth/me');
            if (response.ok) {
                const data = await response.json();
                this.currentAdmin = data.admin;
                return true;
            }
            return false;
        } catch {
            return false;
        }
    },

    async login(email, password, rememberMe) {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, rememberMe })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }

        this.currentAdmin = data.admin;
        return data;
    },

    async logout() {
        await fetch('/api/auth/logout', { method: 'POST' });
        this.currentAdmin = null;
        window.location.href = '/admin/login';
    },

    // ============================================
    // ROUTING
    // ============================================

    setupRouting() {
        window.addEventListener('popstate', () => {
            this.navigateToPath(window.location.pathname);
        });
    },

    navigate(page, params = {}) {
        const path = `/admin/${page}`;
        window.history.pushState(params, '', path);
        this.currentPage = page;
        this.renderCurrentPage();
    },

    navigateToPath(path) {
        const parts = path.replace('/admin', '').split('/').filter(Boolean);
        const page = parts[0] || 'dashboard';
        const params = parts[1] ? { id: parts[1] } : {};

        this.currentPage = page;
        this.renderCurrentPage(params);
    },

    // ============================================
    // RENDER METHODS
    // ============================================

    renderLoginPage() {
        document.getElementById('app').innerHTML = `
            <div class="login-page">
                <div class="login-card">
                    <div class="login-logo">
                        <h1>SLOBODA <span>Admin</span></h1>
                        <p>Sign in to access the admin panel</p>
                    </div>

                    <div id="login-error" class="error-message"></div>

                    <form id="login-form">
                        <div class="form-group">
                            <label for="email">Email</label>
                            <input type="email" id="email" name="email" required
                                   placeholder="admin@sloboda.land">
                        </div>

                        <div class="form-group">
                            <label for="password">Password</label>
                            <input type="password" id="password" name="password" required
                                   placeholder="Enter your password">
                        </div>

                        <div class="form-group checkbox-group">
                            <input type="checkbox" id="remember" name="remember">
                            <label for="remember">Remember me for 7 days</label>
                        </div>

                        <button type="submit" class="btn btn-primary" id="login-btn">
                            Sign In
                        </button>
                    </form>
                </div>
            </div>
        `;

        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('login-btn');
            const errorEl = document.getElementById('login-error');

            btn.disabled = true;
            btn.textContent = 'Signing in...';
            errorEl.classList.remove('show');

            try {
                const email = document.getElementById('email').value;
                const password = document.getElementById('password').value;
                const rememberMe = document.getElementById('remember').checked;

                await this.login(email, password, rememberMe);
                window.location.href = '/admin/dashboard';
            } catch (err) {
                errorEl.textContent = err.message;
                errorEl.classList.add('show');
                btn.disabled = false;
                btn.textContent = 'Sign In';
            }
        });
    },

    renderAcceptInvitePage() {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');

        if (!token) {
            document.getElementById('app').innerHTML = `
                <div class="login-page">
                    <div class="login-card">
                        <div class="login-logo">
                            <h1>SLOBODA <span>Admin</span></h1>
                        </div>
                        <div class="error-message show">Invalid invitation link</div>
                        <a href="/admin/login" class="btn btn-secondary" style="margin-top: 16px; display: block; text-align: center;">
                            Go to Login
                        </a>
                    </div>
                </div>
            `;
            return;
        }

        // Verify token first
        this.verifyInviteToken(token);
    },

    async verifyInviteToken(token) {
        try {
            const response = await fetch(`/api/auth/invite/${token}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error);
            }

            this.renderSetPasswordForm(token, data.email, data.name);
        } catch (err) {
            document.getElementById('app').innerHTML = `
                <div class="login-page">
                    <div class="login-card">
                        <div class="login-logo">
                            <h1>SLOBODA <span>Admin</span></h1>
                        </div>
                        <div class="error-message show">${err.message}</div>
                        <a href="/admin/login" class="btn btn-secondary" style="margin-top: 16px; display: block; text-align: center;">
                            Go to Login
                        </a>
                    </div>
                </div>
            `;
        }
    },

    renderSetPasswordForm(token, email, existingName) {
        document.getElementById('app').innerHTML = `
            <div class="login-page">
                <div class="login-card">
                    <div class="login-logo">
                        <h1>SLOBODA <span>Admin</span></h1>
                        <p>Set up your admin account</p>
                    </div>

                    <div id="invite-error" class="error-message"></div>
                    <div id="invite-success" class="success-message"></div>

                    <form id="accept-form">
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" value="${email}" disabled
                                   style="background: #f1f5f9;">
                        </div>

                        <div class="form-group">
                            <label for="name">Your Name</label>
                            <input type="text" id="name" name="name"
                                   value="${existingName || ''}"
                                   placeholder="Enter your name" required>
                        </div>

                        <div class="form-group">
                            <label for="password">Password</label>
                            <input type="password" id="password" name="password" required
                                   placeholder="Minimum 8 characters" minlength="8">
                        </div>

                        <div class="form-group">
                            <label for="confirm-password">Confirm Password</label>
                            <input type="password" id="confirm-password" required
                                   placeholder="Repeat your password">
                        </div>

                        <input type="hidden" id="token" value="${token}">

                        <button type="submit" class="btn btn-primary" id="accept-btn">
                            Activate Account
                        </button>
                    </form>
                </div>
            </div>
        `;

        document.getElementById('accept-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('accept-btn');
            const errorEl = document.getElementById('invite-error');
            const successEl = document.getElementById('invite-success');

            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            if (password !== confirmPassword) {
                errorEl.textContent = 'Passwords do not match';
                errorEl.classList.add('show');
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Activating...';
            errorEl.classList.remove('show');

            try {
                const response = await fetch('/api/auth/accept-invite', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        token: document.getElementById('token').value,
                        password,
                        name: document.getElementById('name').value
                    })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error);
                }

                successEl.textContent = 'Account activated! Redirecting...';
                successEl.classList.add('show');

                setTimeout(() => {
                    window.location.href = '/admin/dashboard';
                }, 1500);
            } catch (err) {
                errorEl.textContent = err.message;
                errorEl.classList.add('show');
                btn.disabled = false;
                btn.textContent = 'Activate Account';
            }
        });
    },

    renderAdminLayout() {
        const admin = this.currentAdmin;
        const initials = admin.name ? admin.name.split(' ').map(n => n[0]).join('').toUpperCase() : admin.email[0].toUpperCase();

        document.getElementById('app').innerHTML = `
            <div class="admin-layout">
                <aside class="sidebar" id="sidebar">
                    <div class="sidebar-header">
                        <h1>SLOBODA <span>Admin</span></h1>
                        <p>Control Panel</p>
                    </div>

                    <nav class="sidebar-nav">
                        <div class="nav-section">
                            <div class="nav-section-title">Overview</div>
                            <a class="nav-item" data-page="dashboard">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
                                </svg>
                                <span>Dashboard</span>
                            </a>
                        </div>

                        <div class="nav-section">
                            <div class="nav-section-title">Management</div>
                            <a class="nav-item" data-page="registrations">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
                                </svg>
                                <span>Registrations</span>
                            </a>
                            <a class="nav-item" data-page="communications">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                                </svg>
                                <span>Communications</span>
                            </a>
                            <a class="nav-item" data-page="analytics">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                                </svg>
                                <span>Analytics</span>
                            </a>
                        </div>

                        <div class="nav-section">
                            <div class="nav-section-title">System</div>
                            <a class="nav-item" data-page="settings">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                </svg>
                                <span>Settings</span>
                            </a>
                            ${admin.role === 'super_admin' ? `
                            <a class="nav-item" data-page="admins">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
                                </svg>
                                <span>Admin Users</span>
                            </a>
                            ` : ''}
                        </div>
                    </nav>

                    <div class="sidebar-footer">
                        <a class="nav-item" id="logout-btn">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                            </svg>
                            <span>Logout</span>
                        </a>
                    </div>
                </aside>

                <main class="main-content">
                    <header class="topbar">
                        <div class="topbar-left">
                            <button class="btn btn-secondary btn-sm" id="menu-toggle" style="display: none;">
                                <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
                                </svg>
                            </button>
                            <h1 class="topbar-title" id="page-title">Dashboard</h1>
                        </div>
                        <div class="topbar-right">
                            <div class="admin-menu">
                                <button class="admin-menu-btn" id="admin-menu-btn">
                                    <div class="admin-avatar">${initials}</div>
                                    <span>${admin.name || admin.email}</span>
                                    <svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                    </svg>
                                </button>
                                <div class="admin-dropdown" id="admin-dropdown">
                                    <a href="#" data-page="settings">Settings</a>
                                    <a href="#" class="danger" id="dropdown-logout">Logout</a>
                                </div>
                            </div>
                        </div>
                    </header>

                    <div class="page-content" id="page-content">
                        <!-- Page content renders here -->
                    </div>
                </main>
            </div>
        `;

        // Setup navigation
        document.querySelectorAll('.nav-item[data-page]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigate(item.dataset.page);
            });
        });

        // Setup logout
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());
        document.getElementById('dropdown-logout').addEventListener('click', (e) => {
            e.preventDefault();
            this.logout();
        });

        // Setup admin dropdown
        const menuBtn = document.getElementById('admin-menu-btn');
        const dropdown = document.getElementById('admin-dropdown');
        menuBtn.addEventListener('click', () => {
            dropdown.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (!menuBtn.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });
    },

    renderCurrentPage(params = {}) {
        // Update active nav
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.page === this.currentPage) {
                item.classList.add('active');
            }
        });

        // Update title
        const titles = {
            dashboard: 'Dashboard',
            registrations: 'Registrations',
            'registration-detail': 'Registration Details',
            communications: 'Communications',
            analytics: 'Analytics',
            settings: 'Settings',
            admins: 'Admin Users'
        };
        document.getElementById('page-title').textContent = titles[this.currentPage] || 'Admin';

        // Render page
        switch (this.currentPage) {
            case 'dashboard':
                this.renderDashboard();
                break;
            case 'registrations':
                this.renderRegistrations();
                break;
            case 'registration-detail':
                this.renderRegistrationDetail(params.id);
                break;
            case 'communications':
                this.renderCommunications();
                break;
            case 'analytics':
                this.renderAnalytics();
                break;
            case 'settings':
                this.renderSettings();
                break;
            case 'admins':
                this.renderAdmins();
                break;
            default:
                this.renderDashboard();
        }
    },

    // ============================================
    // DASHBOARD PAGE
    // ============================================

    async renderDashboard() {
        document.getElementById('page-content').innerHTML = `
            <div class="loading"><div class="loading-spinner"></div></div>
        `;

        try {
            const [overviewRes, timeseriesRes] = await Promise.all([
                fetch('/api/analytics/overview'),
                fetch('/api/analytics/timeseries?days=30')
            ]);

            const overview = await overviewRes.json();
            const timeseries = await timeseriesRes.json();

            const stats = overview.data;
            const growthPct = stats.last_week > 0
                ? Math.round(((stats.this_week - stats.last_week) / stats.last_week) * 100)
                : stats.this_week > 0 ? 100 : 0;

            document.getElementById('page-content').innerHTML = `
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-title">Total Registrations</span>
                            <div class="stat-card-icon primary">
                                <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-card-value">${stats.total}</div>
                        <div class="stat-card-change ${growthPct >= 0 ? 'positive' : 'negative'}">
                            ${growthPct >= 0 ? '↑' : '↓'} ${Math.abs(growthPct)}% vs last week
                        </div>
                    </div>

                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-title">This Week</span>
                            <div class="stat-card-icon info">
                                <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-card-value">${stats.this_week}</div>
                        <div class="stat-card-change">
                            +${stats.this_week - stats.last_week} vs last week
                        </div>
                    </div>

                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-title">Investors</span>
                            <div class="stat-card-icon warning">
                                <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-card-value">${stats.investors}</div>
                        <div class="stat-card-change">
                            ${stats.total > 0 ? Math.round((stats.investors / stats.total) * 100) : 0}% of total
                        </div>
                    </div>

                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-title">Conversion Funnel</span>
                            <div class="stat-card-icon success">
                                <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-card-value">${stats.converted_count}</div>
                        <div class="stat-card-change">
                            ${stats.qualified_count} qualified, ${stats.contacted_count} contacted
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <span class="card-title">Registrations Over Time</span>
                    </div>
                    <div class="card-body">
                        <div class="chart-container">
                            <canvas id="registrations-chart"></canvas>
                        </div>
                    </div>
                </div>
            `;

            // Render chart
            const ctx = document.getElementById('registrations-chart').getContext('2d');
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: timeseries.data.map(d => new Date(d.date).toLocaleDateString()),
                    datasets: [{
                        label: 'Registrations',
                        data: timeseries.data.map(d => parseInt(d.count)),
                        borderColor: '#7cb586',
                        backgroundColor: 'rgba(124, 181, 134, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { stepSize: 1 }
                        }
                    }
                }
            });
        } catch (err) {
            console.error('Failed to load dashboard:', err);
            document.getElementById('page-content').innerHTML = `
                <div class="error-message show">Failed to load dashboard data</div>
            `;
        }
    },

    // ============================================
    // REGISTRATIONS PAGE
    // ============================================

    async renderRegistrations() {
        document.getElementById('page-content').innerHTML = `
            <div class="card">
                <div class="card-header">
                    <span class="card-title">All Registrations</span>
                    <button class="btn btn-primary btn-sm" id="export-csv">Export CSV</button>
                </div>
                <div class="card-body">
                    <div class="filters-row">
                        <select class="filter-select" id="filter-status">
                            <option value="">All Statuses</option>
                            <option value="new">New</option>
                            <option value="contacted">Contacted</option>
                            <option value="qualified">Qualified</option>
                            <option value="rejected">Rejected</option>
                            <option value="converted">Converted</option>
                        </select>
                        <select class="filter-select" id="filter-participation">
                            <option value="">All Types</option>
                            <option value="community">Community</option>
                            <option value="investor">Investor</option>
                            <option value="both">Both</option>
                            <option value="observer">Observer</option>
                        </select>
                        <input type="text" class="filter-input" id="filter-search"
                               placeholder="Search by name or email...">
                    </div>
                    <div id="registrations-table">
                        <div class="loading"><div class="loading-spinner"></div></div>
                    </div>
                </div>
            </div>
        `;

        // Setup filters
        const loadRegistrations = async () => {
            const params = new URLSearchParams();
            const status = document.getElementById('filter-status').value;
            const participation = document.getElementById('filter-participation').value;
            const search = document.getElementById('filter-search').value;

            if (status) params.set('status', status);
            if (participation) params.set('participation', participation);
            if (search) params.set('search', search);

            try {
                const response = await fetch(`/api/registrations?${params}`);
                const data = await response.json();

                if (data.data.length === 0) {
                    document.getElementById('registrations-table').innerHTML = `
                        <div class="empty-state">
                            <h3>No registrations found</h3>
                            <p>Try adjusting your filters</p>
                        </div>
                    `;
                    return;
                }

                document.getElementById('registrations-table').innerHTML = `
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Type</th>
                                <th>Status</th>
                                <th>Date</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.data.map(reg => `
                                <tr>
                                    <td><strong>${this.escapeHtml(reg.name)}</strong></td>
                                    <td>${this.escapeHtml(reg.email)}</td>
                                    <td>${reg.participation || '-'}</td>
                                    <td><span class="badge badge-${reg.status || 'new'}">${reg.status || 'new'}</span></td>
                                    <td>${new Date(reg.created_at).toLocaleDateString()}</td>
                                    <td>
                                        <button class="btn btn-secondary btn-sm view-btn" data-id="${reg.id}">View</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;

                // Setup view buttons
                document.querySelectorAll('.view-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        window.history.pushState({ id: btn.dataset.id }, '', `/admin/registration-detail/${btn.dataset.id}`);
                        this.currentPage = 'registration-detail';
                        this.renderRegistrationDetail(btn.dataset.id);
                    });
                });
            } catch (err) {
                console.error('Failed to load registrations:', err);
            }
        };

        document.getElementById('filter-status').addEventListener('change', loadRegistrations);
        document.getElementById('filter-participation').addEventListener('change', loadRegistrations);

        let searchTimeout;
        document.getElementById('filter-search').addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(loadRegistrations, 300);
        });

        // Export CSV
        document.getElementById('export-csv').addEventListener('click', async () => {
            const response = await fetch('/api/registrations');
            const data = await response.json();

            const headers = ['ID', 'Name', 'Email', 'Telegram', 'Location', 'Motivation', 'Participation', 'Budget', 'Timeline', 'Status', 'Created'];
            const rows = data.data.map(r => [
                r.id, r.name, r.email, r.telegram, r.location, r.motivation, r.participation, r.budget, r.timeline, r.status, r.created_at
            ]);

            const csv = [headers, ...rows].map(row => row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `registrations-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
        });

        loadRegistrations();
    },

    // ============================================
    // REGISTRATION DETAIL PAGE
    // ============================================

    async renderRegistrationDetail(id) {
        document.getElementById('page-content').innerHTML = `
            <div class="loading"><div class="loading-spinner"></div></div>
        `;

        try {
            const [regRes, notesRes] = await Promise.all([
                fetch(`/api/registrations/${id}`),
                fetch(`/api/registrations/${id}/notes`)
            ]);

            const reg = (await regRes.json()).data;
            const notes = (await notesRes.json()).data;

            if (!reg) {
                document.getElementById('page-content').innerHTML = `
                    <div class="error-message show">Registration not found</div>
                    <button class="btn btn-secondary mt-4" onclick="App.navigate('registrations')">Back to list</button>
                `;
                return;
            }

            document.getElementById('page-content').innerHTML = `
                <div class="detail-header">
                    <div>
                        <button class="btn btn-secondary btn-sm mb-4" onclick="App.navigate('registrations')">
                            ← Back to list
                        </button>
                        <h2 class="detail-title">${this.escapeHtml(reg.name)}</h2>
                        <p class="detail-subtitle">
                            ${this.escapeHtml(reg.email)}
                            ${reg.telegram ? ` · @${this.escapeHtml(reg.telegram)}` : ''}
                            ${reg.location ? ` · ${this.escapeHtml(reg.location)}` : ''}
                        </p>
                    </div>
                    <div class="flex gap-2">
                        <select class="filter-select" id="status-select">
                            <option value="new" ${reg.status === 'new' ? 'selected' : ''}>New</option>
                            <option value="contacted" ${reg.status === 'contacted' ? 'selected' : ''}>Contacted</option>
                            <option value="qualified" ${reg.status === 'qualified' ? 'selected' : ''}>Qualified</option>
                            <option value="rejected" ${reg.status === 'rejected' ? 'selected' : ''}>Rejected</option>
                            <option value="converted" ${reg.status === 'converted' ? 'selected' : ''}>Converted</option>
                        </select>
                        <button class="btn btn-danger btn-sm" id="delete-btn">Delete</button>
                    </div>
                </div>

                <div class="detail-grid">
                    <div>
                        <div class="card">
                            <div class="card-header">
                                <span class="card-title">Profile Information</span>
                            </div>
                            <div class="card-body">
                                <div class="detail-row">
                                    <span class="detail-label">Motivation</span>
                                    <span class="detail-value">${reg.motivation || '-'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">Participation</span>
                                    <span class="detail-value">${reg.participation || '-'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">Budget</span>
                                    <span class="detail-value">${reg.budget || '-'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">Timeline</span>
                                    <span class="detail-value">${reg.timeline || '-'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">Skills</span>
                                    <span class="detail-value">${(reg.skills || []).join(', ') || '-'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">Newsletter</span>
                                    <span class="detail-value">${reg.newsletter ? 'Yes' : 'No'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">Registered</span>
                                    <span class="detail-value">${new Date(reg.created_at).toLocaleString()}</span>
                                </div>
                                ${reg.about ? `
                                    <div class="detail-section mt-4">
                                        <div class="detail-section-title">About</div>
                                        <p>${this.escapeHtml(reg.about)}</p>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>

                    <div>
                        <div class="card">
                            <div class="card-header">
                                <span class="card-title">Admin Notes</span>
                            </div>
                            <div class="card-body">
                                <div class="note-form">
                                    <textarea id="note-input" placeholder="Add a note..."></textarea>
                                    <button class="btn btn-primary btn-sm" id="add-note-btn">Add Note</button>
                                </div>
                                <div class="notes-list" id="notes-list">
                                    ${notes.length === 0 ? '<p class="text-center" style="color: var(--text-muted);">No notes yet</p>' : ''}
                                    ${notes.map(note => `
                                        <div class="note-item">
                                            <div class="note-header">
                                                <span class="note-author">${this.escapeHtml(note.admin_name || note.admin_email)}</span>
                                                <span class="note-date">${new Date(note.created_at).toLocaleString()}</span>
                                            </div>
                                            <p class="note-content">${this.escapeHtml(note.note)}</p>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Status change
            document.getElementById('status-select').addEventListener('change', async (e) => {
                await fetch(`/api/registrations/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: e.target.value })
                });
            });

            // Delete
            document.getElementById('delete-btn').addEventListener('click', async () => {
                if (confirm('Are you sure you want to delete this registration?')) {
                    await fetch(`/api/registrations/${id}`, { method: 'DELETE' });
                    this.navigate('registrations');
                }
            });

            // Add note
            document.getElementById('add-note-btn').addEventListener('click', async () => {
                const note = document.getElementById('note-input').value.trim();
                if (!note) return;

                await fetch(`/api/registrations/${id}/notes`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ note })
                });

                this.renderRegistrationDetail(id);
            });
        } catch (err) {
            console.error('Failed to load registration:', err);
        }
    },

    // ============================================
    // COMMUNICATIONS PAGE
    // ============================================

    async renderCommunications() {
        document.getElementById('page-content').innerHTML = `
            <div class="stats-grid" style="grid-template-columns: repeat(3, 1fr);">
                <div class="stat-card">
                    <div class="stat-card-header">
                        <span class="stat-card-title">Total Campaigns</span>
                    </div>
                    <div class="stat-card-value" id="total-campaigns">-</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-header">
                        <span class="stat-card-title">Emails Sent</span>
                    </div>
                    <div class="stat-card-value" id="total-sent">-</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-header">
                        <span class="stat-card-title">Templates</span>
                    </div>
                    <div class="stat-card-value" id="total-templates">-</div>
                </div>
            </div>

            <div class="card mb-4">
                <div class="card-header">
                    <span class="card-title">Email Templates</span>
                    <button class="btn btn-primary btn-sm" id="new-template-btn">+ New Template</button>
                </div>
                <div class="card-body" id="templates-list">
                    <div class="loading"><div class="loading-spinner"></div></div>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <span class="card-title">Recent Campaigns</span>
                    <button class="btn btn-primary btn-sm" id="new-campaign-btn">+ New Campaign</button>
                </div>
                <div class="card-body" id="campaigns-list">
                    <div class="loading"><div class="loading-spinner"></div></div>
                </div>
            </div>

            <!-- Template Modal -->
            <div class="modal-overlay" id="template-modal">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title">Create Template</h3>
                        <button class="modal-close" onclick="document.getElementById('template-modal').classList.remove('show')">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label>Template Name</label>
                            <input type="text" id="template-name" placeholder="e.g., Welcome Email">
                        </div>
                        <div class="form-group">
                            <label>Subject</label>
                            <input type="text" id="template-subject" placeholder="Email subject line">
                        </div>
                        <div class="form-group">
                            <label>Body (use {{name}}, {{email}} for variables)</label>
                            <textarea id="template-body" rows="8" placeholder="Dear {{name}},

Thank you for..."></textarea>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="document.getElementById('template-modal').classList.remove('show')">Cancel</button>
                        <button class="btn btn-primary" id="save-template-btn">Save Template</button>
                    </div>
                </div>
            </div>
        `;

        // Load data
        const [templatesRes, campaignsRes] = await Promise.all([
            fetch('/api/templates'),
            fetch('/api/campaigns')
        ]);

        const templates = (await templatesRes.json()).data;
        const campaigns = (await campaignsRes.json()).data;

        // Update stats
        document.getElementById('total-campaigns').textContent = campaigns.length;
        document.getElementById('total-sent').textContent = campaigns.reduce((sum, c) => sum + (parseInt(c.recipient_count) || 0), 0);
        document.getElementById('total-templates').textContent = templates.length;

        // Render templates
        if (templates.length === 0) {
            document.getElementById('templates-list').innerHTML = `
                <div class="empty-state">
                    <h3>No templates yet</h3>
                    <p>Create your first email template to get started</p>
                </div>
            `;
        } else {
            document.getElementById('templates-list').innerHTML = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Subject</th>
                            <th>Created</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${templates.map(t => `
                            <tr>
                                <td><strong>${this.escapeHtml(t.name)}</strong></td>
                                <td>${this.escapeHtml(t.subject)}</td>
                                <td>${new Date(t.created_at).toLocaleDateString()}</td>
                                <td>
                                    <button class="btn btn-danger btn-sm delete-template" data-id="${t.id}">Delete</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;

            document.querySelectorAll('.delete-template').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (confirm('Delete this template?')) {
                        await fetch(`/api/templates/${btn.dataset.id}`, { method: 'DELETE' });
                        this.renderCommunications();
                    }
                });
            });
        }

        // Render campaigns
        if (campaigns.length === 0) {
            document.getElementById('campaigns-list').innerHTML = `
                <div class="empty-state">
                    <h3>No campaigns yet</h3>
                    <p>Send your first email campaign</p>
                </div>
            `;
        } else {
            document.getElementById('campaigns-list').innerHTML = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Subject</th>
                            <th>Recipients</th>
                            <th>Sent</th>
                            <th>Created</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${campaigns.map(c => `
                            <tr>
                                <td><strong>${this.escapeHtml(c.subject)}</strong></td>
                                <td>${c.recipient_count}</td>
                                <td>${c.sent_at ? 'Yes' : 'Draft'}</td>
                                <td>${new Date(c.created_at).toLocaleDateString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }

        // New template modal
        document.getElementById('new-template-btn').addEventListener('click', () => {
            document.getElementById('template-modal').classList.add('show');
        });

        document.getElementById('save-template-btn').addEventListener('click', async () => {
            const name = document.getElementById('template-name').value;
            const subject = document.getElementById('template-subject').value;
            const body = document.getElementById('template-body').value;

            if (!name || !subject || !body) {
                alert('All fields are required');
                return;
            }

            await fetch('/api/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, subject, body })
            });

            document.getElementById('template-modal').classList.remove('show');
            this.renderCommunications();
        });

        // New campaign (simple version)
        document.getElementById('new-campaign-btn').addEventListener('click', async () => {
            const subject = prompt('Campaign subject:');
            if (!subject) return;

            const body = prompt('Campaign body (use {{name}} for personalization):');
            if (!body) return;

            await fetch('/api/campaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subject, body, filters: {} })
            });

            this.renderCommunications();
        });
    },

    // ============================================
    // ANALYTICS PAGE
    // ============================================

    async renderAnalytics() {
        document.getElementById('page-content').innerHTML = `
            <div class="loading"><div class="loading-spinner"></div></div>
        `;

        try {
            const [overviewRes, breakdownRes] = await Promise.all([
                fetch('/api/analytics/overview'),
                fetch('/api/analytics/breakdown')
            ]);

            const overview = (await overviewRes.json()).data;
            const breakdown = (await breakdownRes.json()).data;

            document.getElementById('page-content').innerHTML = `
                <div class="charts-grid">
                    <div class="card">
                        <div class="card-header">
                            <span class="card-title">Motivation Breakdown</span>
                        </div>
                        <div class="card-body">
                            <div class="chart-container">
                                <canvas id="motivation-chart"></canvas>
                            </div>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header">
                            <span class="card-title">Participation Type</span>
                        </div>
                        <div class="card-body">
                            <div class="chart-container">
                                <canvas id="participation-chart"></canvas>
                            </div>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header">
                            <span class="card-title">Top Locations</span>
                        </div>
                        <div class="card-body">
                            ${breakdown.location.length === 0 ? '<p class="text-center" style="color: var(--text-muted);">No data</p>' : `
                                <table class="data-table">
                                    <tbody>
                                        ${breakdown.location.map(l => `
                                            <tr>
                                                <td>${this.escapeHtml(l.location)}</td>
                                                <td class="text-right"><strong>${l.count}</strong></td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            `}
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header">
                            <span class="card-title">Skills Offered</span>
                        </div>
                        <div class="card-body">
                            ${breakdown.skills.length === 0 ? '<p class="text-center" style="color: var(--text-muted);">No data</p>' : `
                                <table class="data-table">
                                    <tbody>
                                        ${breakdown.skills.slice(0, 8).map(s => `
                                            <tr>
                                                <td>${this.escapeHtml(s.skill)}</td>
                                                <td class="text-right"><strong>${s.count}</strong></td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            `}
                        </div>
                    </div>
                </div>
            `;

            // Motivation chart
            if (breakdown.motivation.length > 0) {
                new Chart(document.getElementById('motivation-chart').getContext('2d'), {
                    type: 'doughnut',
                    data: {
                        labels: breakdown.motivation.map(m => m.motivation),
                        datasets: [{
                            data: breakdown.motivation.map(m => parseInt(m.count)),
                            backgroundColor: ['#7cb586', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6']
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false
                    }
                });
            }

            // Participation chart
            if (breakdown.participation.length > 0) {
                new Chart(document.getElementById('participation-chart').getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: breakdown.participation.map(p => p.participation),
                        datasets: [{
                            label: 'Count',
                            data: breakdown.participation.map(p => parseInt(p.count)),
                            backgroundColor: '#7cb586'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } }
                    }
                });
            }
        } catch (err) {
            console.error('Failed to load analytics:', err);
        }
    },

    // ============================================
    // SETTINGS PAGE
    // ============================================

    async renderSettings() {
        document.getElementById('page-content').innerHTML = `
            <div class="loading"><div class="loading-spinner"></div></div>
        `;

        try {
            const response = await fetch('/api/settings');
            const settings = (await response.json()).data;

            document.getElementById('page-content').innerHTML = `
                <div class="card">
                    <div class="card-header">
                        <span class="card-title">System Settings</span>
                    </div>
                    <div class="card-body">
                        <div class="form-section">
                            <div class="form-section-title">General</div>
                            <div class="form-group">
                                <label>Site Name</label>
                                <input type="text" id="setting-site_name" value="${this.escapeHtml(settings.site_name || '')}">
                            </div>
                            <div class="form-group">
                                <label>Contact Email</label>
                                <input type="email" id="setting-contact_email" value="${this.escapeHtml(settings.contact_email || '')}">
                            </div>
                        </div>

                        <div class="form-section">
                            <div class="form-section-title">Registration</div>
                            <div class="toggle-group">
                                <div>
                                    <div class="toggle-label">Accept New Registrations</div>
                                    <div class="toggle-description">Allow visitors to submit the registration form</div>
                                </div>
                                <label class="toggle-switch">
                                    <input type="checkbox" id="setting-accept_registrations" ${settings.accept_registrations === 'true' ? 'checked' : ''}>
                                    <span class="toggle-slider"></span>
                                </label>
                            </div>
                            <div class="toggle-group">
                                <div>
                                    <div class="toggle-label">Send Welcome Email</div>
                                    <div class="toggle-description">Automatically send welcome email on registration</div>
                                </div>
                                <label class="toggle-switch">
                                    <input type="checkbox" id="setting-auto_welcome_email" ${settings.auto_welcome_email === 'true' ? 'checked' : ''}>
                                    <span class="toggle-slider"></span>
                                </label>
                            </div>
                        </div>

                        <div class="form-section">
                            <div class="form-section-title">Notifications</div>
                            <div class="toggle-group">
                                <div>
                                    <div class="toggle-label">Notify on New Registration</div>
                                    <div class="toggle-description">Send email to admins when someone registers</div>
                                </div>
                                <label class="toggle-switch">
                                    <input type="checkbox" id="setting-notify_on_registration" ${settings.notify_on_registration === 'true' ? 'checked' : ''}>
                                    <span class="toggle-slider"></span>
                                </label>
                            </div>
                        </div>

                        ${this.currentAdmin.role === 'super_admin' ? `
                            <button class="btn btn-primary" id="save-settings-btn">Save Settings</button>
                        ` : '<p style="color: var(--text-muted);">Only super admins can modify settings</p>'}
                    </div>
                </div>
            `;

            if (this.currentAdmin.role === 'super_admin') {
                document.getElementById('save-settings-btn').addEventListener('click', async () => {
                    const newSettings = {
                        site_name: document.getElementById('setting-site_name').value,
                        contact_email: document.getElementById('setting-contact_email').value,
                        accept_registrations: document.getElementById('setting-accept_registrations').checked.toString(),
                        auto_welcome_email: document.getElementById('setting-auto_welcome_email').checked.toString(),
                        notify_on_registration: document.getElementById('setting-notify_on_registration').checked.toString()
                    };

                    await fetch('/api/settings', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newSettings)
                    });

                    alert('Settings saved!');
                });
            }
        } catch (err) {
            console.error('Failed to load settings:', err);
        }
    },

    // ============================================
    // ADMIN MANAGEMENT PAGE
    // ============================================

    async renderAdmins() {
        if (this.currentAdmin.role !== 'super_admin') {
            document.getElementById('page-content').innerHTML = `
                <div class="error-message show">Access denied. Super admin only.</div>
            `;
            return;
        }

        document.getElementById('page-content').innerHTML = `
            <div class="card">
                <div class="card-header">
                    <span class="card-title">Admin Users</span>
                    <button class="btn btn-primary btn-sm" id="invite-admin-btn">+ Invite Admin</button>
                </div>
                <div class="card-body" id="admins-list">
                    <div class="loading"><div class="loading-spinner"></div></div>
                </div>
            </div>

            <!-- Invite Modal -->
            <div class="modal-overlay" id="invite-modal">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title">Invite Admin</h3>
                        <button class="modal-close" onclick="document.getElementById('invite-modal').classList.remove('show')">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" id="invite-email" placeholder="admin@example.com">
                        </div>
                        <div class="form-group">
                            <label>Name (optional)</label>
                            <input type="text" id="invite-name" placeholder="John Doe">
                        </div>
                        <div class="form-group">
                            <label>Role</label>
                            <select id="invite-role" class="filter-select" style="width: 100%;">
                                <option value="admin">Admin</option>
                                <option value="super_admin">Super Admin</option>
                            </select>
                        </div>
                        <div id="invite-result" class="success-message"></div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="document.getElementById('invite-modal').classList.remove('show')">Close</button>
                        <button class="btn btn-primary" id="send-invite-btn">Send Invitation</button>
                    </div>
                </div>
            </div>
        `;

        // Load admins
        const response = await fetch('/api/admins');
        const admins = (await response.json()).data;

        document.getElementById('admins-list').innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Last Login</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    ${admins.map(admin => `
                        <tr>
                            <td><strong>${this.escapeHtml(admin.name || '-')}</strong></td>
                            <td>${this.escapeHtml(admin.email)}</td>
                            <td><span class="badge badge-${admin.pending ? 'pending' : admin.role}">${admin.pending ? 'Pending' : admin.role}</span></td>
                            <td>${admin.last_login ? new Date(admin.last_login).toLocaleString() : 'Never'}</td>
                            <td>
                                ${admin.id !== this.currentAdmin.id ? `
                                    <button class="btn btn-danger btn-sm delete-admin" data-id="${admin.id}">Remove</button>
                                ` : '<span style="color: var(--text-muted);">You</span>'}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        // Delete admin
        document.querySelectorAll('.delete-admin').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm('Remove this admin?')) {
                    await fetch(`/api/admins/${btn.dataset.id}`, { method: 'DELETE' });
                    this.renderAdmins();
                }
            });
        });

        // Invite modal
        document.getElementById('invite-admin-btn').addEventListener('click', () => {
            document.getElementById('invite-modal').classList.add('show');
            document.getElementById('invite-result').classList.remove('show');
        });

        document.getElementById('send-invite-btn').addEventListener('click', async () => {
            const email = document.getElementById('invite-email').value;
            const name = document.getElementById('invite-name').value;
            const role = document.getElementById('invite-role').value;

            if (!email) {
                alert('Email is required');
                return;
            }

            try {
                const response = await fetch('/api/auth/invite', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, name, role })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error);
                }

                document.getElementById('invite-result').innerHTML = `
                    Invitation created! Share this link:<br>
                    <code style="word-break: break-all;">${window.location.origin}${data.inviteLink}</code>
                `;
                document.getElementById('invite-result').classList.add('show');

                // Clear form
                document.getElementById('invite-email').value = '';
                document.getElementById('invite-name').value = '';

                // Refresh list
                this.renderAdmins();
            } catch (err) {
                alert(err.message);
            }
        });
    },

    // ============================================
    // UTILITIES
    // ============================================

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => App.init());
