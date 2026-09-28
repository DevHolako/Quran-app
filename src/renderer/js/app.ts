// Main Application Bootstrap & UI Controller
import type { FullBackupData, LastReadState } from '../../types/quran';
import { Storage } from './storage';
import { SURAHS_DATA } from './quran-data';
import { QuranModule } from './quran';
import { PlayerModule } from './player';
import { TafsirModule } from './tafsir';
import { AdhkarModule } from './adhkar';
import { UpdaterModule } from './updater';

export const App = {
    currentTheme: 'emerald',

    async init(): Promise<void> {
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
        this.initLucide();
    },

    initLucide(): void {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    },

    setTheme(themeName: string): void {
        this.currentTheme = themeName;
        document.body.setAttribute('data-theme', themeName);
        Storage.saveSettings({ theme: themeName });

        const themeBtn = document.getElementById('btnThemeToggle');
        if (themeBtn) {
            if (themeName === 'dark') themeBtn.innerHTML = '<i data-lucide="moon"></i>';
            else if (themeName === 'sepia') themeBtn.innerHTML = '<i data-lucide="file-text"></i>';
            else themeBtn.innerHTML = '<i data-lucide="palette"></i>';
            this.initLucide();
        }
    },

    cycleTheme(): void {
        const themes = ['emerald', 'dark', 'sepia'];
        const nextIdx = (themes.indexOf(this.currentTheme) + 1) % themes.length;
        this.setTheme(themes[nextIdx]);
        const names: Record<string, string> = { emerald: 'الزمردي الكلاسيكي', dark: 'الوضع الليلي الفاخر', sepia: 'ورق المصحف الدافئ' };
        this.showToast(`🎨 تم تفعيل ${names[themes[nextIdx]]}`);
    },

    // ========================================================
    // SIDEBAR SURAHS LIST & SEARCH
    // ========================================================
    renderSurahList(filterQuery: string = ''): void {
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

    filterSurahs(query: string): void {
        this.renderSurahList(query);
    },

    switchSidebarTab(tabName: string): void {
        document.querySelectorAll('.sidebar-tab').forEach(t => {
            const htmlTab = t as HTMLElement;
            t.classList.toggle('active', htmlTab.dataset.tab === tabName);
        });

        const surahView = document.getElementById('sidebarSurahView');
        const bookmarksView = document.getElementById('sidebarBookmarksView');
        const settingsView = document.getElementById('sidebarSettingsView');

        if (surahView) surahView.style.display = tabName === 'surahs' ? 'block' : 'none';
        if (bookmarksView) bookmarksView.style.display = tabName === 'bookmarks' ? 'block' : 'none';
        if (settingsView) settingsView.style.display = tabName === 'settings' ? 'block' : 'none';

        if (tabName === 'bookmarks') {
            this.renderBookmarksList();
        }
    },

    renderBookmarksList(): void {
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

    removeBookmarkItem(surah: number, ayah: number): void {
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

    showResumeBanner(lastRead: LastReadState): void {
        const el = document.getElementById('resumeReadingBadge');
        if (el) {
            el.innerHTML = `📖 متابعة القراءة: ${lastRead.surahName} (الآية ${lastRead.ayah})`;
            el.style.display = 'inline-flex';
            el.onclick = () => QuranModule.loadSurah(lastRead.surah, lastRead.ayah);
        }
    },

    // Friday Al-Kahf Quick Jump
    openSurahKahf(): void {
        QuranModule.loadSurah(18);
        this.showToast('📖 سورة الكهف - نور ما بين الجمعتين');
    },

    toggleSidebar(): void {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.toggle('collapsed');
    },

    // ========================================================
    // BACKUP & SYNC (Google Drive & Local File)
    // ========================================================
    createFullBackupData(): FullBackupData {
        return {
            app: 'QuranAppDesktop',
            version: '1.0.4',
            timestamp: new Date().toISOString(),
            settings: Storage.getSettings(),
            bookmarks: Storage.getBookmarks(),
            lastRead: Storage.getLastRead(),
            adhkar: Storage.get('custom_adhkar_data', null),
            tasbihTarget: Storage.get('tasbih_target', 33)
        };
    },

    exportBackupFile(): void {
        const data = this.createFullBackupData();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().slice(0, 10);
        a.download = `quran_app_backup_${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showToast('✅ تم تصدير النسخة الاحتياطية بنجاح');
    },

    importBackupFile(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input && input.files ? input.files[0] : null;
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target?.result as string);
                if (data.settings) Storage.saveSettings(data.settings);
                if (data.bookmarks) Storage.set('quran_bookmarks', data.bookmarks);
                if (data.lastRead) Storage.set('quran_last_read', data.lastRead);
                if (data.adhkar) Storage.set('custom_adhkar_data', data.adhkar);
                if (data.tasbihTarget) Storage.set('tasbih_target', data.tasbihTarget);

                this.showToast('✅ تم استعادة بياناتك وأذكارك وإعداداتك بنجاح!');
                setTimeout(() => location.reload(), 1200);
            } catch (err) {
                this.showToast('⚠️ ملف النسخة الاحتياطية غير صالح');
            }
        };
        reader.readAsText(file);
    },

    backupToGoogleDrive(): void {
        this.exportBackupFile();
        if (window.desktopAPI && window.desktopAPI.openExternalUrl) {
            window.desktopAPI.openExternalUrl('https://drive.google.com/drive/my-drive');
        }
        this.showToast('☁️ تم حفظ ملف النسخ الاحتياطي، وتم فتح Google Drive لحفظه!');
    },

    // ========================================================
    // TOAST NOTIFICATIONS
    // ========================================================
    showToast(message: string, duration: number = 3000): void {
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
    attachGlobalEvents(): void {
        document.addEventListener('keydown', (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            // Space to toggle audio (if not typing in input)
            if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(target.tagName)) {
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

    setupIPCListeners(): void {
        if (window.desktopAPI && window.desktopAPI.onNavigate) {
            window.desktopAPI.onNavigate((destination: string) => {
                if (destination === 'adhkar') {
                    AdhkarModule.openAdhkarReader('sabah');
                } else if (destination === 'kahf') {
                    this.openSurahKahf();
                }
            });
        }
    }
};

(window as any).App = App;

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
