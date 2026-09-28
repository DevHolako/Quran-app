// Slide-Over Tafsir Drawer Module
const TafsirModule = {
    currentSurah: 1,
    currentAyah: 1,
    isOpen: false,

    async openTafsir(surahId, ayahNumber) {
        this.currentSurah = parseInt(surahId);
        this.currentAyah = parseInt(ayahNumber);
        this.isOpen = true;

        const drawer = document.getElementById('tafsirDrawer');
        if (drawer) drawer.classList.add('open');

        await this.loadTafsirContent();
    },

    closeTafsir() {
        this.isOpen = false;
        const drawer = document.getElementById('tafsirDrawer');
        if (drawer) drawer.classList.remove('open');
    },

    async loadTafsirContent() {
        const titleEl = document.getElementById('tafsirTitle');
        const ayahBox = document.getElementById('tafsirAyahBox');
        const contentBox = document.getElementById('tafsirContentBox');
        const surahInfo = QuranModule.getSurahInfo(this.currentSurah);

        if (titleEl) {
            titleEl.textContent = `تفسير سورة ${surahInfo.name} - الآية ${this.currentAyah}`;
        }

        // Verse Text
        let verseText = '';
        if (QuranModule.currentVerses && QuranModule.currentVerses[this.currentAyah - 1]) {
            verseText = QuranModule.currentVerses[this.currentAyah - 1].text;
        }

        if (ayahBox) {
            ayahBox.innerHTML = `﴿ ${verseText} ﴾`;
        }

        if (contentBox) {
            contentBox.innerHTML = `
                <div style="text-align:center; padding: 40px; color: var(--primary);">
                    <div style="font-size: 28px; margin-bottom: 8px;">⏳</div>
                    <div>جاري تحميل التفسير الميسر...</div>
                </div>
            `;
        }

        try {
            // Check cache
            let text = Storage.getCachedTafsir(this.currentSurah, this.currentAyah);

            if (!text) {
                const res = await fetch(`https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/ar-tafsir-muyassar/${this.currentSurah}/${this.currentAyah}.json`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                text = data.text || 'لا يوجد تفسير متاح لهذه الآية.';
                Storage.cacheTafsir(this.currentSurah, this.currentAyah, text);
            }

            if (contentBox) {
                contentBox.innerHTML = `<div class="tafsir-text-content">${text}</div>`;
            }
        } catch (err) {
            console.error('Failed to load tafsir:', err);
            if (contentBox) {
                contentBox.innerHTML = `
                    <div style="color: #e74c3c; text-align: center; padding: 30px;">
                        <div>⚠️ تعذر تحميل التفسير. يرجى التحقق من الاتصال بالإنترنت.</div>
                        <button class="nav-btn" style="margin: 12px auto 0;" onclick="TafsirModule.loadTafsirContent()">إعادة المحاولة</button>
                    </div>
                `;
            }
        }
    },

    nextAyah() {
        const surahInfo = QuranModule.getSurahInfo(this.currentSurah);
        if (this.currentAyah < surahInfo.ayahs) {
            this.currentAyah++;
            this.loadTafsirContent();
        } else if (this.currentSurah < 114) {
            this.currentSurah++;
            this.currentAyah = 1;
            this.loadTafsirContent();
        }
    },

    prevAyah() {
        if (this.currentAyah > 1) {
            this.currentAyah--;
            this.loadTafsirContent();
        } else if (this.currentSurah > 1) {
            this.currentSurah--;
            const prevSurahInfo = QuranModule.getSurahInfo(this.currentSurah);
            this.currentAyah = prevSurahInfo.ayahs;
            this.loadTafsirContent();
        }
    },

    copyTafsir() {
        const surahInfo = QuranModule.getSurahInfo(this.currentSurah);
        const verseText = QuranModule.currentVerses && QuranModule.currentVerses[this.currentAyah - 1] 
            ? QuranModule.currentVerses[this.currentAyah - 1].text 
            : '';
        const tafsirText = document.querySelector('.tafsir-text-content')?.textContent || '';

        const fullCopy = `﴿ ${verseText} ﴾ [${surahInfo.name}: ${this.currentAyah}]\n\nالتفسير الميسر:\n${tafsirText}`;
        navigator.clipboard.writeText(fullCopy).then(() => {
            App.showToast('📋 تم نسخ التفسير');
        });
    }
};

window.TafsirModule = TafsirModule;
