<div align="center">
  <img src="https://upload.wikimedia.org/wikipedia/commons/d/d6/Nox_App_Player-Icon_and_wordmark3.png" width="300" alt="Nox Logo">
</div>

<h1 align="center">NOXER</h1>

<div align="center">
  <a href="https://python.org"><img src="https://img.shields.io/badge/Python-3.x-3776AB?logo=python&logoColor=white"></a>
  <a href="https://www.bignox.com/"><img src="https://img.shields.io/badge/platform-Windows-0078D6?logo=windows&logoColor=white"></a>
  <a href="https://frida.re"><img src="https://img.shields.io/badge/Frida-17.15.3-FF4444?logo=frida&logoColor=white"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-yellow"></a>
</div>

---

## Why

Nox is great for reverse engineering. But every session you: enable root, install Frida server, push Burp CA, toggle proxy, debloat garbage. That's 15 minutes of clicking per session.

Noxer does it in one command. Dashboard shows live status of ADB, Frida, proxy. No entering Android UI.

## Dashboard

```
  ┌────────────────────────────────────────────────┐
  │  NOXER v1.22β                                  │
  │  ● Nox    ● ADB    ● Frida (host) 17.15.3      │
  │  ● FridaSrv    ● FridaSrv run    ○ Proxy        │
  │  ──────────────────────────────────────────────  │
  │  1. Windows Tools                                │
  │  2. NOX Player Options                           │
  │  3. Frida-Tools Options                          │
  │  4. Exit                                         │
  └────────────────────────────────────────────────┘
```

6 live status badges. Green dot = OK. Red dot = offline. Checks every render.

## Features

| | Category | What it does |
|---|---|---|
| <img src="https://api.iconify.design/bx/bx-trash.svg" width="18" height="18"> | **Debloat** | rm -rf system bloat (AppStore, Facebook, Launcher). Install Rootless Launcher + File Manager. |
| <img src="https://api.iconify.design/bx/bx-cloud-download.svg" width="18" height="18"> | **Frida Server** | Auto-download matching version. Decompress via 7zzs. `chmod +x` & run. |
| <img src="https://api.iconify.design/bx/bx-bug.svg" width="18" height="18"> | **Frida stack** | frida-tools, objection, reFlutter. 32 community hooks in Fripts/. |
| <img src="https://api.iconify.design/bx/bx-check-shield.svg" width="18" height="18"> | **Burp CA** | Fetch `/cert` from proxy, convert DER→PEM→Android hash, push to system trust store. |
| <img src="https://api.iconify.design/bx/bx-wifi.svg" width="18" height="18"> | **Proxy** | Detect local IP + Burp port. `settings put global http_proxy`. `svc wifi toggle` (works on Nox VirtWifi). |
| <img src="https://api.iconify.design/bx/bx-terminal.svg" width="18" height="18"> | **ADB shell** | `nox_adb.exe shell -t su`. Direct root shell to emulator. |
| <img src="https://api.iconify.design/bx/bx-code-block.svg" width="18" height="18"> | **Script picker** | List 32 .js scripts from Fripts/, pick one, inject via `frida -U -l`. |

## Pre-requisites

- **Windows** (Nox runs here)
- **Nox Player** installed & running
- **Python 3.x** + pip

## Quick Start

```bash
git clone https://github.com/sittiev/noxer.git
cd noxer
pip install -r requirements.txt
python noxer.py
```

## Usage

**Step 1** — Open Nox, pick Android version.

<img src="https://i.ibb.co/xDpNZLj/STEP-1.png" alt="Step 1" border="0">

**Step 2** — Click Settings.

<img src="https://i.ibb.co/W3zdv96/STEP-2.png" alt="Step 2" border="0">

**Step 3** — General tab → check **Root**.

<img src="https://i.ibb.co/pLhx6z4/STEP-3.png" alt="Step 3" border="0">

**Step 4** — Save & run emulator.

<img src="https://i.ibb.co/Ln3VvqP/STEP-4.png" alt="Step 4" border="0">

No VT error? [Fix Virtualization](https://aggressiveuser.github.io/OnlineTools/FixVirtualization/)

<img src="https://i.ibb.co/vkHW4bj/image.png" width="300" alt="VT error">

**Step 5** — Run NOXER. Auto-syncs with running Nox.

<img src="https://i.ibb.co/sRPFS80/STEP-5.png" alt="Step 5" border="0">

## Menus

**1. Windows Tools** — Install/verify frida-tools, objection, reFlutter.

**2. NOX Player Options** — Debloat, install/run Frida Server, ADB shell, Burp CA, proxy on/off.

**3. Frida-Tools Options** — List apps via `frida-ps -Uai`, pick script from Fripts/ (32 available), inject to target package.

## Fripts

32 community hooks in `Fripts/`:

| | Category | Scripts |
|---|---|---|
| <img src="https://api.iconify.design/bx/bx-lock-alt.svg" width="18" height="18"> | SSL pinning | universal-android-ssl-pinning-bypass (x2), frida-multiple-unpinning |
| <img src="https://api.iconify.design/bx/bx-lock-open-alt.svg" width="18" height="18"> | Root bypass | rootbeerultimate, fridantiroot, hideroot, scottyab-root-bypass (7 more) |
| <img src="https://api.iconify.design/bx/bx-layer.svg" width="18" height="18"> | Combined | universal-robust-advanced-root-ssl-bypass, pintooR, ssl-and-root-bypass |
| <img src="https://api.iconify.design/bx/bx-key.svg" width="18" height="18"> | Crypto | intercept-android-apk-crypto-operations, aesinfo, okhttp3-interceptor |
| <img src="https://api.iconify.design/bx/bx-search-alt.svg" width="18" height="18"> | Detection | anti-frida-bypass, root-and-emulator-detection-bypass, multiple-root-detection-bypass |

## License

MIT
