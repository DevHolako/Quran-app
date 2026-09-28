// Audio Player Engine with Multi-Source Fallback & Ayah Synchronization
const PlayerModule = {
    audio: null,
    isPlaying: false,
    currentSurah: 1,
    currentReciter: 'alafasy',
    ayahTimings: [],
    lastActiveAyah: -1,
    scrollAnimId: null,

    // My Recitation Mode
    isMyRecitation: false,
    myRecitationAnimId: null,
    myRecitationSpeed: 3,

    // Reciters and audio sources
    reciters: {
        'alafasy': {
            label: 'مشاري راشد العفاسي',
            sources: [
                { baseUrl: 'https://server8.mp3quran.net/afs', ext: '.mp3' },
                { baseUrl: 'https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy', ext: '.mp3' },
                { baseUrl: 'https://cdn.mualim.app/mishari-rashid-al-afasy-murattal-hafs', ext: '.opus' }
            ]
        },
        'ghamadi': {
            label: 'سعد الغامدي',
            sources: [
                { baseUrl: 'https://server7.mp3quran.net/s_gmd', ext: '.mp3' },
                { baseUrl: 'https://cdn.mualim.app/saad-al-ghamdi-murattal', ext: '.opus' }
            ]
        },
        'shuraim': {
            label: 'سعود الشريم',
            sources: [
                { baseUrl: 'https://server6.mp3quran.net/shur', ext: '.mp3' },
                { baseUrl: 'https://cdn.mualim.app/saud-al-shuraim-murattal', ext: '.opus' }
            ]
        }
    },

    init() {
        this.audio = new Audio();
        const settings = Storage.getSettings();
        this.currentReciter = settings.reciter || 'alafasy';
        this.audio.volume = settings.volume !== undefined ? settings.volume : 1.0;
        this.myRecitationSpeed = settings.myRecitationSpeed || 3;

        this.attachAudioEvents();
        this.updatePlayerUI();
    },

    attachAudioEvents() {
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

    onSurahLoaded(surahId, verses) {
        this.currentSurah = surahId;
        const surahInfo = QuranModule.getSurahInfo(surahId);
        const titleEl = document.getElementById('playerTrackSurah');
        if (titleEl) titleEl.textContent = `سورة ${surahInfo.name}`;

        if (this.isPlaying) {
            this.playSurah(this.currentSurah);
        }
    },

    async togglePlay() {
        if (this.isMyRecitation) {
            this.stopMyRecitation();
        }

        if (this.isPlaying) {
            this.audio.pause();
        } else {
            await this.playSurah(this.currentSurah);
        }
    },

    async playSurah(surahId) {
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
            App.showToast('⚠️ تعذر تشغيل التلاوة. جرب قارئاً آخر.');
        }
    },

    onMetadataLoaded() {
        this.calculateAyahTimings();
        this.updateTimeDisplay();
    },

    calculateAyahTimings() {
        const duration = this.audio.duration;
        if (!duration || isNaN(duration)) return;

        const ayahElements = document.querySelectorAll('[data-ayah]');
        if (ayahElements.length === 0) return;

        const lengths = [];
        let totalLength = 0;

        ayahElements.forEach(el => {
            const text = el.textContent || '';
            const cleanText = text.replace(/[\u064B-\u0652\u0670\u06D6-\u06ED]/g, '');
            const len = cleanText.length || 1;
            lengths.push(len);
            totalLength += len;
        });

        this.ayahTimings = [];
        let accumulated = 0;

        ayahElements.forEach((el, i) => {
            const share = (lengths[i] / totalLength) * duration;
            this.ayahTimings.push({
                index: i,
                ayahNum: i + 1,
                startTime: accumulated,
                endTime: accumulated + share,
                element: el
            });
            accumulated += share;
        });

        this.lastActiveAyah = -1;
    },

    onTimeUpdate() {
        if (!this.audio.duration) return;
        const percent = (this.audio.currentTime / this.audio.duration) * 100;
        const fillEl = document.getElementById('playerProgressFill');
        if (fillEl) fillEl.style.width = `${percent}%`;

        this.updateTimeDisplay();
    },

    startScrollTracking() {
        this.stopScrollTracking();
        const tick = () => {
            if (this.audio.paused || this.audio.ended) {
                this.scrollAnimId = null;
                return;
            }

            const t = this.audio.currentTime;
            const active = this.ayahTimings.find(x => t >= x.startTime && t < x.endTime);

            if (active && active.index !== this.lastActiveAyah) {
                this.lastActiveAyah = active.index;
                this.highlightActiveAyah(active.ayahNum);
            }

            this.scrollAnimId = requestAnimationFrame(tick);
        };
        this.scrollAnimId = requestAnimationFrame(tick);
    },

    stopScrollTracking() {
        if (this.scrollAnimId) {
            cancelAnimationFrame(this.scrollAnimId);
            this.scrollAnimId = null;
        }
    },

    highlightActiveAyah(ayahNum) {
        document.querySelectorAll('.active-ayah').forEach(el => el.classList.remove('active-ayah'));
        const el = document.getElementById(`ayah-${ayahNum}`);
        if (el) {
            el.classList.add('active-ayah');
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    },

    seek(event) {
        if (!this.audio.duration) return;
        const container = document.getElementById('progressBarContainer');
        const rect = container.getBoundingClientRect();
        // Since RTL: right side is 0%
        const clickX = event.clientX - rect.left;
        const ratio = 1 - (clickX / rect.width);
        this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, ratio * this.audio.duration));
    },

    skip(seconds) {
        if (!this.audio.duration) return;
        this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, this.audio.currentTime + seconds));
    },

    nextSurah() {
        if (this.currentSurah < 114) {
            QuranModule.loadSurah(this.currentSurah + 1);
        }
    },

    prevSurah() {
        if (this.currentSurah > 1) {
            QuranModule.loadSurah(this.currentSurah - 1);
        }
    },

    onTrackEnded() {
        if (this.currentSurah < 114) {
            this.nextSurah();
        } else {
            this.isPlaying = false;
            this.updatePlayBtn(false);
        }
    },

    setReciter(reciterId) {
        this.currentReciter = reciterId;
        Storage.saveSettings({ reciter: reciterId });
        if (this.isPlaying) {
            this.playSurah(this.currentSurah);
        }
    },

    setVolume(val) {
        const num = parseFloat(val);
        this.audio.volume = num;
        Storage.saveSettings({ volume: num });
    },

    formatTime(sec) {
        if (isNaN(sec)) return '00:00';
        const mins = Math.floor(sec / 60);
        const secs = Math.floor(sec % 60);
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    },

    updateTimeDisplay() {
        const curEl = document.getElementById('playerTimeCurrent');
        const durEl = document.getElementById('playerTimeDuration');
        if (curEl) curEl.textContent = this.formatTime(this.audio.currentTime);
        if (durEl) durEl.textContent = this.formatTime(this.audio.duration || 0);
    },

    updatePlayBtn(state) {
        const btn = document.getElementById('playerPlayPauseBtn');
        if (!btn) return;
        if (state === 'loading') {
            btn.innerHTML = '⏳';
        } else if (state === true) {
            btn.innerHTML = '⏸️';
        } else {
            btn.innerHTML = '▶️';
        }
    },

    updatePlayerUI() {
        const reciterSelect = document.getElementById('playerReciterSelect');
        if (reciterSelect) reciterSelect.value = this.currentReciter;
        const volumeSlider = document.getElementById('playerVolumeSlider');
        if (volumeSlider) volumeSlider.value = this.audio.volume;
    },

    // ========================================================
    // MY RECITATION AUTO-SCROLL (قراءتي الخاصة)
    // ========================================================
    toggleMyRecitation() {
        if (this.isMyRecitation) {
            this.stopMyRecitation();
        } else {
            this.startMyRecitation();
        }
    },

    startMyRecitation() {
        if (this.isPlaying) {
            this.audio.pause();
        }

        this.isMyRecitation = true;
        const bar = document.getElementById('myRecitationBar');
        const btn = document.getElementById('btnMyRecitation');
        if (bar) bar.classList.add('active');
        if (btn) btn.classList.add('active');

        App.showToast('👤 تم تفعيل وضع القراءة الخاصة والتمرير التلقائي');

        const speedPxPerSec = [0, 3, 6, 10, 16, 24, 34, 46, 60, 78, 100];
        let lastTime = performance.now();
        let accumulatedPixels = 0;
        const scrollContainer = document.getElementById('readingView');

        const step = (now) => {
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

    stopMyRecitation() {
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

    setMyRecitationSpeed(speed) {
        this.myRecitationSpeed = parseInt(speed);
        Storage.saveSettings({ myRecitationSpeed: this.myRecitationSpeed });
        const label = document.getElementById('speedValueLabel');
        if (label) label.textContent = this.myRecitationSpeed;
    }
};

window.PlayerModule = PlayerModule;
