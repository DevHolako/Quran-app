// Main Application Bootstrap & UI Controller
const App = {
    currentTheme: 'emerald',

    async init() {
        const settings = Storage.getSettings();
        this.setTheme(settings.theme || 'emerald');

        // Initialize submodules
        await QuranModule.init();
        PlayerModule.init();
        AdhkarModule.init();
        UpdaterModule.init();

        // Render Sidebar Surahs
        this.renderSurahList();
        this.renderBookmarksList();

        // Check last read or default to Surah 1
        const lastRead = Storage.getLastRead();
        if (lastRead && lastRead.surah) {
            await QuranModule.loadSurah(lastRead.surah, lastRead.ayah);
            this.showResumeBanner(lastRead);
        } else {
            await QuranModule.loadSurah(1);
        }

        this.attachGlobalEvents();
        this.setupIPCListeners();
    },

    setTheme(themeName) {
        this.currentTheme = themeName;
        document.body.setAttribute('data-theme', themeName);
        Storage.saveSettings({ theme: themeName });

        const themeBtn = document.getElementById('btnThemeToggle');
        if (themeBtn) {
            if (themeName === 'dark') themeBtn.innerHTML = '🌙';
            else if (themeName === 'sepia') themeBtn.innerHTML = '📜';
            else themeBtn.innerHTML = '🌿';
        }
    },

    cycleTheme() {
        const themes = ['emerald', 'dark', 'sepia'];
        const nextIdx = (themes.indexOf(this.currentTheme) + 1) % themes.length;
        this.setTheme(themes[nextIdx]);
        const names = { emerald: 'الزمردي الكلاسيكي', dark: 'الوضع الليلي الفاخر', sepia: 'ورق المصحف الدافئ' };
        this.showToast(`🎨 تم تفعيل ${names[themes[nextIdx]]}`);
    },

    // ========================================================
    // SIDEBAR SURAHS LIST & SEARCH
    // ========================================================
    renderSurahList(filterQuery = '') {
        const container = document.getElementById('sidebarSurahList');
        if (!container) return;

        const q = filterQuery.trim().toLowerCase();
        const filtered = SURAHS_DATA.filter(s => {
            if (!q) return true;
            return s.name.includes(q) || s.english.toLowerCase().includes(q) || String(s.id) === q;
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding: 30px 10px; color: var(--text-muted); font-size: 13px;">
                    لا توجد سور مطابقة لـ "${filterQuery}"
                </div>
            `;
            return;
        }

        let html = '';
        filtered.forEach(s => {
            const isActive = s.id === QuranModule.currentSurahId;
            html += `
                <div class="surah-list-item ${isActive ? 'active' : ''}" data-id="${s.id}" onclick="QuranModule.loadSurah(${s.id})">
                    <div class="surah-item-right">
                        <div class="surah-number-circle">${s.id}</div>
                        <div>
                            <div class="surah-item-name">سورة ${s.name}</div>
                            <div class="surah-item-english">${s.english}</div>
                        </div>
                    </div>
                    <div class="surah-item-meta">
                        <div>${s.ayahs} آية</div>
                        <div>${s.type}</div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    },

    filterSurahs(query) {
        this.renderSurahList(query);
    },

    switchSidebarTab(tabName) {
        document.querySelectorAll('.sidebar-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tabName);
        });

        document.getElementById('sidebarSurahView').style.display = tabName === 'surahs' ? 'block' : 'none';
        document.getElementById('sidebarBookmarksView').style.display = tabName === 'bookmarks' ? 'block' : 'none';
        document.getElementById('sidebarSettingsView').style.display = tabName === 'settings' ? 'block' : 'none';

        if (tabName === 'bookmarks') {
            this.renderBookmarksList();
        }
    },

    renderBookmarksList() {
        const container = document.getElementById('bookmarksListContainer');
        if (!container) return;

        const bookmarks = Storage.getBookmarks();
        if (bookmarks.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding: 40px 16px; color: var(--text-muted);">
                    <div style="font-size: 32px; margin-bottom: 8px;">🔖</div>
                    <div style="font-size: 14px; font-weight: 700;">لا توجد علامات مرجعية بعد</div>
                    <div style="font-size: 12px; margin-top: 4px;">اضغط على علامة 🔖 في أي آية لحفظها هنا</div>
                </div>
            `;
            return;
        }

        let html = '';
        bookmarks.forEach(bm => {
            html += `
                <div class="surah-list-item" onclick="QuranModule.loadSurah(${bm.surah}, ${bm.ayah})">
                    <div class="surah-item-right">
                        <div class="surah-number-circle" style="color: #e67e22; border-color: #e67e22;">📌</div>
                        <div>
                            <div class="surah-item-name">${bm.surahName}</div>
                            <div class="surah-item-english">الآية ${bm.ayah}</div>
                        </div>
                    </div>
                    <button class="ayah-action-btn" onclick="event.stopPropagation(); App.removeBookmarkItem(${bm.surah}, ${bm.ayah})" title="حذف العلامة">
                        🗑️
                    </button>
                </div>
            `;
        });

        container.innerHTML = html;
    },

    removeBookmarkItem(surah, ayah) {
        Storage.removeBookmark(surah, ayah);
        this.renderBookmarksList();
        this.showToast('تم حذف العلامة المرجعية');
        // Refresh ayah badge if currently visible
        const btn = document.getElementById(`bm-btn-${ayah}`);
        if (btn && QuranModule.currentSurahId === surah) {
            btn.classList.remove('bookmarked');
            btn.innerHTML = '🔖 علامة';
        }
    },

    showResumeBanner(lastRead) {
        const el = document.getElementById('resumeReadingBadge');
        if (el) {
            el.innerHTML = `📖 متابعة القراءة: ${lastRead.surahName} (الآية ${lastRead.ayah})`;
            el.style.display = 'inline-flex';
            el.onclick = () => QuranModule.loadSurah(lastRead.surah, lastRead.ayah);
        }
    },

    // Friday Al-Kahf Quick Jump
    openSurahKahf() {
        QuranModule.loadSurah(18);
        this.showToast('📖 سورة الكهف - نور ما بين الجمعتين');
    },

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.toggle('collapsed');
    },

    // ========================================================
    // TOAST NOTIFICATIONS
    // ========================================================
    showToast(message, duration = 3000) {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast-msg';
        toast.innerHTML = `<span>${message}</span>`;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    // ========================================================
    // GLOBAL EVENTS & KEYBOARD SHORTCUTS
    // ========================================================
    attachGlobalEvents() {
        document.addEventListener('keydown', (e) => {
            // Space to toggle audio (if not typing in input)
            if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
                e.preventDefault();
                PlayerModule.togglePlay();
            }
            // Escape to close drawers/modals
            if (e.code === 'Escape') {
                TafsirModule.closeTafsir();
                AdhkarModule.closeAdhkarReader();
                AdhkarModule.closeTasbihModal();
            }
        });
    },

    setupIPCListeners() {
        if (window.desktopAPI && window.desktopAPI.onNavigate) {
            window.desktopAPI.onNavigate((destination) => {
                if (destination === 'adhkar') {
                    AdhkarModule.openAdhkarReader('sabah');
                } else if (destination === 'kahf') {
                    this.openSurahKahf();
                }
            });
        }
    }
};

window.App = App;

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
