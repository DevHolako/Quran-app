// Adhkar, Tasbih & Periodic Reminders Module with Full Customization (Add / Edit / Delete)
import type { AdhkarData, DhikrItem } from '../../types/quran';
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

    // Reader & Customization State
    currentType: 'sabah' as 'sabah' | 'masa' | 'dhikrList',
    isEditMode: false,

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
    // ADHKAR MODAL READER & MANAGER
    // ========================================================
    openAdhkarReader(type: 'sabah' | 'masa' | 'dhikrList' = 'sabah'): void {
        this.currentType = type;
        this.isEditMode = false;
        const modal = document.getElementById('adhkarModal');
        this.updateReaderHeader();
        this.renderAdhkarList();
        if (modal) modal.classList.add('open');
    },

    closeAdhkarReader(): void {
        const modal = document.getElementById('adhkarModal');
        if (modal) modal.classList.remove('open');
        this.isEditMode = false;
    },

    switchReaderCategory(type: 'sabah' | 'masa' | 'dhikrList'): void {
        this.currentType = type;
        this.updateReaderHeader();
        this.renderAdhkarList();
    },

    updateReaderHeader(): void {
        const titleEl = document.getElementById('adhkarModalTitle');
        const badgeEl = document.getElementById('adhkarModeBadge');
        const editBtn = document.getElementById('btnToggleAdhkarEdit');

        let titleText = '🌅 أذكار الصباح';
        if (this.currentType === 'masa') titleText = '🌙 أذكار المساء';
        if (this.currentType === 'dhikrList') titleText = '🕌 أذكار التنبيه الدوري';

        if (titleEl) titleEl.textContent = titleText;

        if (badgeEl) {
            badgeEl.textContent = this.isEditMode ? 'وضع التعديل والإدارة' : 'وضع القراءة';
            badgeEl.style.color = this.isEditMode ? '#e67e22' : 'var(--primary)';
        }

        if (editBtn) {
            editBtn.classList.toggle('active', this.isEditMode);
            editBtn.innerHTML = this.isEditMode
                ? '<i data-lucide="check"></i> إنهاء التعديل'
                : '<i data-lucide="edit-3"></i> تعديل وإدارة';
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons();
            }
        }
    },

    toggleEditMode(): void {
        this.isEditMode = !this.isEditMode;
        this.updateReaderHeader();
        this.renderAdhkarList();
    },

    renderAdhkarList(): void {
        const bodyEl = document.getElementById('adhkarModalBody');
        if (!bodyEl) return;

        let html = '';

        // Category Switcher Toolbar inside modal
        html += `
            <div class="adhkar-tabs-row" style="display: flex; gap: 8px; margin-bottom: 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
                <button class="nav-btn ${this.currentType === 'sabah' ? 'btn-special' : ''}" onclick="AdhkarModule.switchReaderCategory('sabah')" style="flex: 1; justify-content: center; gap: 6px;">
                    🌅 أذكار الصباح (${(this.data.sabah || []).length})
                </button>
                <button class="nav-btn ${this.currentType === 'masa' ? 'btn-special' : ''}" onclick="AdhkarModule.switchReaderCategory('masa')" style="flex: 1; justify-content: center; gap: 6px;">
                    🌙 أذكار المساء (${(this.data.masa || []).length})
                </button>
                <button class="nav-btn ${this.currentType === 'dhikrList' ? 'btn-special' : ''}" onclick="AdhkarModule.switchReaderCategory('dhikrList')" style="flex: 1; justify-content: center; gap: 6px;">
                    🕌 أذكار التنبيه (${(this.data.dhikrList || []).length})
                </button>
            </div>
        `;

        if (this.currentType === 'dhikrList') {
            const list = this.data.dhikrList || [];
            if (list.length === 0) {
                html += '<div style="text-align: center; padding: 40px; color: var(--text-muted);">لا توجد أذكار مضافة حالياً. اضغط "إضافة ذكر" لإضافة ذكر جديد.</div>';
            } else {
                list.forEach((text, index) => {
                    html += `
                        <div class="adhkar-card-item ${this.isEditMode ? 'in-edit-mode' : ''}" id="adhkar-item-${index}">
                            <span class="adhkar-counter-chip">🕌</span>
                            <span class="adhkar-text">${text}</span>
                            <div class="adhkar-item-actions">
                                <button class="adhkar-action-icon edit" onclick="event.stopPropagation(); AdhkarModule.openEditModal('dhikrList', ${index})" title="تعديل هذا الذكر">
                                    <i data-lucide="pencil"></i>
                                </button>
                                <button class="adhkar-action-icon delete" onclick="event.stopPropagation(); AdhkarModule.deleteDhikrItem('dhikrList', ${index})" title="حذف هذا الذكر">
                                    <i data-lucide="trash-2"></i>
                                </button>
                            </div>
                        </div>
                    `;
                });
            }
        } else {
            const items = this.data[this.currentType] || [];
            if (items.length === 0) {
                html += '<div style="text-align: center; padding: 40px; color: var(--text-muted);">لا توجد أذكار مضافة حالياً. اضغط "إضافة ذكر" لإضافة أذكارك.</div>';
            } else {
                items.forEach((item, index) => {
                    const count = item.count || 1;
                    const onClickAttr = !this.isEditMode ? `onclick="AdhkarModule.decrementAdhkarCard(${index}, ${count})"` : '';
                    html += `
                        <div class="adhkar-card-item ${this.isEditMode ? 'in-edit-mode' : ''}" id="adhkar-item-${index}" ${onClickAttr}>
                            <span class="adhkar-counter-chip" id="adhkar-count-${index}">${count}</span>
                            <span class="adhkar-text">${item.text}</span>
                            <div class="adhkar-item-actions">
                                <button class="adhkar-action-icon edit" onclick="event.stopPropagation(); AdhkarModule.openEditModal('${this.currentType}', ${index})" title="تعديل هذا الذكر">
                                    <i data-lucide="pencil"></i>
                                </button>
                                <button class="adhkar-action-icon delete" onclick="event.stopPropagation(); AdhkarModule.deleteDhikrItem('${this.currentType}', ${index})" title="حذف هذا الذكر">
                                    <i data-lucide="trash-2"></i>
                                </button>
                            </div>
                        </div>
                    `;
                });
            }
        }

        bodyEl.innerHTML = html;
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
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
    // EDIT & ADD DHIKR MODALS
    // ========================================================
    openEditModal(type: 'sabah' | 'masa' | 'dhikrList', index: number): void {
        const modal = document.getElementById('adhkarEditModal');
        const titleEl = document.getElementById('adhkarEditModalTitle');
        const typeInput = document.getElementById('editAdhkarType') as HTMLInputElement | null;
        const indexInput = document.getElementById('editAdhkarIndex') as HTMLInputElement | null;
        const catSelect = document.getElementById('editAdhkarCategorySelect') as HTMLSelectElement | null;
        const textInput = document.getElementById('editAdhkarTextInput') as HTMLTextAreaElement | null;
        const countInput = document.getElementById('editAdhkarCountInput') as HTMLInputElement | null;
        const countGroup = document.getElementById('editAdhkarCountGroup');

        if (!modal) return;

        let text = '';
        let count = 1;

        if (type === 'dhikrList') {
            text = this.data.dhikrList[index] || '';
        } else {
            const item = this.data[type][index];
            if (item) {
                text = item.text;
                count = item.count || 1;
            }
        }

        if (titleEl) titleEl.innerHTML = '<i data-lucide="pencil"></i> تعديل الذكر';
        if (typeInput) typeInput.value = type;
        if (indexInput) indexInput.value = String(index);
        if (catSelect) {
            catSelect.value = type;
            catSelect.disabled = true; // Lock category during edit
        }
        if (textInput) textInput.value = text;
        if (countInput) countInput.value = String(count);
        if (countGroup) countGroup.style.display = type === 'dhikrList' ? 'none' : 'block';

        modal.classList.add('open');
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
        if (textInput) textInput.focus();
    },

    openAddNewModal(presetCategory?: string): void {
        const modal = document.getElementById('adhkarEditModal');
        const titleEl = document.getElementById('adhkarEditModalTitle');
        const typeInput = document.getElementById('editAdhkarType') as HTMLInputElement | null;
        const indexInput = document.getElementById('editAdhkarIndex') as HTMLInputElement | null;
        const catSelect = document.getElementById('editAdhkarCategorySelect') as HTMLSelectElement | null;
        const textInput = document.getElementById('editAdhkarTextInput') as HTMLTextAreaElement | null;
        const countInput = document.getElementById('editAdhkarCountInput') as HTMLInputElement | null;
        const countGroup = document.getElementById('editAdhkarCountGroup');

        if (!modal) return;

        const targetCat = (presetCategory || this.currentType || 'sabah') as 'sabah' | 'masa' | 'dhikrList';

        if (titleEl) titleEl.innerHTML = '<i data-lucide="plus"></i> إضافة ذكر جديد';
        if (typeInput) typeInput.value = targetCat;
        if (indexInput) indexInput.value = '-1';
        if (catSelect) {
            catSelect.value = targetCat;
            catSelect.disabled = false;
        }
        if (textInput) textInput.value = '';
        if (countInput) countInput.value = '1';
        if (countGroup) countGroup.style.display = targetCat === 'dhikrList' ? 'none' : 'block';

        modal.classList.add('open');
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
        if (textInput) textInput.focus();
    },

    closeEditModal(): void {
        const modal = document.getElementById('adhkarEditModal');
        if (modal) modal.classList.remove('open');
    },

    onCategoryChange(val: string): void {
        const countGroup = document.getElementById('editAdhkarCountGroup');
        if (countGroup) {
            countGroup.style.display = val === 'dhikrList' ? 'none' : 'block';
        }
    },

    saveEditDhikr(): void {
        const app = (window as any).App;
        const catSelect = document.getElementById('editAdhkarCategorySelect') as HTMLSelectElement | null;
        const indexInput = document.getElementById('editAdhkarIndex') as HTMLInputElement | null;
        const textInput = document.getElementById('editAdhkarTextInput') as HTMLTextAreaElement | null;
        const countInput = document.getElementById('editAdhkarCountInput') as HTMLInputElement | null;

        if (!catSelect || !textInput || !indexInput) return;

        const cat = catSelect.value as 'sabah' | 'masa' | 'dhikrList';
        const index = parseInt(indexInput.value, 10);
        const text = textInput.value.trim();
        const count = Math.max(1, parseInt(countInput?.value || '1', 10));

        if (!text) {
            if (app) app.showToast('⚠️ يرجى كتابة نص الذكر أولاً');
            return;
        }

        if (index >= 0) {
            // Edit existing item
            if (cat === 'dhikrList') {
                this.data.dhikrList[index] = text;
            } else {
                this.data[cat][index] = { text, count };
            }
            if (app) app.showToast('✅ تم حفظ التعديل بنجاح');
        } else {
            // Add new item
            if (cat === 'dhikrList') {
                this.data.dhikrList.push(text);
            } else {
                this.data[cat].push({ text, count });
            }
            if (app) app.showToast('🎉 تم إضافة الذكر الجديد بنجاح');
        }

        this.saveData();
        this.closeEditModal();
        this.currentType = cat;
        this.updateReaderHeader();
        this.renderAdhkarList();
    },

    deleteDhikrItem(type: 'sabah' | 'masa' | 'dhikrList', index: number): void {
        const app = (window as any).App;
        if (!confirm('هل أنت متأكد من حذف هذا الذكر من قائمتك؟')) return;

        if (type === 'dhikrList') {
            this.data.dhikrList.splice(index, 1);
        } else {
            this.data[type].splice(index, 1);
        }

        this.saveData();
        if (app) app.showToast('🗑️ تم حذف الذكر');
        this.renderAdhkarList();
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
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
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
                    this.renderAdhkarList();
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
        if (confirm('هل أنت متأكد من استعادة الأذكار الافتراضية الأصلية؟')) {
            this.data = JSON.parse(JSON.stringify(DEFAULT_ADHKAR_DATA));
            this.saveData();
            this.renderAdhkarList();
            const app = (window as any).App;
            if (app) app.showToast('🔄 تم استعادة الأذكار الافتراضية');
        }
    }
};

(window as any).AdhkarModule = AdhkarModule;
