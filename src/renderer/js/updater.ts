// Client-Side Auto-Updater Module
import { Storage } from './storage';

export const UpdaterModule = {
    // Default update URL pointing to user's Google Drive version.json
    defaultUpdateUrl: 'https://drive.google.com/file/d/1VGk5RhhFpr5mftqdp8bYUvxzRgr5ldij/view?usp=drive_link',
    currentVersion: '1.0.1',
    latestInfo: null as any,
    isDownloading: false,

    async init(): Promise<void> {
        if (window.desktopAPI && window.desktopAPI.getAppVersion) {
            this.currentVersion = await window.desktopAPI.getAppVersion();
        }

        // Set version badge in UI
        const badge = document.getElementById('appVersionLabel');
        if (badge) badge.textContent = `v${this.currentVersion}`;

        // Populate update URL input in settings
        const input = document.getElementById('updateUrlInput') as HTMLInputElement | null;
        if (input) {
            input.value = this.getUpdateUrl();
        }

        // Setup download progress listener
        if (window.desktopAPI && window.desktopAPI.onDownloadProgress) {
            window.desktopAPI.onDownloadProgress((progress: any) => {
                this.updateDownloadProgress(progress);
            });
        }

        // Check for updates quietly 4 seconds after launch
        setTimeout(() => {
            this.checkForUpdates(false);
        }, 4000);

        // Background loop: check automatically every 20 minutes
        setInterval(() => {
            this.checkForUpdates(false);
        }, 20 * 60 * 1000);
    },

    getUpdateUrl(): string {
        const saved = Storage.get<string | null>('custom_update_url', null);
        return saved || this.defaultUpdateUrl;
    },

    setUpdateUrl(url: string): void {
        const trimmed = url.trim();
        Storage.set('custom_update_url', trimmed);
        const app = (window as any).App;
        if (app) app.showToast('✅ تم حفظ رابط التحديث');
    },

    async checkForUpdates(isManual: boolean = false): Promise<void> {
        const app = (window as any).App;
        if (!window.desktopAPI || !window.desktopAPI.checkForUpdates) {
            if (isManual && app) app.showToast('⚠️ خدمة التحديث تعمل داخل تطبيق سطح المكتب فقط');
            return;
        }

        const updateUrl = this.getUpdateUrl();
        if (!updateUrl) {
            if (isManual && app) app.showToast('⚠️ يرجى إدخال رابط التحديث أولاً في الإعدادات');
            return;
        }

        if (isManual && app) {
            app.showToast('🔍 جاري التحقق من وجود تحديثات...');
        }

        try {
            const res = await window.desktopAPI.checkForUpdates(updateUrl);
            if (!res.success) {
                if (isManual && app) {
                    app.showToast(`⚠️ تعذر فحص التحديث: ${res.error || 'خطأ في الاتصال'}`);
                }
                return;
            }

            if (res.hasUpdate) {
                this.latestInfo = res;
                this.showUpdateBanner(res);

                if (isManual) {
                    this.showUpdateModal(res);
                } else if (window.desktopAPI && window.desktopAPI.showNotification) {
                    // Notify desktop in background
                    window.desktopAPI.showNotification(
                        'القرآن الكريم',
                        `🎉 يتوفر تحديث جديد للتطبيق (v${res.latestVersion}) - اضغط للتثبيت`
                    );
                }
            } else {
                if (isManual && app) {
                    app.showToast(`✅ أنت تستخدم أحدث إصدار بالفعل (v${this.currentVersion})`);
                }
            }
        } catch (err) {
            console.error('Update check error:', err);
            if (isManual && app) app.showToast('⚠️ حدث خطأ أثناء التحقق من التحديث');
        }
    },

    showUpdateBanner(info: any): void {
        const banner = document.getElementById('updateTopBanner');
        const textEl = document.getElementById('updateBannerText');
        if (textEl) {
            textEl.innerHTML = `<i data-lucide="sparkles"></i> يتوفر تحديث جديد للمصحف الشريف (الإصدار v${info.latestVersion}) - اضغط للتحديث!`;
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons();
            }
        }
        if (banner) {
            banner.classList.add('visible');
        }
    },

    dismissTopBanner(): void {
        const banner = document.getElementById('updateTopBanner');
        if (banner) {
            banner.classList.remove('visible');
        }
    },

    openUpdateModal(): void {
        if (this.latestInfo) {
            this.showUpdateModal(this.latestInfo);
        } else {
            this.checkForUpdates(true);
        }
    },

    showUpdateModal(info: any): void {
        const modal = document.getElementById('updateModal');
        const verEl = document.getElementById('updateNewVersionLabel');
        const currentVerEl = document.getElementById('updateCurrentVersionLabel');
        const notesEl = document.getElementById('updateNotesBox');
        const progressBox = document.getElementById('updateProgressSection');
        const actionsBox = document.getElementById('updateActionsSection');

        if (verEl) verEl.textContent = `الإصدار الجديد: v${info.latestVersion}`;
        if (currentVerEl) currentVerEl.textContent = `إصدارك الحالي: v${info.currentVersion}`;
        if (notesEl) {
            notesEl.innerHTML = info.changelog 
                ? `<div style="white-space: pre-wrap;">${info.changelog}</div>` 
                : 'يتضمن هذا التحديث تحسينات في الأداء وإصلاحات عامة.';
        }

        if (progressBox) progressBox.style.display = 'none';
        if (actionsBox) actionsBox.style.display = 'flex';

        if (modal) modal.classList.add('open');
    },

    closeUpdateModal(): void {
        if (this.isDownloading) return; // prevent closing during download
        const modal = document.getElementById('updateModal');
        if (modal) modal.classList.remove('open');
    },

    async startDownload(): Promise<void> {
        const app = (window as any).App;
        if (!this.latestInfo || !this.latestInfo.downloadUrl) {
            if (app) app.showToast('⚠️ رابط تحميل التحديث غير متوفر');
            return;
        }

        this.isDownloading = true;
        const progressBox = document.getElementById('updateProgressSection');
        const actionsBox = document.getElementById('updateActionsSection');

        if (actionsBox) actionsBox.style.display = 'none';
        if (progressBox) progressBox.style.display = 'block';

        this.updateDownloadProgress({ percent: 0, receivedBytes: 0, totalBytes: 0 });

        try {
            const res = await window.desktopAPI!.downloadUpdate(this.latestInfo.downloadUrl);
            if (!res.success) {
                this.isDownloading = false;
                if (actionsBox) actionsBox.style.display = 'flex';
                if (progressBox) progressBox.style.display = 'none';
                if (app) app.showToast(`⚠️ تعذر التحميل التلقائي: ${res.error || ''} - جاري فتح التحميل في المتصفح`);
                this.openDownloadInBrowser();
            }
        } catch (err) {
            this.isDownloading = false;
            if (actionsBox) actionsBox.style.display = 'flex';
            if (progressBox) progressBox.style.display = 'none';
            if (app) app.showToast('⚠️ جاري فتح التحميل في المتصفح...');
            this.openDownloadInBrowser();
        }
    },

    updateDownloadProgress({ percent, receivedBytes, totalBytes }: { percent: number; receivedBytes: number; totalBytes: number }): void {
        const fill = document.getElementById('updateProgressFill');
        const percentLabel = document.getElementById('updateProgressPercent');
        const bytesLabel = document.getElementById('updateProgressBytes');

        if (fill) fill.style.width = `${percent}%`;
        if (percentLabel) percentLabel.textContent = `${percent}%`;

        if (bytesLabel && totalBytes > 0) {
            const mbReceived = (receivedBytes / (1024 * 1024)).toFixed(1);
            const mbTotal = (totalBytes / (1024 * 1024)).toFixed(1);
            bytesLabel.textContent = `${mbReceived} MB / ${mbTotal} MB`;
        }
    },

    openDownloadInBrowser(): void {
        if (this.latestInfo && this.latestInfo.downloadUrl && window.desktopAPI && window.desktopAPI.openExternalUrl) {
            window.desktopAPI.openExternalUrl(this.latestInfo.downloadUrl);
            this.closeUpdateModal();
        }
    }
};

(window as any).UpdaterModule = UpdaterModule;
