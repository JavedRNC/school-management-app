# Live preview on an Android phone (no computer) — Termux

Claude pushes code to GitHub → Termux pulls it every 20 s → Expo hot-reloads in Expo Go.

## One-time setup
1. Install **Termux** from F-Droid (f-droid.org) — the Play Store version is outdated.
2. Install **Expo Go** from the Play Store.
3. In Termux, paste:
```bash
pkg update -y && pkg upgrade -y
pkg install -y nodejs-lts git
termux-setup-storage          # optional: lets you see files from Android's file manager
git clone https://github.com/JavedRNC/school-management-app.git
cd school-management-app/mobile
npm install                   # first time takes a while
```

## Every session
**Session 1** (keeps the dev server running):
```bash
termux-wake-lock
cd ~/school-management-app/mobile && npx expo start --offline
```
In Expo Go tap **Enter URL manually** → `exp://127.0.0.1:8081`.
An iPhone on the same Wi-Fi can open `exp://<android-wifi-ip>:8081` (find the IP with `ifconfig`).

**Session 2** (swipe from left edge in Termux → New session) — auto-pull Claude's changes:
```bash
cd ~/school-management-app && while true; do git pull -q --ff-only; sleep 20; done
```
If `package.json` changes, stop session 1 (Ctrl+C), run `npm install`, start again.

## Backend
The app needs the API URL. Easiest: deploy `backend/` on Render (see README) and put that URL in the login screen → *Server settings*.

## Troubleshooting
- Termux killed in background → keep `termux-wake-lock` on and disable battery optimisation for Termux.
- `npm install` fails on a native package → run `pkg install -y build-essential python` and retry; tell Claude the error.
- Blank screen / red error in Expo Go → shake phone → Reload.
