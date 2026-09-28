// Adhkar, Tasbih & Periodic Reminders Module
import type { AdhkarData } from '../../types/quran';
import { Storage } from './storage';

export const DEFAULT_ADHKAR_DATA: AdhkarData = {
    sabah: [
        { text: 'آية الكرسي: اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَّهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ...', count: 1 },
        { text: 'سورة الإخلاص، الفلق، الناس', count: 3 },
        { text: 'أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ...', count: 1 },
        { text: 'اللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ النُّشُورُ', count: 1 },
        { text: 'اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ...', count: 1 },
        { text: 'بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ', count: 3 },
        { text: 'رَضِيتُ بِاللَّهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ نَبِيًّا', count: 3 },
        { text: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ', count: 100 },
        { text: 'لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ', count: 10 },
        { text: 'أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ', count: 100 }
    ],
    masa: [
        { text: 'آية الكرسي: اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ...', count: 1 },
        { text: 'سورة الإخلاص، الفلق، الناس', count: 3 },
        { text: 'أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ...', count: 1 },
        { text: 'اللَّهُمَّ بِكَ أَمْسَيْنَا، وَبِكَ أَصْبَحْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ الْمَصِيرُ', count: 1 },
        { text: 'اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ خَلَقْتَنِي وَأَنَا عَبْدُكَ...', count: 1 },
        { text: 'بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ...', count: 3 },
        { text: 'رَضِيتُ بِاللَّهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ نَبِيًّا', count: 3 },
        { text: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ', count: 100 },
        { text: 'لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ', count: 10 },
        { text: 'أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ', count: 100 }
    ],
    dhikrList: [
        'سُبْحَانَ اللَّهِ',
        'الْحَمْدُ لِلَّهِ',
        'لَا إِلَهَ إِلَّا اللَّهُ',
        'اللَّهُ أَكْبَرُ',
        'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ',
        'أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ',
        'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ، سُبْحَانَ اللَّهِ الْعَظِيمِ',
        'اللَّهُمَّ صَلِّ وَسَلِّمْ عَلَى نَبِيِّنَا مُحَمَّدٍ',
        'حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ',
        'لَا إِلَهَ إِلَّا أَنْتَ سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ',
        'رَبِّ اغْفِرْ لِي وَلِوَالِدَيَّ'
    ]
};

export const AdhkarModule = {
    data: null as unknown as AdhkarData,
    dhikrTimer: null as any,
    dhikrIndex: 0,
    isDhikrActive: false,
    dhikrIntervalMin: 3,

    // Tasbih state
    tasbihCount: 0,
    tasbihTarget: 33,
    tasbihPhrase: 'سُبْحَانَ اللَّهِ',

    init(): void {
        this.loadData();
        const settings = Storage.getSettings();
        this.dhikrIntervalMin = settings.dhikrInterval || 3;
        this.isDhikrActive = settings.dhikrActive || false;

        if (this.isDhikrActive) {
            this.startDhikrTimer();
        }

        this.updateReminderUI();
    },

    loadData(): void {
        const saved = Storage.get<AdhkarData | null>('custom_adhkar_data', null);
        if (saved && saved.sabah && saved.masa && saved.dhikrList) {
            this.data = saved;
        } else {
            this.data = JSON.parse(JSON.stringify(DEFAULT_ADHKAR_DATA));
        }
    },

    saveData(): void {
        Storage.set('custom_adhkar_data', this.data);
    },

    // ========================================================
    // ADHKAR MODAL READER
    // ========================================================
    openAdhkarReader(type: 'sabah' | 'masa'): void {
        const modal = document.getElementById('adhkarModal');
        const titleEl = document.getElementById('adhkarModalTitle');
        const bodyEl = document.getElementById('adhkarModalBody');

        const title = type === 'sabah' ? '🌅 أذكار الصباح' : '🌙 أذكار المساء';
        const items = this.data[type] || [];

        if (titleEl) titleEl.textContent = title;

        let html = '';
        items.forEach((item, index) => {
            const count = item.count || 1;
            html += `
                <div class="adhkar-card-item" id="adhkar-item-${index}" onclick="AdhkarModule.decrementAdhkarCard(${index}, ${count})">
                    <span class="adhkar-counter-chip" id="adhkar-count-${index}">${count}</span>
                    <span>${item.text}</span>
                </div>
            `;
        });

        if (bodyEl) bodyEl.innerHTML = html;
        if (modal) modal.classList.add('open');
    },

    closeAdhkarReader(): void {
        const modal = document.getElementById('adhkarModal');
        if (modal) modal.classList.remove('open');
    },

    decrementAdhkarCard(index: number, _originalCount: number): void {
        const badge = document.getElementById(`adhkar-count-${index}`);
        const card = document.getElementById(`adhkar-item-${index}`);
        if (!badge || !card) return;

        let cur = parseInt(badge.textContent || '0', 10);
        if (cur > 1) {
            badge.textContent = String(cur - 1);
        } else if (cur === 1) {
            badge.textContent = '✓';
            badge.style.background = '#27ae60';
            card.classList.add('completed');
            this.playClickTone();
        }
    },

    // ========================================================
    // ELECTRONIC TASBIH (مسبحة إلكترونية)
    // ========================================================
    openTasbihModal(): void {
        const modal = document.getElementById('tasbihModal');
        this.updateTasbihUI();
        if (modal) modal.classList.add('open');
    },

    closeTasbihModal(): void {
        const modal = document.getElementById('tasbihModal');
        if (modal) modal.classList.remove('open');
    },

    incrementTasbih(): void {
        this.tasbihCount++;
        this.playClickTone();
        this.updateTasbihUI();

        if (this.tasbihTarget > 0 && this.tasbihCount === this.tasbihTarget) {
            const app = (window as any).App;
            if (app) app.showToast(`🎉 أتممت ${this.tasbihTarget} تسبيحة تقبل الله منك!`);
        }
    },

    resetTasbih(): void {
        this.tasbihCount = 0;
        this.updateTasbihUI();
    },

    setTasbihTarget(target: number | string): void {
        this.tasbihTarget = typeof target === 'string' ? parseInt(target, 10) : target;
        this.tasbihCount = 0;
        this.updateTasbihUI();
    },

    setTasbihPhrase(phrase: string): void {
        this.tasbihPhrase = phrase;
        this.tasbihCount = 0;
        this.updateTasbihUI();
    },

    updateTasbihUI(): void {
        const numEl = document.getElementById('tasbihCountNum');
        const phraseEl = document.getElementById('tasbihDhikrPhrase');
        const labelEl = document.getElementById('tasbihTargetLabel');

        if (numEl) numEl.textContent = String(this.tasbihCount);
        if (phraseEl) phraseEl.textContent = this.tasbihPhrase;
        if (labelEl) {
            labelEl.textContent = this.tasbihTarget > 0 ? `الهدف: ${this.tasbihTarget}` : 'حر';
        }
    },

    playClickTone(): void {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5 chime
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.15);
        } catch (e) {}
    },

    // ========================================================
    // PERIODIC DHIKR REMINDERS
    // ========================================================
    toggleDhikrReminder(): void {
        const app = (window as any).App;
        if (this.isDhikrActive) {
            this.stopDhikrTimer();
            this.isDhikrActive = false;
            if (app) app.showToast('🔕 تم إيقاف تذكير الذكر');
        } else {
            this.isDhikrActive = true;
            this.startDhikrTimer();
            if (app) app.showToast(`🔔 تم تفعيل تذكير الذكر (كل ${this.dhikrIntervalMin} دقيقة)`);
            this.fireDhikrAlert();
        }

        Storage.saveSettings({ dhikrActive: this.isDhikrActive });
        this.updateReminderUI();
    },

    startDhikrTimer(): void {
        this.stopDhikrTimer();
        this.dhikrTimer = setInterval(() => {
            this.fireDhikrAlert();
        }, this.dhikrIntervalMin * 60 * 1000);
    },

    stopDhikrTimer(): void {
        if (this.dhikrTimer) {
            clearInterval(this.dhikrTimer);
            this.dhikrTimer = null;
        }
    },

    setIntervalMin(mins: number | string): void {
        this.dhikrIntervalMin = typeof mins === 'string' ? parseInt(mins, 10) : mins;
        Storage.saveSettings({ dhikrInterval: this.dhikrIntervalMin });
        if (this.isDhikrActive) {
            this.startDhikrTimer();
            const app = (window as any).App;
            if (app) app.showToast(`⏱️ تم ضبط تذكير الذكر كل ${this.dhikrIntervalMin} دقيقة`);
        }
    },

    fireDhikrAlert(): void {
        if (!this.data || !this.data.dhikrList || this.data.dhikrList.length === 0) return;
        const dhikr = this.data.dhikrList[this.dhikrIndex % this.data.dhikrList.length];
        this.dhikrIndex++;

        // Native Desktop Notification via Electron
        if (window.desktopAPI && window.desktopAPI.showNotification) {
            window.desktopAPI.showNotification('🕌 تذكير بالذكر والاستغفار', dhikr);
        }

        // In-App Toast
        const app = (window as any).App;
        if (app) app.showToast(`🕌 ${dhikr}`, 6000);
        this.playClickTone();
    },

    previewDhikr(): void {
        this.fireDhikrAlert();
    },

    updateReminderUI(): void {
        const toggleBtn = document.getElementById('btnToggleDhikr');
        const intervalSelect = document.getElementById('dhikrIntervalSelect') as HTMLSelectElement | null;

        if (toggleBtn) {
            toggleBtn.classList.toggle('active', this.isDhikrActive);
            toggleBtn.innerHTML = this.isDhikrActive 
                ? '<i data-lucide="bell-ring"></i> تذكير الذكر مُفعّل' 
                : '<i data-lucide="bell-off"></i> تفعيل تذكير الذكر';
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons();
            }
        }

        if (intervalSelect) {
            intervalSelect.value = String(this.dhikrIntervalMin);
        }
    },

    // ========================================================
    // ADHKAR SETTINGS (IMPORT / EXPORT / RESET)
    // ========================================================
    exportAdhkar(): void {
        const str = JSON.stringify(this.data, null, 2);
        const blob = new Blob([str], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `adhkar_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        const app = (window as any).App;
        if (app) app.showToast('⬇️ تم تصدير الأذكار بنجاح');
    },

    importAdhkar(event: Event): void {
        const target = event.target as HTMLInputElement;
        const file = target && target.files ? target.files[0] : null;
        if (!file) return;
        const reader = new FileReader();
        const app = (window as any).App;
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target?.result as string);
                if (parsed.sabah && parsed.masa && parsed.dhikrList) {
                    this.data = parsed;
                    this.saveData();
                    if (app) app.showToast('⬆️ تم استيراد الأذكار بنجاح');
                } else {
                    throw new Error('ملف غير صالح');
                }
            } catch (err) {
                if (app) app.showToast('⚠️ فشل استيراد الملف');
            }
            target.value = '';
        };
        reader.readAsText(file);
    },

    resetToDefaults(): void {
        if (confirm('هل أنت متأكد من استعادة الأذكار الافتراضية؟')) {
            this.data = JSON.parse(JSON.stringify(DEFAULT_ADHKAR_DATA));
            this.saveData();
            const app = (window as any).App;
            if (app) app.showToast('🔄 تم استعادة الأذكار الافتراضية');
        }
    }
};

(window as any).AdhkarModule = AdhkarModule;
