export interface UpdateInfo {
    version: string;
    releaseDate: string;
    downloadUrl: string;
    changelog: string;
}

export interface UpdateCheckResult {
    success: boolean;
    hasUpdate?: boolean;
    currentVersion?: string;
    latestVersion?: string;
    changelog?: string;
    downloadUrl?: string;
    releaseDate?: string;
    error?: string;
}

export interface DownloadProgress {
    percent: number;
    receivedBytes: number;
    totalBytes: number;
}
