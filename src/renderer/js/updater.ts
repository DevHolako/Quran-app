// Client-Side Auto-Updater Module
import { Storage } from './storage';
import { escapeHtml, setTextContentPreservingWrapper } from './dom';

// Version of the running bundle, injected by the build banner in
// scripts/build-android.js. A hardcoded literal here goes stale the moment a new
// build is installed: after updating to 1.0.5 the app would still report 1.0.4 and
// keep advertising 1.0.5 as an available update. Desktop overrides this at init via
// desktopAPI.getAppVersion(); on Android there is no such API, so this is the source.
const BUNDLED_VERSION: string = ((window as any).__APP_VERSION__ as string) || '0.0.0';

export const UpdaterModule = {
    // Desktop manifest on GitHub main branch
    defaultUpdateUrl: 'https://raw.githubusercontent.com/DevHolako/Quran-app/main/version.json',
    // Android has its own manifest; Platform.defaultUpdateUrl carries the URL baked in
    // from update-channel.json at build time.
    currentVersion: BUNDLED_VERSION,
    latestInfo: null as any,
    isDownloading: false,
    isChecking: false,

    /** Six hours. Frequent enough to catch a release, rare enough to spare battery. */
    autoCheckIntervalMs: 6 * 60 * 60 * 1000,

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
            input.value = Storage.get<string | null>('custom_update_url', '') || '';
            input.onchange = () => this.setUpdateUrl(input.value);
        }

        // Setup download progress listener
        if (window.desktopAPI && window.desktopAPI.onDownloadProgress) {
            window.desktopAPI.onDownloadProgress((progress: any) => {
                this.updateDownloadProgress(progress);
            });
        }

        // Quiet check a few seconds after launch, and again every time the app comes
        // back to the foreground. No update channel configured means no polling.
        this.startAutoChecks();
    },

    /**
     * Android will not install an APK in the background: outside the Play Store a
     * normal app cannot update itself without the user confirming in the system
     * installer. So "automatic" here means automatic *detection* and *download*,
     * with a single tap left to the user. A background job would not help, because
     * the install step is the part the platform forbids.
     */
    startAutoChecks(): void {
        // Deliberately not gated on getUpdateUrl(): when it was, a build shipped with
        // no channel never registered its listeners at all, so configuring a URL later
        // did nothing until the next restart. autoCheck() re-reads the URL every time
        // and no-ops cheaply when there is still none.
        setTimeout(() => this.autoCheck(), 4000);

        // Coming back to the foreground is the other moment a user is actually
        // waiting, and it catches an app that was left open for days.
        const capacitor = (window as any).Capacitor;
        const appPlugin = capacitor && capacitor.Plugins && capacitor.Plugins.App;
        if (appPlugin && typeof appPlugin.addListener === 'function') {
            appPlugin.addListener('appStateChange', (state: any) => {
                if (state && state.isActive) this.autoCheck();
            });
        }
    },

    /**
     * Runs a quiet check, at most once per interval.
     *
     * The timestamp is only written once a check has actually reached the manifest.
     * Recording it up front would mean a launch with no network, or a build shipped
     * without a channel, burned the whole window and left the install without an
     * update check for six hours.
     */
    async autoCheck(): Promise<void> {
        if (this.isChecking || this.isDownloading) return;

        const last = Storage.get<number>('last_update_check', 0) || 0;
        if (Date.now() - last < this.autoCheckIntervalMs) return;

        this.isChecking = true;
        try {
            if (await this.checkForUpdates(false)) {
                Storage.set('last_update_check', Date.now());
            }
        } finally {
            this.isChecking = false;
        }
    },

    getUpdateUrl(): string {
        const saved = Storage.get<string | null>('custom_update_url', null);
        if (saved) return saved;
        const platform = (window as any).Platform;
        if (platform) {
            // Android must not poll the desktop manifest: it points at a .exe. An empty
            // result is not a dead end: checkForUpdates() then discovers the channel at
            // runtime, which is the default path now that no URL needs to ship in the APK.
            return platform.name === 'android'
                ? (platform.defaultUpdateUrl || '')
                : this.defaultUpdateUrl;
        }
        return this.defaultUpdateUrl;
    },

    /** True when a check should run even without a configured URL. */
    hasChannel(): boolean {
        if (this.getUpdateUrl()) return true;
        const platform = (window as any).Platform;
        // Android always has a discoverable channel; desktop needs an explicit URL.
        return !!platform && platform.name === 'android';
    },

    setUpdateUrl(url: string): void {
        const trimmed = url.trim();
        Storage.set('custom_update_url', trimmed);
        const app = (window as any).App;
        if (app) app.showToast(trimmed ? '✅ تم حفظ رابط التحديث' : '✅ تم مسح رابط التحديث المخصص');
    },

    /**
     * Performs one update check.
     *
     * Returns whether the check actually reached the manifest. The caller uses this
     * to decide if the retry window may be closed: this method reports its own errors
     * and never rejects, so a bare `await` here would mark a failed launch — offline
     * device, unreachable Drive, no channel configured yet — as a completed check.
     */
    async checkForUpdates(isManual: boolean = false): Promise<boolean> {
        const app = (window as any).App;
        if (!window.desktopAPI || !window.desktopAPI.checkForUpdates) {
            if (isManual && app) app.showToast('⚠️ خدمة التحديث تعمل داخل تطبيق سطح المكتب فقط');
            return false;
        }

        const updateUrl = this.getUpdateUrl();
        if (!updateUrl && !this.hasChannel()) {
            const platform = (window as any).Platform;
            if (isManual && app) {
                app.showToast('⚠️ يرجى إدخال رابط التحديث أولاً في الإعدادات');
            }
            return false;
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
                return false;
            }

            if (res.hasUpdate) {
                this.latestInfo = res;

                // A dismissed banner stays dismissed for that exact version, so
                // resuming the app does not put it back on screen every time. A
                // genuinely newer release carries a different number and clears it.
                const dismissed = Storage.get<string | null>('update_banner_dismissed', null);
                if (dismissed !== String(res.latestVersion)) {
                    this.showUpdateBanner(res);
                }

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
            return true;
        } catch (err) {
            console.error('Update check error:', err);
            if (isManual && app) app.showToast('⚠️ حدث خطأ أثناء التحقق من التحديث');
            return false;
        }
    },

    showUpdateBanner(info: any): void {
        const banner = document.getElementById('updateTopBanner');
        const textEl = document.getElementById('updateBannerText');
        if (textEl) {
            // latestVersion comes from the remote update manifest, so it is escaped
            // before being dropped alongside the icon markup.
            textEl.innerHTML = `<i data-lucide="sparkles"></i> يتوفر تحديث جديد للمصحف الشريف (الإصدار v${escapeHtml(info.latestVersion)}) - اضغط للتحديث!`;
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
        if (this.latestInfo) {
            Storage.set('update_banner_dismissed', String(this.latestInfo.latestVersion));
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
            // The changelog is whatever the remote manifest says it is, so it is shown
            // as text. The wrapper div is kept because it owns the white-space: pre-wrap
            // that makes the plain-text line breaks render.
            if (info.changelog) {
                setTextContentPreservingWrapper(notesEl, '', info.changelog);
                const wrapper = notesEl.firstElementChild as HTMLElement | null;
                if (wrapper) wrapper.style.whiteSpace = 'pre-wrap';
            } else {
                notesEl.textContent = 'يتضمن هذا التحديث تحسينات في الأداء وإصلاحات عامة.';
            }
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
                if (app) app.showToast(`⚠️ تعذر التحميل: ${res.error || 'فشل التنزيل'}`);
            } else if (res.needsPermission) {
                this.isDownloading = false;
                if (actionsBox) actionsBox.style.display = 'flex';
                if (progressBox) progressBox.style.display = 'none';
                if (app) app.showToast('✅ تم تنزيل التحديث بنجاح! يرجى السماح بتثبيت التطبيقات من الإعدادات ثم العودة لإتمام التثبيت', 8000);
            } else {
                this.isDownloading = false;
                this.closeUpdateModal();
            }
        } catch (err: any) {
            this.isDownloading = false;
            if (actionsBox) actionsBox.style.display = 'flex';
            if (progressBox) progressBox.style.display = 'none';
            if (app) app.showToast(`⚠️ حدث خطأ أثناء تحميل التحديث: ${err?.message || ''}`);
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
