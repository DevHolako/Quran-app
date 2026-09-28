// Audio Player Engine with Official Quran.com API Timings & Smooth Calibration Slider
import type { AyahTiming, Verse } from '../../types/quran';
import { Storage } from './storage';

export const PlayerModule = {
    audio: null as unknown as HTMLAudioElement,
    isPlaying: false,
    currentSurah: 1,
    currentReciter: 'alafasy',
    ayahTimings: [] as AyahTiming[],
    lastActiveAyah: -1,
    scrollAnimId: null as number | null,

    // Timing Calibration Offset (seconds, e.g. -0.3s to +0.3s)
    timingOffset: 0.0,
    timingCache: {} as Record<string, { audioUrl: string; timestamps: any[] }>,

    // My Recitation Mode
    isMyRecitation: false,
    myRecitationAnimId: null as number | null,
    myRecitationSpeed: 3,

    // Reciters mapping: with official Quran.com API IDs for exact millisecond verse timings
    reciters: {
        'alafasy': {
            label: 'مشاري راشد العفاسي',
            quranComId: 7,
            introIstiadha: 3.5,
            introBasmala: 4.2,
            sources: [
                { baseUrl: 'https://server8.mp3quran.net/afs', ext: '.mp3' },
                { baseUrl: 'https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy', ext: '.mp3' }
            ]
        },
        'sudais': {
            label: 'عبد الرحمن السديس',
            quranComId: 3,
            introIstiadha: 3.0,
            introBasmala: 3.8,
            sources: [
                { baseUrl: 'https://server11.mp3quran.net/sds', ext: '.mp3' }
            ]
        },
        'shuraim': {
            label: 'سعود الشريم',
            quranComId: 10,
            introIstiadha: 2.9,
            introBasmala: 3.4,
            sources: [
                { baseUrl: 'https://server6.mp3quran.net/shur', ext: '.mp3' }
            ]
        },
        'abdulbaset': {
            label: 'عبد الباسط عبد الصمد (مرتل)',
            quranComId: 2,
            introIstiadha: 3.2,
            introBasmala: 4.0,
            sources: [
                { baseUrl: 'https://server7.mp3quran.net/basit', ext: '.mp3' }
            ]
        },
        'minshawi': {
            label: 'محمد صديق المنشاوي (مرتل)',
            quranComId: 9,
            introIstiadha: 3.2,
            introBasmala: 4.0,
            sources: [
                { baseUrl: 'https://server10.mp3quran.net/minsh', ext: '.mp3' }
            ]
        },
        'husary': {
            label: 'محمود خليل الحصري',
            quranComId: 6,
            introIstiadha: 3.2,
            introBasmala: 4.0,
            sources: [
                { baseUrl: 'https://server13.mp3quran.net/husr', ext: '.mp3' }
            ]
        },
        'shatri': {
            label: 'أبو بكر الشاطري',
            quranComId: 4,
            introIstiadha: 3.0,
            introBasmala: 3.8,
            sources: [
                { baseUrl: 'https://server11.mp3quran.net/shatri', ext: '.mp3' }
            ]
        },
        'ghamadi': {
            label: 'سعد الغامدي',
            quranComId: null,
            introIstiadha: 3.2,
            introBasmala: 3.9,
            sources: [
                { baseUrl: 'https://server7.mp3quran.net/s_gmd', ext: '.mp3' }
            ]
        }
    } as Record<string, { label: string; quranComId: number | null; introIstiadha: number; introBasmala: number; sources: Array<{ baseUrl: string; ext: string }> }>,

    init(): void {
        this.audio = new Audio();
        const settings = Storage.getSettings();
        this.currentReciter = settings.reciter || 'alafasy';
        this.audio.volume = settings.volume !== undefined ? settings.volume : 1.0;
        this.myRecitationSpeed = settings.myRecitationSpeed || 3;
        this.timingOffset = settings.timingOffset !== undefined ? settings.timingOffset : 0.0;

        this.attachAudioEvents();
        this.updatePlayerUI();
        this.updateTimingOffsetUI();

        // Close popover when clicking outside
        document.addEventListener('click', (e: MouseEvent) => {
            const control = document.getElementById('syncOffsetControl');
            const popover = document.getElementById('syncOffsetPopover');
            if (popover && popover.classList.contains('open') && control && !control.contains(e.target as Node)) {
                popover.classList.remove('open');
                const btn = document.getElementById('toggleSyncOffsetBtn');
                if (btn) btn.classList.remove('active');
            }
        });
    },

    attachAudioEvents(): void {
        this.audio.addEventListener('timeupdate', () => this.onTimeUpdate());
        this.audio.addEventListener('loadedmetadata', () => this.onMetadataLoaded());
        this.audio.addEventListener('ended', () => this.onTrackEnded());
        this.audio.addEventListener('play', () => {
            this.isPlaying = true;
            this.updatePlayBtn(true);
            this.startScrollTracking();
        });
        this.audio.addEventListener('pause', () => {
            this.isPlaying = false;
            this.updatePlayBtn(false);
            this.stopScrollTracking();
        });
    },

    // 1. Fetch Official Verse Timings from Quran.com API
    async fetchQuranComTimings(quranComId: number, surahId: number): Promise<{ audioUrl: string; timestamps: any[] } | null> {
        const cacheKey = `${quranComId}_${surahId}`;
        if (this.timingCache[cacheKey]) {
            return this.timingCache[cacheKey];
        }

        try {
            const res = await fetch(`https://api.quran.com/api/v4/chapter_recitations/${quranComId}/${surahId}?segments=true`);
            if (!res.ok) throw new Error(`HTTP status ${res.status}`);
            const data = await res.json();
            if (data && data.audio_file && Array.isArray(data.audio_file.timestamps) && data.audio_file.timestamps.length > 0) {
                const result = {
                    audioUrl: data.audio_file.audio_url,
                    timestamps: data.audio_file.timestamps
                };
                this.timingCache[cacheKey] = result;
                return result;
            }
        } catch (err) {
            console.warn(`[Quran.com API] Failed to fetch recitation timings for reciter ${quranComId}, surah ${surahId}:`, err);
        }
        return null;
    },

    async loadTimingsForSurah(surahId: number): Promise<void> {
        const reciterData = this.reciters[this.currentReciter];
        if (reciterData && reciterData.quranComId) {
            const apiData = await this.fetchQuranComTimings(reciterData.quranComId, surahId);
            if (apiData && apiData.timestamps) {
                this.applyOfficialTimings(apiData.timestamps);
                return;
            }
        }
        // Fallback calculation for reciters without official segment data or when offline
        this.calculateAyahTimings();
    },

    applyOfficialTimings(timestamps: any[]): void {
        const ayahElements = document.querySelectorAll('[data-ayah]');
        this.ayahTimings = [];

        timestamps.forEach((t: any, i: number) => {
            const parts = t.verse_key ? t.verse_key.split(':') : [null, i + 1];
            const ayahNum = parseInt(parts[1], 10) || (i + 1);
            const el = (document.getElementById(`ayah-${ayahNum}`) || ayahElements[i]) as HTMLElement | null;

            const startSec = (t.timestamp_from || 0) / 1000;
            const endSec = (t.timestamp_to || 0) / 1000;
            const durationSec = Math.abs(endSec - startSec);

            this.ayahTimings.push({
                index: i,
                ayahNum: ayahNum,
                startTime: startSec,
                endTime: endSec > startSec ? endSec : startSec + Math.max(durationSec, 2),
                duration: durationSec,
                element: el
            });
        });

        this.lastActiveAyah = -1;
    },

    async onSurahLoaded(surahId: number, _verses?: Verse[]): Promise<void> {
        this.currentSurah = surahId;
        const quranMod = (window as any).QuranModule;
        const surahInfo = quranMod ? quranMod.getSurahInfo(surahId) : { name: `سورة ${surahId}` };
        const titleEl = document.getElementById('playerTrackSurah');
        if (titleEl) titleEl.textContent = `سورة ${surahInfo.name}`;

        // Preload timings in background so ayah click jumps immediately work
        await this.loadTimingsForSurah(surahId);

        if (this.isPlaying) {
            await this.playSurah(this.currentSurah);
        }
    },

    async togglePlay(): Promise<void> {
        if (this.isMyRecitation) {
            this.stopMyRecitation();
        }

        if (this.isPlaying) {
            this.audio.pause();
        } else {
            await this.playSurah(this.currentSurah);
        }
    },

    async playSurah(surahId: number): Promise<void> {
        this.currentSurah = surahId;
        const reciterData = this.reciters[this.currentReciter];
        if (!reciterData) return;

        this.updatePlayBtn('loading');

        let audioUrl = '';
        let officialTimings: any[] | null = null;

        // 1. Try Quran.com Official API (with exact millisecond timestamps)
        if (reciterData.quranComId) {
            const apiData = await this.fetchQuranComTimings(reciterData.quranComId, surahId);
            if (apiData) {
                audioUrl = apiData.audioUrl;
                officialTimings = apiData.timestamps;
            }
        }

        let success = false;
        if (audioUrl) {
            try {
                this.audio.src = audioUrl;
                await this.audio.play();
                success = true;
                if (officialTimings) {
                    this.applyOfficialTimings(officialTimings);
                }
            } catch (e) {
                console.warn('[Audio] Failed to stream from Quran.com audio, falling back to static CDN:', e);
            }
        }

        // 2. Static CDN Fallback if official API stream fails or reciter is not on Quran.com
        if (!success) {
            const paddedSurah = String(surahId).padStart(3, '0');
            for (let i = 0; i < reciterData.sources.length; i++) {
                const src = reciterData.sources[i];
                const fallbackUrl = `${src.baseUrl}/${paddedSurah}${src.ext}`;
                try {
                    this.audio.src = fallbackUrl;
                    await this.audio.play();
                    success = true;
                    this.calculateAyahTimings();
                    break;
                } catch (err) {
                    console.warn(`Source ${i + 1} failed for ${this.currentReciter}:`, err);
                }
            }
        }

        if (!success) {
            this.updatePlayBtn(false);
            const app = (window as any).App;
            if (app) app.showToast('⚠️ تعذر تشغيل التلاوة. جرب قارئاً آخر.');
        }
    },

    getIntroTimings(surahId: number): { istiadhaDuration: number; basmalaDuration: number; totalIntro: number } {
        const reciter = this.reciters[this.currentReciter] || this.reciters['alafasy'];
        const istiadhaDuration = reciter.introIstiadha || 3.5;
        let basmalaDuration = 0;
        if (surahId !== 1 && surahId !== 9) {
            basmalaDuration = reciter.introBasmala || 4.0;
        }
        const totalIntro = istiadhaDuration + basmalaDuration;
        return { istiadhaDuration, basmalaDuration, totalIntro };
    },

    onMetadataLoaded(): void {
        if (this.ayahTimings.length === 0) {
            this.calculateAyahTimings();
        }
        this.updateTimeDisplay();
    },

    // Proportional fallback timing for offline / non-segmented reciters
    calculateAyahTimings(): void {
        const duration = this.audio.duration;
        if (!duration || isNaN(duration)) return;

        const ayahElements = document.querySelectorAll('[data-ayah]');
        if (ayahElements.length === 0) return;

        const { istiadhaDuration, basmalaDuration, totalIntro } = this.getIntroTimings(this.currentSurah);

        const lengths: number[] = [];
        let totalLength = 0;

        ayahElements.forEach(el => {
            const text = el.textContent || '';
            const cleanText = text.replace(/[\u064B-\u0652\u0670\u06D6-\u06ED]/g, '');
            const len = cleanText.length || 1;
            lengths.push(len);
            totalLength += len;
        });

        const versesDuration = Math.max(1, duration - totalIntro);
        this.ayahTimings = [];
        let accumulated = totalIntro;

        ayahElements.forEach((el, i) => {
            const share = (lengths[i] / totalLength) * versesDuration;
            this.ayahTimings.push({
                index: i,
                ayahNum: i + 1,
                startTime: accumulated,
                endTime: accumulated + share,
                duration: share,
                element: el as HTMLElement
            });
            accumulated += share;
        });

        this.lastActiveAyah = -1;
    },

    onTimeUpdate(): void {
        if (!this.audio.duration) return;
        const percent = (this.audio.currentTime / this.audio.duration) * 100;
        const fillEl = document.getElementById('playerProgressFill');
        if (fillEl) fillEl.style.width = `${percent}%`;

        this.updateTimeDisplay();
    },

    startScrollTracking(): void {
        this.stopScrollTracking();
        const tick = () => {
            if (this.audio.paused || this.audio.ended) {
                this.scrollAnimId = null;
                return;
            }

            const t = this.audio.currentTime;
            // Apply user's smooth timing calibration offset
            const effectiveTime = t + (this.timingOffset || 0);

            if (this.ayahTimings.length > 0) {
                const firstStart = this.ayahTimings[0].startTime;

                if (effectiveTime < firstStart && firstStart > 1.5) {
                    const { istiadhaDuration } = this.getIntroTimings(this.currentSurah);
                    if (effectiveTime < istiadhaDuration) {
                        this.highlightIntro('istiadha');
                    } else {
                        this.highlightIntro('basmala');
                    }
                } else {
                    this.clearIntroHighlight();
                    const active = this.ayahTimings.find(x => effectiveTime >= x.startTime && effectiveTime < x.endTime);
                    if (active && active.index !== this.lastActiveAyah) {
                        this.lastActiveAyah = active.index;
                        this.highlightActiveAyah(active.ayahNum);
                    }
                }
            }

            this.scrollAnimId = requestAnimationFrame(tick);
        };
        this.scrollAnimId = requestAnimationFrame(tick);
    },

    stopScrollTracking(): void {
        if (this.scrollAnimId) {
            cancelAnimationFrame(this.scrollAnimId);
            this.scrollAnimId = null;
        }
    },

    highlightIntro(type: 'istiadha' | 'basmala'): void {
        document.querySelectorAll('.active-ayah').forEach(el => el.classList.remove('active-ayah'));
        this.lastActiveAyah = -1;

        const istiadhaEl = document.getElementById('istiadhaBanner');
        const basmalaEl = document.getElementById('basmalaBanner');

        if (type === 'istiadha') {
            if (istiadhaEl) {
                istiadhaEl.classList.add('active-intro');
                istiadhaEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            if (basmalaEl) basmalaEl.classList.remove('active-intro');
        } else if (type === 'basmala') {
            if (basmalaEl) {
                basmalaEl.classList.add('active-intro');
                basmalaEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            if (istiadhaEl) istiadhaEl.classList.remove('active-intro');
        }
    },

    clearIntroHighlight(): void {
        const istiadhaEl = document.getElementById('istiadhaBanner');
        const basmalaEl = document.getElementById('basmalaBanner');
        if (istiadhaEl) istiadhaEl.classList.remove('active-intro');
        if (basmalaEl) basmalaEl.classList.remove('active-intro');
    },

    seekToIntro(type: 'istiadha' | 'basmala'): void {
        const { istiadhaDuration } = this.getIntroTimings(this.currentSurah);
        if (type === 'istiadha') {
            this.audio.currentTime = 0;
            this.highlightIntro('istiadha');
        } else if (type === 'basmala') {
            this.audio.currentTime = istiadhaDuration;
            this.highlightIntro('basmala');
        }
        if (!this.isPlaying) {
            this.audio.play();
        }
    },

    async seekToAyah(ayahNum: number): Promise<void> {
        if (this.ayahTimings.length === 0) {
            await this.loadTimingsForSurah(this.currentSurah);
        }

        const timing = this.ayahTimings.find(x => x.ayahNum === ayahNum);
        if (timing) {
            if (!this.audio.src || this.audio.src === '' || this.audio.src === window.location.href) {
                await this.playSurah(this.currentSurah);
            }
            this.audio.currentTime = timing.startTime;
            this.highlightActiveAyah(ayahNum);
            if (!this.isPlaying) {
                await this.audio.play();
            }
        }
    },

    highlightActiveAyah(ayahNum: number): void {
        this.clearIntroHighlight();
        document.querySelectorAll('.active-ayah').forEach(el => el.classList.remove('active-ayah'));
        const el = document.getElementById(`ayah-${ayahNum}`);
        if (el) {
            el.classList.add('active-ayah');
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    },

    seek(event: MouseEvent): void {
        if (!this.audio.duration) return;
        const container = document.getElementById('progressBarContainer');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        // Since RTL: right side is 0%
        const clickX = event.clientX - rect.left;
        const ratio = 1 - (clickX / rect.width);
        this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, ratio * this.audio.duration));

        // Immediately reflect seeked position in highlight
        const t = this.audio.currentTime;
        const effectiveTime = t + (this.timingOffset || 0);

        if (this.ayahTimings.length > 0) {
            const active = this.ayahTimings.find(x => effectiveTime >= x.startTime && effectiveTime < x.endTime);
            if (active) {
                this.clearIntroHighlight();
                this.lastActiveAyah = active.index;
                this.highlightActiveAyah(active.ayahNum);
            }
        }
    },

    skip(seconds: number): void {
        if (!this.audio.duration) return;
        this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, this.audio.currentTime + seconds));
    },

    nextSurah(): void {
        if (this.currentSurah < 114) {
            const quranMod = (window as any).QuranModule;
            if (quranMod) quranMod.loadSurah(this.currentSurah + 1);
        }
    },

    prevSurah(): void {
        if (this.currentSurah > 1) {
            const quranMod = (window as any).QuranModule;
            if (quranMod) quranMod.loadSurah(this.currentSurah - 1);
        }
    },

    onTrackEnded(): void {
        if (this.currentSurah < 114) {
            this.nextSurah();
        } else {
            this.isPlaying = false;
            this.updatePlayBtn(false);
        }
    },

    async setReciter(reciterId: string): Promise<void> {
        this.currentReciter = reciterId;
        Storage.saveSettings({ reciter: reciterId });
        await this.loadTimingsForSurah(this.currentSurah);
        if (this.isPlaying) {
            await this.playSurah(this.currentSurah);
        }
    },

    setVolume(val: number | string): void {
        const num = typeof val === 'string' ? parseFloat(val) : val;
        this.audio.volume = num;
        Storage.saveSettings({ volume: num });
    },

    // ========================================================
    // SMOOTH TIMING OFFSET SLIDER & POPUP
    // ========================================================
    setTimingOffset(val: number | string): void {
        const num = typeof val === 'string' ? parseFloat(val) : val;
        this.timingOffset = Math.round(num * 10) / 10;
        Storage.saveSettings({ timingOffset: this.timingOffset });
        this.updateTimingOffsetUI();
    },

    resetTimingOffset(): void {
        this.setTimingOffset(0);
        const app = (window as any).App;
        if (app) app.showToast('⏱️ تم إعادة ضبط مزامنة التظليل إلى الوضع التلقائي');
    },

    updateTimingOffsetUI(): void {
        const offset = this.timingOffset || 0;
        const text = offset === 0
            ? '0.0 ث (تلقائي)'
            : `${offset > 0 ? '+' : ''}${offset.toFixed(1)} ث (${offset > 0 ? 'تقديم' : 'تأخير'})`;

        // Update player popover slider & badge
        const slider = document.getElementById('timingOffsetSlider') as HTMLInputElement | null;
        if (slider) slider.value = String(offset);
        const badge = document.getElementById('timingOffsetValueBadge');
        if (badge) badge.textContent = text;

        // Update settings sidebar slider & badge
        const settingsSlider = document.getElementById('settingsTimingOffsetSlider') as HTMLInputElement | null;
        if (settingsSlider) settingsSlider.value = String(offset);
        const settingsBadge = document.getElementById('settingsTimingOffsetBadge');
        if (settingsBadge) settingsBadge.textContent = `${offset > 0 ? '+' : ''}${offset.toFixed(1)} ث`;
    },

    toggleSyncOffsetPopover(): void {
        const popover = document.getElementById('syncOffsetPopover');
        const btn = document.getElementById('toggleSyncOffsetBtn');
        if (popover) {
            popover.classList.toggle('open');
            if (btn) btn.classList.toggle('active', popover.classList.contains('open'));
        }
    },

    formatTime(sec: number): string {
        if (isNaN(sec)) return '00:00';
        const mins = Math.floor(sec / 60);
        const secs = Math.floor(sec % 60);
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    },

    updateTimeDisplay(): void {
        const curEl = document.getElementById('playerTimeCurrent');
        const durEl = document.getElementById('playerTimeDuration');
        if (curEl) curEl.textContent = this.formatTime(this.audio.currentTime);
        if (durEl) durEl.textContent = this.formatTime(this.audio.duration || 0);
    },

    updatePlayBtn(state: boolean | 'loading'): void {
        const btn = document.getElementById('playerPlayPauseBtn');
        if (!btn) return;
        if (state === 'loading') {
            btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i>';
        } else if (state === true) {
            btn.innerHTML = '<i data-lucide="pause"></i>';
        } else {
            btn.innerHTML = '<i data-lucide="play"></i>';
        }
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    },

    updatePlayerUI(): void {
        const reciterSelect = document.getElementById('playerReciterSelect') as HTMLSelectElement | null;
        if (reciterSelect) reciterSelect.value = this.currentReciter;
        const volumeSlider = document.getElementById('playerVolumeSlider') as HTMLInputElement | null;
        if (volumeSlider) volumeSlider.value = String(this.audio.volume);
    },

    // ========================================================
    // MY RECITATION AUTO-SCROLL (قراءتي الخاصة)
    // ========================================================
    toggleMyRecitation(): void {
        if (this.isMyRecitation) {
            this.stopMyRecitation();
        } else {
            this.startMyRecitation();
        }
    },

    startMyRecitation(): void {
        if (this.isPlaying) {
            this.audio.pause();
        }

        this.isMyRecitation = true;
        const bar = document.getElementById('myRecitationBar');
        const btn = document.getElementById('btnMyRecitation');
        if (bar) bar.classList.add('active');
        if (btn) btn.classList.add('active');

        const app = (window as any).App;
        if (app) app.showToast('👤 تم تفعيل وضع القراءة الخاصة والتمرير التلقائي');

        const speedPxPerSec = [0, 3, 6, 10, 16, 24, 34, 46, 60, 78, 100];
        let lastTime = performance.now();
        let accumulatedPixels = 0;
        const scrollContainer = document.getElementById('readingView');

        const step = (now: number) => {
            if (!this.isMyRecitation) return;
            const delta = (now - lastTime) / 1000;
            lastTime = now;

            const speed = speedPxPerSec[this.myRecitationSpeed] || 15;
            accumulatedPixels += speed * delta;

            if (accumulatedPixels >= 1 && scrollContainer) {
                const toScroll = Math.floor(accumulatedPixels);
                scrollContainer.scrollBy({ top: toScroll, behavior: 'auto' });
                accumulatedPixels -= toScroll;
            }

            this.myRecitationAnimId = requestAnimationFrame(step);
        };

        this.myRecitationAnimId = requestAnimationFrame(step);
    },

    stopMyRecitation(): void {
        this.isMyRecitation = false;
        const bar = document.getElementById('myRecitationBar');
        const btn = document.getElementById('btnMyRecitation');
        if (bar) bar.classList.remove('active');
        if (btn) btn.classList.remove('active');

        if (this.myRecitationAnimId) {
            cancelAnimationFrame(this.myRecitationAnimId);
            this.myRecitationAnimId = null;
        }
    },

    setMyRecitationSpeed(speed: number | string): void {
        this.myRecitationSpeed = typeof speed === 'string' ? parseInt(speed, 10) : speed;
        Storage.saveSettings({ myRecitationSpeed: this.myRecitationSpeed });
        const label = document.getElementById('speedValueLabel');
        if (label) label.textContent = String(this.myRecitationSpeed);
    }
};

(window as any).PlayerModule = PlayerModule;
