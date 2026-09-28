import type { AppSettings, BookmarkItem, LastReadState, Verse } from '../../types/quran';

export const DEFAULT_SETTINGS: AppSettings = {
    theme: 'emerald', // 'emerald', 'dark', 'sepia'
    readingMode: 'card', // 'card', 'mushaf'
    fontSize: 30, // 22 to 46
    fontFamily: 'Amiri', // 'Amiri', 'Scheherazade New', 'Cairo'
    reciter: 'alafasy',
    volume: 1.0,
    playbackRate: 1.0,
    myRecitationSpeed: 3,
    timingOffset: 0.0,
    dhikrInterval: 3, // minutes
    dhikrActive: false
};

export const Storage = {
    get<T = any>(key: string, defaultValue: T = null as unknown as T): T {
        try {
            const val = localStorage.getItem('quran_app_' + key);
            return val !== null ? JSON.parse(val) : defaultValue;
        } catch (e) {
            console.error('Storage get error for', key, e);
            return defaultValue;
        }
    },

    set(key: string, value: any): boolean {
        try {
            localStorage.setItem('quran_app_' + key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error('Storage set error for', key, e);
            return false;
        }
    },

    remove(key: string): void {
        try {
            localStorage.removeItem('quran_app_' + key);
        } catch (e) {
            console.error('Storage remove error for', key, e);
        }
    },

    // Settings
    getSettings(): AppSettings {
        const saved = Storage.get<AppSettings>('settings', {});
        return { ...DEFAULT_SETTINGS, ...saved };
    },

    saveSettings(settings: Partial<AppSettings>): AppSettings {
        const current = Storage.getSettings();
        const merged = { ...current, ...settings };
        Storage.set('settings', merged);
        return merged;
    },

    // Bookmarks
    getBookmarks(): BookmarkItem[] {
        return Storage.get<BookmarkItem[]>('bookmarks', []);
    },

    addBookmark(surah: number | string, ayah: number | string, surahName: string = '', textSnippet: string = ''): BookmarkItem[] {
        const surahNum = typeof surah === 'string' ? parseInt(surah, 10) : surah;
        const ayahNum = typeof ayah === 'string' ? parseInt(ayah, 10) : ayah;
        const list = Storage.getBookmarks().filter(b => !(b.surah === surahNum && b.ayah === ayahNum));
        list.unshift({
            id: Date.now(),
            surah: surahNum,
            ayah: ayahNum,
            surahName: surahName || `سورة ${surahNum}`,
            snippet: textSnippet.slice(0, 80),
            timestamp: Date.now()
        });
        const trimmed = list.slice(0, 50); // keep up to 50
        Storage.set('bookmarks', trimmed);
        Storage.setLastRead(surahNum, ayahNum, surahName);
        return trimmed;
    },

    removeBookmark(surah: number | string, ayah: number | string): BookmarkItem[] {
        const surahNum = typeof surah === 'string' ? parseInt(surah, 10) : surah;
        const ayahNum = typeof ayah === 'string' ? parseInt(ayah, 10) : ayah;
        const list = Storage.getBookmarks().filter(b => !(b.surah === surahNum && b.ayah === ayahNum));
        Storage.set('bookmarks', list);
        return list;
    },

    isBookmarked(surah: number | string, ayah: number | string): boolean {
        const surahNum = typeof surah === 'string' ? parseInt(surah, 10) : surah;
        const ayahNum = typeof ayah === 'string' ? parseInt(ayah, 10) : ayah;
        return Storage.getBookmarks().some(b => b.surah === surahNum && b.ayah === ayahNum);
    },

    // Last Read Bookmark
    getLastRead(): LastReadState | null {
        return Storage.get<LastReadState | null>('last_read', null);
    },

    setLastRead(surah: number | string, ayah: number | string, surahName: string = ''): void {
        const surahNum = typeof surah === 'string' ? parseInt(surah, 10) : surah;
        const ayahNum = typeof ayah === 'string' ? parseInt(ayah, 10) : ayah;
        Storage.set('last_read', {
            surah: surahNum,
            ayah: ayahNum,
            surahName: surahName || `سورة ${surahNum}`,
            timestamp: Date.now()
        });
    },

    // Offline Cache for Surahs
    getCachedSurah(surahNumber: number): { surahNumber: number; verses: Verse[]; savedAt: number } | null {
        return this.get(`surah_cache_${surahNumber}`, null);
    },

    cacheSurah(surahNumber: number, verses: Verse[]): boolean {
        return this.set(`surah_cache_${surahNumber}`, {
            surahNumber,
            verses,
            savedAt: Date.now()
        });
    },

    // Offline Cache for Tafsir
    getCachedTafsir(surah: number, ayah: number): { text: string; savedAt: number } | null {
        return this.get(`tafsir_cache_${surah}_${ayah}`, null);
    },

    cacheTafsir(surah: number, ayah: number, text: string): boolean {
        return this.set(`tafsir_cache_${surah}_${ayah}`, {
            text,
            savedAt: Date.now()
        });
    }
};

(window as any).Storage = Storage;
