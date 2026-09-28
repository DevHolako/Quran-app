// Slide-Over Tafsir Drawer Module
import { Storage } from './storage';

export const TafsirModule = {
    currentSurah: 1,
    currentAyah: 1,
    isOpen: false,

    async openTafsir(surahId: number | string, ayahNumber: number | string): Promise<void> {
        this.currentSurah = typeof surahId === 'string' ? parseInt(surahId, 10) : surahId;
        this.currentAyah = typeof ayahNumber === 'string' ? parseInt(ayahNumber, 10) : ayahNumber;
        this.isOpen = true;

        const drawer = document.getElementById('tafsirDrawer');
        if (drawer) drawer.classList.add('open');

        await this.loadTafsirContent();
    },

    closeTafsir(): void {
        this.isOpen = false;
        const drawer = document.getElementById('tafsirDrawer');
        if (drawer) drawer.classList.remove('open');
    },

    async loadTafsirContent(): Promise<void> {
        const titleEl = document.getElementById('tafsirTitle');
        const ayahBox = document.getElementById('tafsirAyahBox');
        const contentBox = document.getElementById('tafsirContentBox');
        const quranMod = (window as any).QuranModule;
        const surahInfo = quranMod ? quranMod.getSurahInfo(this.currentSurah) : { name: `سورة ${this.currentSurah}` };

        if (titleEl) {
            titleEl.textContent = `تفسير سورة ${surahInfo.name} - الآية ${this.currentAyah}`;
        }

        // Verse Text
        let verseText = '';
        if (quranMod && quranMod.currentVerses && quranMod.currentVerses[this.currentAyah - 1]) {
            verseText = quranMod.currentVerses[this.currentAyah - 1].text;
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
            const cached = Storage.getCachedTafsir(this.currentSurah, this.currentAyah);
            let text = cached ? cached.text : null;

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

    nextAyah(): void {
        const quranMod = (window as any).QuranModule;
        const surahInfo = quranMod ? quranMod.getSurahInfo(this.currentSurah) : { ayahs: 286 };
        if (this.currentAyah < surahInfo.ayahs) {
            this.currentAyah++;
            this.loadTafsirContent();
        } else if (this.currentSurah < 114) {
            this.currentSurah++;
            this.currentAyah = 1;
            this.loadTafsirContent();
        }
    },

    prevAyah(): void {
        if (this.currentAyah > 1) {
            this.currentAyah--;
            this.loadTafsirContent();
        } else if (this.currentSurah > 1) {
            this.currentSurah--;
            const quranMod = (window as any).QuranModule;
            const prevSurahInfo = quranMod ? quranMod.getSurahInfo(this.currentSurah) : { ayahs: 286 };
            this.currentAyah = prevSurahInfo.ayahs;
            this.loadTafsirContent();
        }
    },

    copyTafsir(): void {
        const quranMod = (window as any).QuranModule;
        const surahInfo = quranMod ? quranMod.getSurahInfo(this.currentSurah) : { name: `سورة ${this.currentSurah}` };
        const verseText = quranMod && quranMod.currentVerses && quranMod.currentVerses[this.currentAyah - 1] 
            ? quranMod.currentVerses[this.currentAyah - 1].text 
            : '';
        const tafsirEl = document.querySelector('.tafsir-text-content');
        const tafsirText = tafsirEl ? (tafsirEl.textContent || '') : '';

        const fullCopy = `﴿ ${verseText} ﴾ [${surahInfo.name}: ${this.currentAyah}]\n\nالتفسير الميسر:\n${tafsirText}`;
        navigator.clipboard.writeText(fullCopy).then(() => {
            const app = (window as any).App;
            if (app) app.showToast('📋 تم نسخ التفسير');
        });
    }
};

(window as any).TafsirModule = TafsirModule;
