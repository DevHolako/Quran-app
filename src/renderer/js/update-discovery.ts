// Update-channel discovery.
//
// The problem this solves: an app needs to know where to look for a new version,
// but a link baked into the APK goes stale the moment the manifest moves, and it
// forces a rebuild to change. So instead of one hardcoded URL, the app tries an
// ordered list of well-known public locations at runtime and uses the first one that
// answers with a valid Android manifest. No rebuild when the hosting changes, and no
// manual URL entry on the device.
//
// Discovery is cached in Storage once it succeeds, so the steady state costs a single
// request per app launch, not one per candidate.

/** Mirrors looksLikeApk() in platform.ts: rejects URLs that are provably not APKs. */
const looksLikeApkUrl = (url: string): boolean => {
    if (!url) return false;
    const noQuery = String(url).split('?')[0].split('#')[0];
    if (/\.apk$/i.test(noQuery)) return true;
    if (/\.(exe|msi|bat|cmd|com|scr|dmg|deb|rpm|pkg)$/i.test(noQuery)) return false;
    return true;
};

/**
 * A candidate is only useful if it yields a manifest that identifies as Android and
 * advertises an installable APK. Anything else (HTML error page, JSON of the wrong
 * shape, the desktop manifest) is skipped so discovery moves on to the next source.
 */
const isUsableAndroidManifest = (info: any): boolean => {
    if (!info || typeof info !== 'object') return false;
    if (!info.version || !info.downloadUrl) return false;
    if (info.platform && info.platform !== 'android') return false;
    return looksLikeApkUrl(info.downloadUrl);
};

/**
 * Sources tried in order. The first entry is the build-time baked URL when present.
 *
 * The raw.githubusercontent entries resolve the manifest from the public repository,
 * which is the whole point: publishing a new version-android.json on the default
 * branch is enough for installed apps to find it, with no rebuild and no link stored
 * in the app. The GitHub API entry additionally locates a release asset, which keeps
 * working if the file is ever renamed or the branch layout changes.
 *
 * Keep this list short and public. It is compiled into every APK, so nothing secret
 * may live here.
 */
const buildCandidates = (bakedUrl: string): string[] => {
    const list: string[] = [];
    if (bakedUrl) list.push(bakedUrl);

    const repo = 'DevHolako/Quran-app';

    // 1. Direct release asset from latest GitHub Release
    list.push(`https://github.com/${repo}/releases/latest/download/version-android.json`);

    // 2. Raw GitHub branch source
    list.push(`https://raw.githubusercontent.com/${repo}/main/version-android.json`);

    // 3. GitHub API latest release
    list.push(`https://api.github.com/repos/${repo}/releases/latest`);

    // Deduplicate while preserving order.
    return list.filter((u, i) => list.indexOf(u) === i);
};

/** Fetches text through the native HTTP bridge when available, else window.fetch. */
const fetchText = async (plugin: (n: string) => any, url: string): Promise<string> => {
    const http = plugin('CapacitorHttp');
    if (http) {
        const res = await http.request({ url, method: 'GET', headers: {}, readTimeout: 15000 });
        return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
};

const parseJson = (raw: string): any => {
    const text = raw.trimStart();
    // Drive and GitHub both answer with an HTML page on some failure modes; JSON.parse
    // would throw, but the explicit check produces a clearer diagnostic.
    if (text.startsWith('<')) throw new Error('HTML recu au lieu du manifeste');
    return JSON.parse(raw);
};

export interface DiscoveredManifest {
    version: string;
    releaseDate?: string;
    downloadUrl: string;
    changelog?: string;
    platform?: string;
    /** Where it was found, for diagnostics. */
    source?: string;
}

/**
 * The GitHub releases API wraps assets in { assets: [...] }; the raw files are the
 * manifest itself. Unwrap so callers always get a manifest shape.
 */
const normalize = (raw: any, source: string): any | null => {
    if (raw && Array.isArray(raw.assets)) {
        const asset = raw.assets.find((a: any) =>
            typeof a?.name === 'string' && /version.*android.*\.json$/i.test(a.name)
        ) || raw.assets.find((a: any) => a?.name === 'version-android.json');
        if (!asset || !asset.browser_download_url) return null;
        return { __needsSecondFetch: asset.browser_download_url, __source: source };
    }
    return raw;
};

/**
 * Tries each candidate until one yields a usable Android manifest.
 * Returns null if none do, which is a normal offline / not-yet-published state.
 */
export async function discoverAndroidManifest(
    plugin: (n: string) => any,
    bakedUrl: string
): Promise<DiscoveredManifest | null> {
    const candidates = buildCandidates(bakedUrl);

    for (const candidate of candidates) {
        try {
            const raw = parseJson(await fetchText(plugin, candidate));
            const normalized = normalize(raw, candidate);

            // A release asset gives a second URL to fetch.
            if (normalized && normalized.__needsSecondFetch) {
                const second = parseJson(await fetchText(plugin, normalized.__needsSecondFetch));
                if (isUsableAndroidManifest(second)) {
                    return { ...second, source: normalized.__source };
                }
                continue;
            }

            if (isUsableAndroidManifest(normalized)) {
                return { ...normalized, source: candidate };
            }
        } catch (_) {
            // Try the next candidate. A single unreachable source must not abort
            // discovery, otherwise one dead mirror disables all updates.
        }
    }
    return null;
}
