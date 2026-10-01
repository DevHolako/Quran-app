import { UpdateCheckResult, DownloadProgress } from './updater';

export interface DesktopAPI {
    platform?: string;
    getAppVersion: () => Promise<string>;
    checkForUpdates: (url: string) => Promise<UpdateCheckResult>;
    downloadUpdate: (url: string) => Promise<{ success: boolean; needsPermission?: boolean; error?: string }>;
    canRequestPackageInstalls?: () => Promise<{ canInstall: boolean; hasCachedApk?: boolean }>;
    installDownloadedApk?: () => Promise<{ success: boolean; needsPermission?: boolean; error?: string }>;
    openExternalUrl: (url: string) => Promise<boolean>;
    showNotification: (title: string, body: string) => Promise<boolean>;
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    onDownloadProgress: (callback: (progress: DownloadProgress) => void) => void;
    onNavigate: (callback: (destination: string) => void) => void;
}

declare global {
    interface Window {
        desktopAPI?: DesktopAPI;
        lucide?: {
            createIcons: () => void;
        };
        webkitAudioContext?: typeof AudioContext;
        Storage?: any;
        QuranData?: any;
        QuranModule?: any;
        PlayerModule?: any;
        TafsirModule?: any;
        AdhkarModule?: any;
        UpdaterModule?: any;
        App?: any;
        SURAHS_DATA?: any;
    }
}
