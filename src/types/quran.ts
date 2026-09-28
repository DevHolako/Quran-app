export interface SurahItem {
    id: number;
    name: string;
    english: string;
    ayahs: number;
    type: string;
    juz: number;
}

export interface AyahTiming {
    index: number;
    ayahNum: number;
    startTime: number;
    endTime: number;
    element?: HTMLElement | null;
}

export interface BookmarkItem {
    id: number;
    surah: number;
    ayah: number;
    surahName: string;
    snippet: string;
    timestamp: number;
}

export interface LastReadState {
    surah: number;
    ayah: number;
    surahName: string;
    timestamp: number;
}

export interface Verse {
    number?: number;
    text: string;
    numberInSurah?: number;
    juz?: number;
    manzil?: number;
    page?: number;
    ruku?: number;
    hizbQuarter?: number;
    sajda?: boolean | any;
}

export interface AppSettings {
    theme?: string;
    readingMode?: 'card' | 'mushaf';
    fontSize?: number;
    fontFamily?: string;
    reciter?: string;
    volume?: number;
    playbackRate?: number;
    myRecitationSpeed?: number;
    dhikrInterval?: number;
    dhikrActive?: boolean;
    [key: string]: any;
}

export interface DhikrItem {
    text: string;
    count: number;
}

export interface AdhkarData {
    sabah: DhikrItem[];
    masa: DhikrItem[];
    dhikrList: string[];
}

export interface FullBackupData {
    app: string;
    version: string;
    timestamp: string;
    settings: AppSettings;
    bookmarks: BookmarkItem[];
    lastRead: LastReadState | null;
    adhkar: any;
    tasbihTarget: number;
}
