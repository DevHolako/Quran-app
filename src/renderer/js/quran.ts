// Quran Fetcher & Renderer Module
import type { SurahItem, Verse } from '../../types/quran';
import { SURAHS_DATA } from './quran-data';
import { Storage } from './storage';

export const QuranModule = {
    currentSurahId: 1,
    currentVerses: [] as Verse[],
    readingMode: 'card' as 'card' | 'mushaf', // 'card' or 'mushaf'

    async init(): Promise<void> {
        const settings = Storage.getSettings();
        this.readingMode = (settings.readingMode as 'card' | 'mushaf') || 'card';
        this.applyFontSize(settings.fontSize || 30);

        const view = document.getElementById('readingView');
        if (view) {
            view.addEventListener('scroll', () => {
                const fab = document.getElementById('btnScrollToTop');
                if (fab) {
                    if (view.scrollTop > 250) {
                        fab.classList.add('visible');
                    } else {
                        fab.classList.remove('visible');
                    }
                }
            });
        }
    },

    scrollToTop(): void {
        const view = document.getElementById('readingView');
        if (view) {
            view.scrollTo({ top: 0, behavior: 'smooth' });
        }
    },

    async loadSurah(surahId: number | string, targetAyah: number | null = null): Promise<Verse[]> {
        this.currentSurahId = typeof surahId === 'string' ? parseInt(surahId, 10) : surahId;
        const container = document.getElementById('quranContent');
        if (!container) return [];

        container.innerHTML = `
            <div style="text-align:center; padding: 60px 20px; color: var(--primary);">
                <div style="font-size: 36px; margin-bottom: 12px; animation: spin 2s linear infinite;">⏳</div>
                <div style="font-size: 18px; font-weight: 700;">جاري تحميل سورة ${this.getSurahInfo(this.currentSurahId).name}...</div>
            </div>
        `;

        try {
            // Check offline cache first
            const cached = Storage.getCachedSurah(this.currentSurahId);
            let verses: Verse[] | null = null;

            if (cached && cached.verses && cached.verses.length > 0) {
                verses = cached.verses;
            } else {
                // Fetch from Quran API with fallback
                const res = await fetch(`https://api.alquran.cloud/v1/surah/${this.currentSurahId}/quran-uthmani`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (!data.data || !data.data.ayahs) throw new Error('بيانات غير مكتملة');
                verses = data.data.ayahs;
                // Cache for offline usage
                if (verses) {
                    Storage.cacheSurah(this.currentSurahId, verses);
                }
            }

            this.currentVerses = verses || [];
            this.renderSurah();

            // Update Audio Player current surah
            if ((window as any).PlayerModule) {
                (window as any).PlayerModule.onSurahLoaded(this.currentSurahId, verses);
            }

            // Update UI sidebar active state
            this.updateSidebarActive(this.currentSurahId);

            // Jump to target Ayah if specified
            if (targetAyah) {
                setTimeout(() => this.scrollToAyah(targetAyah), 400);
            }

            return this.currentVerses;
        } catch (err) {
            console.error('Failed to load surah:', err);
            container.innerHTML = `
                <div style="text-align:center; padding: 50px 20px; color: #e74c3c;">
                    <div style="font-size: 40px; margin-bottom: 10px;">⚠️</div>
                    <div style="font-size: 18px; font-weight: 700;">تعذر تحميل السورة. يرجى التحقق من الاتصال بالإنترنت.</div>
                    <button class="nav-btn" style="margin: 16px auto 0; display: inline-flex;" onclick="QuranModule.loadSurah(${this.currentSurahId})">
                        🔄 إعادة المحاولة
                    </button>
                </div>
            `;
            throw err;
        }
    },

    getSurahInfo(id: number): SurahItem {
        return SURAHS_DATA.find(s => s.id === id) || { id, name: `سورة ${id}`, english: '', ayahs: 0, type: 'مكية', juz: 1 };
    },

    renderSurah(): void {
        const container = document.getElementById('quranContent');
        if (!container) return;

        const surah = this.getSurahInfo(this.currentSurahId);

        // Header Banner
        const headerHtml = `
            <div class="surah-header-banner">
                <div class="surah-ornament-top">﷽</div>
                <div class="surah-name-arabic">سورة ${surah.name}</div>
                <div class="surah-meta-row">
                    <span class="surah-meta-badge">📖 ${surah.ayahs} آية</span>
                    <span class="surah-meta-badge">📍 ${surah.type}</span>
                    <span class="surah-meta-badge">✨ الجزء ${surah.juz}</span>
                </div>
            </div>
        `;

        // Isti'adha Banner (always recited at the beginning of audio)
        const istiadhaHtml = `
            <div class="istiadha-banner" id="istiadhaBanner" onclick="PlayerModule.seekToIntro('istiadha')" title="الاستعاذة بالله (اضغط للتشغيل)">
                أَعُوذُ بِٱللَّهِ مِنَ ٱلشَّيْطَٰنِ ٱلرَّجِيمِ
            </div>
        `;

        // Basmala (except Surah 1 Al-Fatiha where it is Ayah 1, and Surah 9 At-Tawbah where it is not recited)
        let basmalaHtml = '';
        if (this.currentSurahId !== 1 && this.currentSurahId !== 9) {
            basmalaHtml = `
                <div class="basmala-banner" id="basmalaBanner" onclick="PlayerModule.seekToIntro('basmala')" title="البسملة الشريفة (اضغط للتشغيل)">
                    بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
                </div>
            `;
        }

        const introBoxHtml = `
            <div class="intro-revelation-box">
                ${istiadhaHtml}
                ${basmalaHtml}
            </div>
        `;

        // Reader controls
        const controlsHtml = `
            <div class="reader-controls-bar">
                <div class="reader-controls-group">
                    <div class="mode-toggle-group">
                        <button class="mode-btn ${this.readingMode === 'card' ? 'active' : ''}" onclick="QuranModule.setMode('card')">بطاقات</button>
                        <button class="mode-btn ${this.readingMode === 'mushaf' ? 'active' : ''}" onclick="QuranModule.setMode('mushaf')">مصحف</button>
                    </div>
                </div>

                <div class="reader-controls-group">
                    <button class="zoom-btn" onclick="QuranModule.scrollToTop()" title="الرجوع إلى أول السورة"><i data-lucide="arrow-up"></i></button>
                    <button class="zoom-btn" onclick="QuranModule.adjustFontSize(2)" title="تكبير الخط">A+</button>
                    <button class="zoom-btn" onclick="QuranModule.adjustFontSize(-2)" title="تصغير الخط">A-</button>
                </div>
            </div>
        `;

        // Content rendering based on mode
        let bodyHtml = '';
        if (this.readingMode === 'card') {
            bodyHtml = '<div class="card-mode-list">';
            this.currentVerses.forEach((verse, index) => {
                const ayahNum = index + 1;
                const isBookmarked = Storage.isBookmarked(this.currentSurahId, ayahNum);
                bodyHtml += `
                    <div class="ayah-card" id="ayah-${ayahNum}" data-surah="${this.currentSurahId}" data-ayah="${ayahNum}" data-index="${index}">
                        <div class="ayah-card-header">
                            <span class="ayah-number-badge" onclick="PlayerModule.seekToAyah(${ayahNum})" style="cursor: pointer;" title="استماع إلى الآية ${ayahNum}">
                                <i data-lucide="play" style="width: 12px; height: 12px;"></i> الآية ${ayahNum}
                            </span>
                            <div class="ayah-actions-toolbar">
                                <button class="ayah-action-btn" onclick="PlayerModule.seekToAyah(${ayahNum})" title="استماع للآية">
                                    <i data-lucide="volume-2"></i> استماع
                                </button>
                                <button class="ayah-action-btn" onclick="TafsirModule.openTafsir(${this.currentSurahId}, ${ayahNum})" title="عرض التفسير">
                                    <i data-lucide="book-open"></i> تفسير
                                </button>
                                <button class="ayah-action-btn ${isBookmarked ? 'bookmarked' : ''}" id="bm-btn-${ayahNum}" onclick="QuranModule.toggleBookmark(${this.currentSurahId}, ${ayahNum})" title="حفظ علامة">
                                    <i data-lucide="bookmark"></i> ${isBookmarked ? 'محفوظة' : 'علامة'}
                                </button>
                                <button class="ayah-action-btn" onclick="QuranModule.copyVerseText(${this.currentSurahId}, ${ayahNum})" title="نسخ الآية">
                                    <i data-lucide="copy"></i> نسخ
                                </button>
                            </div>
                        </div>
                        <div class="ayah-arabic-text">${verse.text}</div>
                    </div>
                `;
            });
            bodyHtml += '</div>';
        } else {
            // Mus'haf Continuous Mode
            bodyHtml = '<div class="mushaf-mode-flow">';
            this.currentVerses.forEach((verse, index) => {
                const ayahNum = index + 1;
                bodyHtml += `
                    <span class="mushaf-ayah-span" id="ayah-${ayahNum}" data-surah="${this.currentSurahId}" data-ayah="${ayahNum}" data-index="${index}" onclick="TafsirModule.openTafsir(${this.currentSurahId}, ${ayahNum})" title="انقر لعرض التفسير | الآية ${ayahNum}">
                        ${verse.text}
                        <span class="mushaf-ayah-end" onclick="event.stopPropagation(); PlayerModule.seekToAyah(${ayahNum})" title="استماع للآية ${ayahNum}">${ayahNum}</span>
                    </span>
                `;
            });
            bodyHtml += '</div>';
        }

        container.innerHTML = `
            <div class="quran-container">
                ${headerHtml}
                ${controlsHtml}
                ${introBoxHtml}
                ${bodyHtml}
            </div>
        `;
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    },

    setMode(mode: 'card' | 'mushaf'): void {
        if (this.readingMode === mode) return;
        this.readingMode = mode;
        Storage.saveSettings({ readingMode: mode });
        this.renderSurah();
    },

    adjustFontSize(delta: number): void {
        const settings = Storage.getSettings();
        const newSize = Math.max(20, Math.min(46, (settings.fontSize || 30) + delta));
        this.applyFontSize(newSize);
        Storage.saveSettings({ fontSize: newSize });
    },

    applyFontSize(size: number): void {
        document.documentElement.style.setProperty('--quran-font-size', `${size}px`);
    },

    scrollToAyah(ayahNumber: number): void {
        const el = document.getElementById(`ayah-${ayahNumber}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('active-ayah');
            setTimeout(() => {
                if (!(window as any).PlayerModule || !(window as any).PlayerModule.isPlaying) {
                    el.classList.remove('active-ayah');
                }
            }, 3000);
        }
    },

    toggleBookmark(surahId: number, ayahNumber: number): void {
        const surah = this.getSurahInfo(surahId);
        const verse = this.currentVerses[ayahNumber - 1];
        const isCurrently = Storage.isBookmarked(surahId, ayahNumber);
        const app = (window as any).App;

        if (isCurrently) {
            Storage.removeBookmark(surahId, ayahNumber);
            if (app) app.showToast(`تمت إزالة علامة الآية ${ayahNumber}`);
        } else {
            Storage.addBookmark(surahId, ayahNumber, surah.name, verse ? verse.text : '');
            if (app) app.showToast(`📌 تم حفظ علامة عند ${surah.name} : الآية ${ayahNumber}`);
        }

        // Update button appearance
        const btn = document.getElementById(`bm-btn-${ayahNumber}`);
        if (btn) {
            btn.classList.toggle('bookmarked', !isCurrently);
            btn.innerHTML = !isCurrently ? '🔖 محفوظة' : '🔖 علامة';
        }

        // Refresh bookmarks sidebar if open
        if (app) app.renderBookmarksList();
    },

    copyVerseText(surahId: number, ayahNumber: number): void {
        const verse = this.currentVerses[ayahNumber - 1];
        const surah = this.getSurahInfo(surahId);
        if (verse) {
            const textToCopy = `﴿ ${verse.text} ﴾ [${surah.name}: ${ayahNumber}]`;
            navigator.clipboard.writeText(textToCopy).then(() => {
                const app = (window as any).App;
                if (app) app.showToast('📋 تم نسخ الآية الكريمة');
            });
        }
    },

    updateSidebarActive(surahId: number): void {
        document.querySelectorAll('.surah-list-item').forEach(el => {
            const htmlEl = el as HTMLElement;
            el.classList.toggle('active', parseInt(htmlEl.dataset.id || '0', 10) === surahId);
        });
    }
};

(window as any).QuranModule = QuranModule;
