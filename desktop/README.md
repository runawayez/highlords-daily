# Highlords Daily Desktop (experimental)

Optional Electron shell for people who prefer a GUI over editing `.env` manually.

```bash
cd desktop
npm ci
npm start
```

Build a native package on the target OS:

```bash
npm run dist
```

Targets are NSIS (`.exe`) on Windows, DMG on macOS and AppImage on Linux. Ollama and Chrome/Chromium/Edge are still external prerequisites.
