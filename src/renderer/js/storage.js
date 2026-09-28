// Storage & Settings Manager
const DEFAULT_SETTINGS = {
    theme: 'emerald', // 'emerald', 'dark', 'sepia'
    readingMode: 'card', // 'card', 'mushaf'
    fontSize: 30, // 22 to 46
    fontFamily: 'Amiri', // 'Amiri', 'Scheherazade New', 'Cairo'
    reciter: 'alafasy',
    volume: 1.0,
    playbackRate: 1.0,
    myRecitationSpeed: 3,
    dhikrInterval: 3, // minutes
    dhikrActive: false
};

const Storage = {
    get(key, defaultValue = null) {
        try {
            const val = localStorage.getItem('quran_app_' + key);
            return val !== null ? JSON.parse(val) : defaultValue;
        } catch (e) {
            console.error('Storage get error for', key, e);
            return defaultValue;
        }
    },

    set(key, value) {
        try {
            localStorage.setItem('quran_app_' + key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error('Storage set error for', key, e);
            return false;
        }
    },

    remove(key) {
        try {
            localStorage.removeItem('quran_app_' + key);
        } catch (e) {
            console.error('Storage remove error for', key, e);
        }
    },

    // Settings
    getSettings() {
        const saved = this.get('settings', {});
        return { ...DEFAULT_SETTINGS, ...saved };
    },

    saveSettings(settings) {
        const current = this.getSettings();
        const merged = { ...current, ...settings };
        this.set('settings', merged);
        return merged;
    },

    // Bookmarks
    getBookmarks() {
        return this.get('bookmarks', []);
    },

    addBookmark(surah, ayah, surahName, textSnippet = '') {
        const list = this.getBookmarks().filter(b => !(b.surah === surah && b.ayah === ayah));
        list.unshift({
            id: Date.now(),
            surah: parseInt(surah),
            ayah: parseInt(ayah),
            surahName: surahName || `سورة ${surah}`,
            snippet: textSnippet.slice(0, 80),
            timestamp: Date.now()
        });
        this.set('bookmarks', list.slice(0, 50)); // keep up to 50
        this.setLastRead(surah, ayah, surahName);
        return list;
    },

    removeBookmark(surah, ayah) {
        const list = this.getBookmarks().filter(b => !(b.surah === surah && b.ayah === ayah));
        this.set('bookmarks', list);
        return list;
    },

    isBookmarked(surah, ayah) {
        return this.getBookmarks().some(b => b.surah === surah && b.ayah === ayah);
    },

    // Last Read Bookmark
    getLastRead() {
        return this.get('last_read', null);
    },

    setLastRead(surah, ayah, surahName) {
        this.set('last_read', {
            surah: parseInt(surah),
            ayah: parseInt(ayah),
            surahName: surahName || `سورة ${surah}`,
            timestamp: Date.now()
        });
    },

    // Offline Cache for Surahs
    getCachedSurah(surahNumber) {
        return this.get(`surah_cache_${surahNumber}`, null);
    },

    cacheSurah(surahNumber, verses) {
        return this.set(`surah_cache_${surahNumber}`, {
            surahNumber,
            verses,
            savedAt: Date.now()
        });
    },

    // Offline Cache for Tafsir
    getCachedTafsir(surah, ayah) {
        return this.get(`tafsir_cache_${surah}_${ayah}`, null);
    },

    cacheTafsir(surah, ayah, text) {
        return this.set(`tafsir_cache_${surah}_${ayah}`, {
            text,
            savedAt: Date.now()
        });
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Storage, DEFAULT_SETTINGS };
}
