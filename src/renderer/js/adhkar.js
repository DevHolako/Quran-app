// Adhkar, Tasbih & Periodic Reminders Module
const DEFAULT_ADHKAR_DATA = {
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

const AdhkarModule = {
    data: null,
    dhikrTimer: null,
    dhikrIndex: 0,
    isDhikrActive: false,
    dhikrIntervalMin: 3,

    // Tasbih state
    tasbihCount: 0,
    tasbihTarget: 33,
    tasbihPhrase: 'سُبْحَانَ اللَّهِ',

    init() {
        this.loadData();
        const settings = Storage.getSettings();
        this.dhikrIntervalMin = settings.dhikrInterval || 3;
        this.isDhikrActive = settings.dhikrActive || false;

        if (this.isDhikrActive) {
            this.startDhikrTimer();
        }

        this.updateReminderUI();
    },

    loadData() {
        const saved = Storage.get('custom_adhkar_data', null);
        if (saved && saved.sabah && saved.masa && saved.dhikrList) {
            this.data = saved;
        } else {
            this.data = JSON.parse(JSON.stringify(DEFAULT_ADHKAR_DATA));
        }
    },

    saveData() {
        Storage.set('custom_adhkar_data', this.data);
    },

    // ========================================================
    // ADHKAR MODAL READER
    // ========================================================
    openAdhkarReader(type) {
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

    closeAdhkarReader() {
        const modal = document.getElementById('adhkarModal');
        if (modal) modal.classList.remove('open');
    },

    decrementAdhkarCard(index, originalCount) {
        const badge = document.getElementById(`adhkar-count-${index}`);
        const card = document.getElementById(`adhkar-item-${index}`);
        if (!badge || !card) return;

        let cur = parseInt(badge.textContent);
        if (cur > 1) {
            badge.textContent = cur - 1;
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
    openTasbihModal() {
        const modal = document.getElementById('tasbihModal');
        this.updateTasbihUI();
        if (modal) modal.classList.add('open');
    },

    closeTasbihModal() {
        const modal = document.getElementById('tasbihModal');
        if (modal) modal.classList.remove('open');
    },

    incrementTasbih() {
        this.tasbihCount++;
        this.playClickTone();
        this.updateTasbihUI();

        if (this.tasbihTarget > 0 && this.tasbihCount === this.tasbihTarget) {
            App.showToast(`🎉 أتممت ${this.tasbihTarget} تسبيحة تقبل الله منك!`);
        }
    },

    resetTasbih() {
        this.tasbihCount = 0;
        this.updateTasbihUI();
    },

    setTasbihTarget(target) {
        this.tasbihTarget = parseInt(target);
        this.tasbihCount = 0;
        this.updateTasbihUI();
    },

    setTasbihPhrase(phrase) {
        this.tasbihPhrase = phrase;
        this.tasbihCount = 0;
        this.updateTasbihUI();
    },

    updateTasbihUI() {
        const numEl = document.getElementById('tasbihCountNum');
        const phraseEl = document.getElementById('tasbihDhikrPhrase');
        const labelEl = document.getElementById('tasbihTargetLabel');

        if (numEl) numEl.textContent = this.tasbihCount;
        if (phraseEl) phraseEl.textContent = this.tasbihPhrase;
        if (labelEl) {
            labelEl.textContent = this.tasbihTarget > 0 ? `الهدف: ${this.tasbihTarget}` : 'حر';
        }
    },

    playClickTone() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
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
    toggleDhikrReminder() {
        if (this.isDhikrActive) {
            this.stopDhikrTimer();
            this.isDhikrActive = false;
            App.showToast('🔕 تم إيقاف تذكير الذكر');
        } else {
            this.isDhikrActive = true;
            this.startDhikrTimer();
            App.showToast(`🔔 تم تفعيل تذكير الذكر (كل ${this.dhikrIntervalMin} دقيقة)`);
            this.fireDhikrAlert();
        }

        Storage.saveSettings({ dhikrActive: this.isDhikrActive });
        this.updateReminderUI();
    },

    startDhikrTimer() {
        this.stopDhikrTimer();
        this.dhikrTimer = setInterval(() => {
            this.fireDhikrAlert();
        }, this.dhikrIntervalMin * 60 * 1000);
    },

    stopDhikrTimer() {
        if (this.dhikrTimer) {
            clearInterval(this.dhikrTimer);
            this.dhikrTimer = null;
        }
    },

    setIntervalMin(mins) {
        this.dhikrIntervalMin = parseInt(mins);
        Storage.saveSettings({ dhikrInterval: this.dhikrIntervalMin });
        if (this.isDhikrActive) {
            this.startDhikrTimer();
            App.showToast(`⏱️ تم ضبط تذكير الذكر كل ${this.dhikrIntervalMin} دقيقة`);
        }
    },

    fireDhikrAlert() {
        if (this.data.dhikrList.length === 0) return;
        const dhikr = this.data.dhikrList[this.dhikrIndex % this.data.dhikrList.length];
        this.dhikrIndex++;

        // Native Desktop Notification via Electron
        if (window.desktopAPI && window.desktopAPI.showNotification) {
            window.desktopAPI.showNotification('🕌 تذكير بالذكر والاستغفار', dhikr);
        }

        // In-App Toast
        App.showToast(`🕌 ${dhikr}`, 6000);
        this.playClickTone();
    },

    previewDhikr() {
        this.fireDhikrAlert();
    },

    updateReminderUI() {
        const toggleBtn = document.getElementById('btnToggleDhikr');
        const intervalSelect = document.getElementById('dhikrIntervalSelect');

        if (toggleBtn) {
            toggleBtn.classList.toggle('active', this.isDhikrActive);
            toggleBtn.innerHTML = this.isDhikrActive ? '🔔 تذكير الذكر مُفعّل' : '🔕 تفعيل تذكير الذكر';
        }

        if (intervalSelect) {
            intervalSelect.value = this.dhikrIntervalMin;
        }
    },

    // ========================================================
    // ADHKAR SETTINGS (IMPORT / EXPORT / RESET)
    // ========================================================
    exportAdhkar() {
        const str = JSON.stringify(this.data, null, 2);
        const blob = new Blob([str], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `adhkar_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        App.showToast('⬇️ تم تصدير الأذكار بنجاح');
    },

    importAdhkar(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                if (parsed.sabah && parsed.masa && parsed.dhikrList) {
                    this.data = parsed;
                    this.saveData();
                    App.showToast('⬆️ تم استيراد الأذكار بنجاح');
                } else {
                    throw new Error('ملف غير صالح');
                }
            } catch (err) {
                App.showToast('⚠️ فشل استيراد الملف');
            }
            event.target.value = '';
        };
        reader.readAsText(file);
    },

    resetToDefaults() {
        if (confirm('هل أنت متأكد من استعادة الأذكار الافتراضية؟')) {
            this.data = JSON.parse(JSON.stringify(DEFAULT_ADHKAR_DATA));
            this.saveData();
            App.showToast('🔄 تم استعادة الأذكار الافتراضية');
        }
    }
};

window.AdhkarModule = AdhkarModule;
