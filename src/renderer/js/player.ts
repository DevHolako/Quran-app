// Audio Player Engine with Multi-Source Fallback & Ayah Synchronization
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

    // My Recitation Mode
    isMyRecitation: false,
    myRecitationAnimId: null as number | null,
    myRecitationSpeed: 3,

    // Reciters and audio sources with calibrated intro timing offsets (Isti'adha & Basmala)
    reciters: {
        'alafasy': {
            label: 'مشاري راشد العفاسي',
            introIstiadha: 3.5,
            introBasmala: 4.2,
            sources: [
                { baseUrl: 'https://server8.mp3quran.net/afs', ext: '.mp3' },
                { baseUrl: 'https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy', ext: '.mp3' },
                { baseUrl: 'https://cdn.mualim.app/mishari-rashid-al-afasy-murattal-hafs', ext: '.opus' }
            ]
        },
        'ghamadi': {
            label: 'سعد الغامدي',
            introIstiadha: 3.2,
            introBasmala: 3.9,
            sources: [
                { baseUrl: 'https://server7.mp3quran.net/s_gmd', ext: '.mp3' },
                { baseUrl: 'https://cdn.mualim.app/saad-al-ghamdi-murattal', ext: '.opus' }
            ]
        },
        'shuraim': {
            label: 'سعود الشريم',
            introIstiadha: 2.9,
            introBasmala: 3.4,
            sources: [
                { baseUrl: 'https://server6.mp3quran.net/shur', ext: '.mp3' },
                { baseUrl: 'https://cdn.mualim.app/saud-al-shuraim-murattal', ext: '.opus' }
            ]
        }
    } as Record<string, { label: string; introIstiadha: number; introBasmala: number; sources: Array<{ baseUrl: string; ext: string }> }>,

    init(): void {
        this.audio = new Audio();
        const settings = Storage.getSettings();
        this.currentReciter = settings.reciter || 'alafasy';
        this.audio.volume = settings.volume !== undefined ? settings.volume : 1.0;
        this.myRecitationSpeed = settings.myRecitationSpeed || 3;

        this.attachAudioEvents();
        this.updatePlayerUI();
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

    onSurahLoaded(surahId: number, _verses?: Verse[]): void {
        this.currentSurah = surahId;
        const quranMod = (window as any).QuranModule;
        const surahInfo = quranMod ? quranMod.getSurahInfo(surahId) : { name: `سورة ${surahId}` };
        const titleEl = document.getElementById('playerTrackSurah');
        if (titleEl) titleEl.textContent = `سورة ${surahInfo.name}`;

        if (this.isPlaying) {
            this.playSurah(this.currentSurah);
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

        const paddedSurah = String(surahId).padStart(3, '0');
        let success = false;

        for (let i = 0; i < reciterData.sources.length; i++) {
            const src = reciterData.sources[i];
            const url = `${src.baseUrl}/${paddedSurah}${src.ext}`;

            try {
                this.audio.src = url;
                await this.audio.play();
                success = true;
                break;
            } catch (err) {
                console.warn(`Source ${i + 1} failed for ${this.currentReciter}:`, err);
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
        // In Surah 1 (Al-Fatiha), Basmala is Ayah 1, so it shouldn't be counted in intro
        // In Surah 9 (At-Tawbah), there is no Basmala
        if (surahId !== 1 && surahId !== 9) {
            basmalaDuration = reciter.introBasmala || 4.0;
        }

        const totalIntro = istiadhaDuration + basmalaDuration;
        return { istiadhaDuration, basmalaDuration, totalIntro };
    },

    onMetadataLoaded(): void {
        this.calculateAyahTimings();
        this.updateTimeDisplay();
    },

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

        // Compute actual verses duration excluding intro Isti'adha & Basmala
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
            const { istiadhaDuration, totalIntro } = this.getIntroTimings(this.currentSurah);

            if (t < istiadhaDuration) {
                this.highlightIntro('istiadha');
            } else if (t < totalIntro) {
                this.highlightIntro('basmala');
            } else {
                this.clearIntroHighlight();
                const active = this.ayahTimings.find(x => t >= x.startTime && t < x.endTime);

                if (active && active.index !== this.lastActiveAyah) {
                    this.lastActiveAyah = active.index;
                    this.highlightActiveAyah(active.ayahNum);
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

    seekToAyah(ayahNum: number): void {
        const timing = this.ayahTimings.find(x => x.ayahNum === ayahNum);
        if (timing) {
            this.audio.currentTime = timing.startTime;
            this.highlightActiveAyah(ayahNum);
            if (!this.isPlaying) {
                this.audio.play();
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
        const { istiadhaDuration, totalIntro } = this.getIntroTimings(this.currentSurah);
        if (t < istiadhaDuration) {
            this.highlightIntro('istiadha');
        } else if (t < totalIntro) {
            this.highlightIntro('basmala');
        } else {
            this.clearIntroHighlight();
            const active = this.ayahTimings.find(x => t >= x.startTime && t < x.endTime);
            if (active) {
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

    setReciter(reciterId: string): void {
        this.currentReciter = reciterId;
        Storage.saveSettings({ reciter: reciterId });
        if (this.isPlaying) {
            this.playSurah(this.currentSurah);
        }
    },

    setVolume(val: number | string): void {
        const num = typeof val === 'string' ? parseFloat(val) : val;
        this.audio.volume = num;
        Storage.saveSettings({ volume: num });
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
