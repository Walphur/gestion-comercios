# WalQo Catálogo para Android e iOS

La interfaz del celular queda dentro de la app. Las ventas, el stock y el código de emparejamiento siguen en la API `https://gestion-catalogo-movil.walphur.workers.dev`. Cada comercio entra con su código y el token queda en el almacenamiento de esa instalación.

No es un acceso directo: `capacitor.config.json` no tiene `server.url`. Capacitor carga `www/index.html`.

Identificadores:

- Nombre: WalQo Catálogo
- Android `applicationId`: `pro.walqo.catalogo`
- iOS bundle id: `pro.walqo.catalogo`

## Android en Windows

Hace falta JDK 21 (Gradle 8.11 no compila con JDK 26) y Android SDK 35.

```powershell
cd apps/catalogo-nativo
npm install
npm run apk
```

El APK de prueba queda en `android/app/build/outputs/apk/debug/app-debug.apk`. Está firmado con la clave de depuración de Android, la que genera el SDK. Sirve para instalar en un teléfono con «orígenes desconocidos». No sirve para publicarlo en Play Store.

El Android App Bundle de prueba:

```powershell
npm run aab
```

Queda en `android/app/build/outputs/bundle/debug/app-debug.aab`. Play Store pide un AAB firmado con la clave de subida del comercio, que no está en este repositorio y no hay que inventarla. En Android Studio: Build, Generate Signed Bundle, y ahí se crea o se elige el keystore.

La cámara está declarada en `AndroidManifest.xml`. El lector sigue siendo el de la página (`BarcodeDetector` y, si no está, ZXing empaquetado en `zxing.min.js`). Android WebView pide el permiso al abrir la cámara.

## iOS

Esta máquina es Windows. No hay macOS ni Xcode, así que desde acá no se puede firmar ni generar un `.ipa`.

El proyecto Xcode está en `ios/App`. En un Mac:

1. Instalá Xcode y CocoaPods.
2. `cd apps/catalogo-nativo && npm install && npm run sync`
3. `cd ios/App && pod install`
4. Abrí `ios/App/App.xcworkspace`.
5. El bundle id ya es `pro.walqo.catalogo`. En Signing & Capabilities elegí el equipo de Apple Developer.
6. Para el simulador: Product, Run. No hace falta un certificado de distribución.
7. Para un iPhone: conectalo, elegí el dispositivo y Run. Hace falta un perfil de desarrollo.
8. Para App Store: Product, Archive, y Distribute App.

Firma, sin credenciales en el repo:

- Cuenta de Apple Developer.
- Certificado Apple Distribution.
- App ID `pro.walqo.catalogo` con la capacidad por defecto. No hace falta push.
- Perfil de aprovisionamiento App Store para ese App ID.
- En Xcode, Automatically manage signing puede crear el perfil de desarrollo. El de distribución lo arma el archive si el equipo está elegido.

`Info.plist` ya dice para qué se usa la cámara. Sin esa frase, iOS no abre el lector.

GitHub Actions (`.github/workflows/catalogo-nativo.yml`) compila el simulador en macOS con `CODE_SIGNING_ALLOWED=NO`. Eso no produce un archivo instalable en un iPhone. El APK y el AAB de depuración se publican como artefactos del job de Android.

## Qué quedó probado acá

- La página empaquetada incluye el lector, `/v1/catalog` y el token `walqo_catalog_token`.
- El lector no se reescribió. En la app, ZXing se carga desde `zxing.min.js` en lugar del CDN.
- La API sigue aislada por comercio: el mismo Bearer de siempre.
- No se instaló el APK en un teléfono ni se apuntó la cámara a un código desde el emulador. Eso hay que hacerlo con el archivo generado.
