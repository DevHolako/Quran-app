# تطبيق القرآن الكريم — Android (APK)

Ce document explique la chaîne de build Android. L'application Windows (Electron)
et l'application Android (Capacitor) partagent **tout le renderer** : `src/renderer/**`
est identique sur les deux plateformes.

---

## 1. Prérequis

Installés automatiquement par ces chemins, sinon définis les variables :

| Outil | Emplacement par défaut | Variable |
|---|---|---|
| JDK 21 (Temurin) | `%LOCALAPPDATA%\Android\jdk21` | `JAVA_HOME` |
| Android SDK | `%LOCALAPPDATA%\Android\Sdk` | `ANDROID_HOME` |
| platforms 36 + build-tools 36.0.0 | — | — |

`scripts/gradle.js` détecte ces emplacements automatiquement et régénère
`android/local.properties`, donc un `npm run apk` fonctionne sans configuration
préalable une fois JDK + SDK installés.

---

## 2. Commandes

```bash
npm run android:sync   # build du bundle web + copie dans le projet Android
npm run android:test   # smoke test headless (Chrome) du bundle, bridge Capacitor simulé
npm run apk:debug      # APK debug  -> android/app/build/outputs/apk/debug/
npm run apk            # APK release signé -> android/app/build/outputs/apk/release/
npm run apk:install    # installe le debug sur l'appareil branché en USB
npm run apk:clean      # clean Gradle
npm run fonts:update   # régénère les polices locales depuis Google Fonts
```

---

## 3. Ce qui a changé par rapport à la version Electron

### 3.1 Le pont de plateforme — `src/renderer/js/platform.ts`

Importé **en premier** par `app.ts`. Sur Android il :

1. **Patche `window.fetch`** pour router toutes les requêtes HTTP à travers
   `CapacitorHttp`. Indispensable : le WebView Android applique CORS, ce qui
   bloquerait `api.alquran.cloud`, `api.quran.com`, `cdn.jsdelivr.net` et les CDN
   audio. Côté Electron, `webSecurity: false` faisait le même travail.
2. **Installe un shim `window.desktopAPI`** avec exactement la même surface que
   l'ancien `preload.ts`, donc **aucun autre module n'a besoin d'être modifié**.

| Méthode Electron | Implémentation Android |
|---|---|
| `showNotification` | `@capacitor/local-notifications` (permission runtime) |
| `openExternalUrl` | `@capacitor/browser`, repli sur `App.openUrl` |
| `getAppVersion` | `@capacitor/app` → `getInfo()` |
| `minimize` | `App.minimizeApp()` |
| `maximize`, `isMaximized` | no-op (sans objet sur mobile) |
| `close` | `App.exitApp()` |
| `onNavigate` (tray) | no-op — les mêmes destinations sont dans la barre du haut |
| `checkForUpdates` | `CapacitorHttp` + comparaison de versions + garde-fou APK |
| `downloadUpdate` | plugin natif `ApkUpdater` |

Les plugins sont lus via le registre runtime `window.Capacitor.Plugins.*` et non
par des imports statiques : le build Electron n'embarque ainsi aucun code
Capacitor, et `npm run build` / `npm run dist` continuent de fonctionner.

### 3.2 Rétro-port de correctifs depuis le rapport d'audit

- `App.init()` ne s'interrompt plus sur un échec réseau. Avant, une seule erreur
  de chargement de sourate empêchait `attachGlobalEvents()`, `setupIPCListeners()`
  et `initLucide()` de tourner — donc plus aucun raccourci clavier ni icône
  pendant toute la session.
- L'URL de mise à jour est enfin câblée : le champ des paramètres enregistre
  réellement la valeur (`setUpdateUrl` n'était jamais appelé) et le check
  automatique est désactivé tant qu'aucun canal n'est configuré.

### 3.3 Polices locales

`src/renderer/fonts/` (0,8 Mo, 18 fichiers woff2) remplace l'`@import`
Google Fonts. Un APK doit rendre correctement hors-ligne, ce que l'import
réseau rendait impossible.

### 3.4 CSS mobile — `src/renderer/css/mobile.css`

Le layout desktop (sidebar 320 px + dock 84 px) ne tient pas sur un téléphone.
Surcharges appliquées :

- sidebar → **drawer coulissant** piloté par `body.sidebar-open` + scrim
- barre du haut → boutons **icônes seules** (`font-size: 0`), défilement horizontal
- dock audio → **grille 2 lignes** (sourate + boutons + barre de progression)
- tiroir tafsir → pleine largeur ; modales → **bottom sheet**
- cibles tactiles ≥ 40–44 px, `env(safe-area-inset-*)` pour les encoches
- `App.toggleSidebar()` bascule entre drawer (< 1024 px) et sidebar dockée (≥ 1024 px)

### 3.5 Natif — `android/app/src/main/java/com/qquran/creator/ApkUpdaterPlugin.java`

Téléchargement de l'APK de mise à jour avec progression, puis installation via
`FileProvider` + `ACTION_VIEW` :

- réécrit l'URL Drive `/view` en endpoint `drive.usercontent` direct
- contourne l'interstitiel « virus scan » de Google Drive
- conserve un cookie jar entre les redirections
- installé depuis `MainActivity.onCreate()` via `registerPlugin()`

### 3.6 Manifeste — `android/app/src/main/AndroidManifest.xml`

Permissions ajoutées : `POST_NOTIFICATIONS`, `REQUEST_INSTALL_PACKAGES`,
`WAKE_LOCK`, `VIBRATE`, `FOREGROUND_SERVICE`, `ACCESS_NETWORK_STATE`.
`android:usesCleartextTraffic="true"` (certains CDN audio ne sont pas en HTTPS).

---

## 4. Signature

`android/keystore.properties` (git-ignoré) est lu par `android/app/build.gradle`.
S'il est absent, le build release retombe sur le keystore debug — pratique pour
tester, **invalide pour une vraie publication**.

```properties
storeFile=quran-release.jks
storePassword=...
keyAlias=quran-release
keyPassword=...
```

Créer un keystore :

```bash
keytool -genkeypair -v -keystore android/quran-release.jks -storetype JKS \
        -keyalg RSA -keysize 2048 -validity 10950 -alias quran-release
```

> **`versionCode` et `versionName` sont dérivés de `package.json`** :
> `versionCode = major * 10000 + minor * 100 + patch` (donc `1.0.4` → `10004`).
> Ne les écrivez plus dans `android/keystore.properties` sauf pour forcer une valeur :
> le pin local sur `1.0.4` a été supprimé parce qu'il figeait les versions
> suivantes à `1`, ce qui rendait toute mise à jour installable impossible.
> Android refuse d'installer un `versionCode` inférieur ou égal à celui déjà installé,
> et `ApkUpdaterPlugin` revérifie ce point côté natif.

---

## 5. Auto-update & GitHub Releases

Les versions et manifestes sont publiés directement sur **GitHub Releases** :

| Canal | Fichier | Source de téléchargement |
|---|---|---|
| Desktop (`.exe`) | `version.json` | `https://github.com/DevHolako/Quran-app/releases/download/vX.Y.Z/Quran_App_Setup_X.Y.Z.exe` |
| Android (`.apk`) | `version-android.json` | `https://github.com/DevHolako/Quran-app/releases/download/vX.Y.Z/Quran_App_X.Y.Z.apk` |

### Fonctionnement du Self-Update (In-App comme AdGuard)
1. **Détection** : L'APK interroge GitHub Releases (`/releases/latest/download/version-android.json` et `raw.githubusercontent.com/DevHolako/Quran-app/main/version-android.json`).
2. **Téléchargement In-App** : Lors du clic sur "تحديث وتثبيت تلقائي الآن", l'APK est téléchargé en arrière-plan avec suivi de progression (0% à 100%). L'utilisateur **n'est pas redirigé vers un navigateur**.
3. **Installation automatique** : Dès la fin du téléchargement, le plugin `ApkUpdaterPlugin` lance l'installateur système Android via `FileProvider`.
4. **Gestion de l'autorisation d'installation** : Si l'autorisation d'installer des applications inconnues est requise (Android 8+), l'application guide l'utilisateur vers les paramètres, conserve l'APK téléchargé en cache, et relance l'installation automatiquement au retour sur l'application.

### Pipeline CI/CD GitHub Actions
Le workflow `.github/workflows/release.yml` :
- Se déclenche **uniquement lors d'un `push` sur la branche `main`** lorsqu'une nouvelle version est détectée (comparaison du tag `vX.Y.Z`).
- Compile le binaire Windows (`.exe`) et l'APK Android (`.apk`).
- Génère les manifestes `version.json` et `version-android.json`.
- Crée la release GitHub avec tous les artefacts au même endroit.
- Met à jour les manifestes sur `main` avec `[skip ci]`.

---

## 6. Tests

### 6.1 Smoke test headless (sans appareil)

`npm run android:test` démarre Chrome headless, sert `./www`, **simule le bridge
Capacitor** et vérifie :

- le shim `platform.ts` s'installe et les modules se chargent
- 114 sourates listées, texte d'Al-Fatiha chargé via le pont HTTP natif
- toutes les icônes lucide rendues, police Amiri chargée
- `mobile.css` chargé, drawer fonctionnel en viewport 412×915
- l'audio de récitation est streamé en distant **avec** les timestamps de versets
- le tafsir se charge
- une notification locale est planifiée
- un manifeste APK est détecté comme mise à jour, un manifeste `.exe` est rejeté
- le téléchargement d'APK atteint bien le plugin natif
- zéro erreur console, zéro exception

### 6.2 Test sur appareil réel ou émulateur (adb)

```bash
npm run android:device                       # appareil/emulateur déjà lancé
npm run android:device -- --connect 127.0.0.1:62001   # Nox, 1re instance
npm run android:emulator                     # démarre l'AVD quran_api36 puis teste
npm run apk:inspect && npm run android:device:dom    # inspection du DOM sur l'appareil
```

**Détection automatique de l'adb.** Les émulateurs tiers (Nox, LDPlayer, MuMu,
BlueStacks) ne passent pas par le serveur adb du SDK et chaque client embarque sa
propre version. Un client et un serveur de versions différentes se expulsent
mutuellement à chaque appel, ce qui fait clignoter l'appareil dans `adb devices`.
Le script détecte donc le binaire adb du fournisseur et l'utilise **pour toute la
session** (`D:\Program Files\Nox\bin\nox_adb.exe` dans notre cas). Forçable via la
variable d'environnement `ADB`.

Ports scannés : `62001-62032` (Nox/MEmu), `5554-5557` (AVD, LDPlayer,
BlueStacks, Genymotion).

`device-test.js` installe l'APK release, le lance, puis contrôle : installation,
version, permissions **adaptées au niveau d'API** (`POST_NOTIFICATIONS` n'existe
qu'à partir d'API 33, `REQUEST_INSTALL_PACKAGES` à partir d'API 26), processus
vivant, fenêtre active, absence de `FATAL EXCEPTION` / ANR / erreur WebView,
joignabilité des API depuis l'appareil, puis dépose des captures dans
`test-artifacts/`.

**`device-dom.js` va plus loin** : il se connecte au WebView via le Chrome
DevTools Protocol (`adb forward localabstract:webview_devtools_remote_<pid>`) et
interroge **le DOM réellement rendu sur l'appareil** — nombre de sourates, texte
chargé, polices, viewport, appels de plugins, erreurs console et requêtes réseau.
C'est le seul contrôle qui prouve que l'UI fonctionne, logcat ne capturant pas les
messages `console`.

> Le mode inspection est **désactivé par défaut**. Il active
> `webContentsDebuggingEnabled` et `loggingBehavior: development` dans
> `capacitor.config.json` ; le laisser actif en production permettrait à quiconque a
> un accès adb de lire le DOM et d'exécuter du JavaScript dans l'app.
> `node scripts/build-android.js` sans `--inspect` rétablit la configuration
> sûre — **à refaire avant toute publication**.

### 6.3 L'émulateur du SDK exige WHPX

Le CPU doit supporter VT-x. Vérifier :

```bash
emulator -accel-check     # doit afficher "accel: 1" ou "2"
```

Si `accel: 6` (« hypervisor driver not installed »), activer WHPX dans une
PowerShell **administrateur**, puis redémarrer :

```powershell
Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform -All
```

> HAXM a été retiré du SDK et ne fonctionne pas sous Hyper-V. WHPX est la seule
> voie sur Windows 10/11.

Créer un AVD si besoin :

```bash
npm run avd        # installe emulator + system-images;android-36 et crée quran_api36
```

Sur cette machine (pas de WHPX), `npm run emulator:probe` a établi que **seule**
la combinaison `-accel off -gpu off -cores 2` survit : tous les backends GPU
logiciels et 4 cœurs font crasher QEMU avec `0xC0000005`. Même avec cette
configuration, le boot en émulation logicielle est trop lent pour être exploitable
— d'où le recours à NoxPlayer.

---

## 7. Limites connues

- **Pas de lecture en arrière-plan.** Le WebView garde l'audio en fond en
  théorie, mais sans *foreground service* ni *MediaSession* le système peut le
  tuer en arrière-plan, et il n'y a pas de contrôle depuis le lockscreen. Pour
  une app de récitation c'est la principale prochaine étape.
- **Pas de lecture hors-ligne.** Le texte des sourahs et le tafsir sont mis en
  cache dans `localStorage`, mais l'audio est re-streamé à chaque lecture.
- **Cache non borné.** `surah_cache_*` et `tafsir_cache_*` n'expirent jamais et
  `Storage.set()` ignore silencieusement les erreurs de quota.
- **`webSecurity: false` reste actif sur la version Electron** — à corriger
  indépendamment de ce portage.
