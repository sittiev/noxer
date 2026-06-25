#!/usr/bin/env python3
"""NOXER - Nox Player + Frida + Burp Suite TUI"""

import asyncio
import os
import re
import socket
import subprocess
import sys
import time

import psutil

from textual.app import App, ComposeResult
from textual.containers import Container, VerticalScroll
from textual.screen import Screen, ModalScreen
from textual.widgets import Static, Input, RichLog
from textual.binding import Binding
from textual import work

# ── Constants ──────────────────────────────────

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FRIPTS_DIR = os.path.join(SCRIPT_DIR, "Fripts")

# ── Sync helpers (run in worker threads) ───────

def find_nox_path():
    for p in psutil.process_iter(["pid", "name", "exe"]):
        if "Nox.exe" in p.info["name"]:
            return os.path.dirname(p.info["exe"])
    return None


def adb_cmd(*args):
    path = find_nox_path()
    if not path:
        return "", "Nox not found", 1
    cmd = f'"{path}\\nox_adb.exe"'
    for a in args:
        cmd += f" {a}"
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return r.stdout.strip(), r.stderr.strip(), r.returncode


def adb_shell(cmd_str):
    out, _, _ = adb_cmd("shell", cmd_str)
    return out


def collect_status():
    nox_ok = find_nox_path() is not None
    adb_ok = False
    frida_ver = None
    srv_inst = False
    srv_run = False
    proxy_on = False

    if nox_ok:
        out, _, rc = adb_cmd("devices")
        adb_ok = rc == 0 and "device" in out

    try:
        v = subprocess.check_output(
            "frida --version 2>&1", shell=True, text=True, stderr=subprocess.STDOUT
        )
        m = re.search(r"(\d+\.\d+\.\d+)", v.strip())
        frida_ver = m.group(1) if m else None
    except Exception:
        pass

    if adb_ok:
        fi = adb_shell("test -f /data/local/tmp/FridaServer && echo 1 || echo 0")
        srv_inst = "1" in fi
        fr = adb_shell("pgrep -f FridaServer 2>/dev/null || echo ''")
        srv_run = bool(fr.strip())
        pr = adb_shell("settings get global http_proxy")
        proxy_on = pr.strip() not in ("", ":0", "null")

    return {
        "nox": nox_ok,
        "adb": adb_ok,
        "frida_ver": frida_ver,
        "srv_inst": srv_inst,
        "srv_run": srv_run,
        "proxy_on": proxy_on,
        "frida_label": f"Frida ({frida_ver})" if frida_ver else "Frida (host)",
    }


def run_sync(cmd: str) -> str:
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return (r.stdout + r.stderr).strip()


def adb_run_shell(cmd: str) -> str:
    path = find_nox_path()
    if not path:
        return "Nox not found"
    c = f'"{path}\\nox_adb.exe" shell {cmd}'
    r = subprocess.run(c, shell=True, capture_output=True, text=True)
    return (r.stdout + r.stderr).strip()


def adb_run(cmd: str) -> str:
    path = find_nox_path()
    if not path:
        return "Nox not found"
    c = f'"{path}\\nox_adb.exe" {cmd}'
    r = subprocess.run(c, shell=True, capture_output=True, text=True)
    return (r.stdout + r.stderr).strip()


def install_pip(pkg: str) -> str:
    r = subprocess.run(f"pip install {pkg}", shell=True, capture_output=True, text=True)
    return (r.stdout + r.stderr).strip()


# ── Shared widgets ─────────────────────────────

BADGE = "[${}]\u25cf[/] {}"


def mk_badge(label: str, ok: bool) -> str:
    c = "green" if ok else "red"
    return BADGE.format(c, label)


class StatusBar(Static):
    """Auto-refreshing status row."""

    def on_mount(self):
        self.refresh_status()
        self.set_interval(5, self.refresh_status)

    @work(thread=True)
    def refresh_status(self):
        s = collect_status()
        self.call_from_thread(self._update, s)

    def _update(self, s):
        left = f"  {mk_badge('Nox', s['nox'])}  {mk_badge('ADB', s['adb'])}"
        mid = f"  {mk_badge(s['frida_label'], s['frida_ver'] is not None)}  {mk_badge('FridaSrv', s['srv_inst'])}"
        right = f"  {mk_badge('FridaSrv run', s['srv_run'])}  {mk_badge('Proxy', s['proxy_on'])}"
        self.update(f"{left}\n{mid}\n{right}")


class OutputModal(ModalScreen):
    """Full-screen output viewer."""

    def __init__(self, title: str, content: str):
        super().__init__()
        self._title = title
        self._content = content

    def compose(self):
        yield Container(
            Static(f"[bold orange1]{self._title}[/]", id="modal-title"),
            RichLog(id="modal-output", highlight=True, wrap=True),
            Static(" [bold]Press any key or click to close[/]", id="modal-close"),
            id="modal-box",
        )

    def on_mount(self):
        self.query_one("#modal-output").write(self._content)

    def on_key(self, _event):
        self.dismiss()

    def on_click(self):
        self.dismiss()


def show_output(app: App, title: str, content: str):
    app.push_screen(OutputModal(title, content))


# ── Main menu screen ───────────────────────────

class MainScreen(Screen):
    BINDINGS = [
        Binding("1", "app.switch_mode('windows')", "Windows Tools", show=True),
        Binding("2", "app.switch_mode('nox')", "NOX Options", show=True),
        Binding("3", "app.switch_mode('frida')", "Frida Tools", show=True),
        Binding("q", "app.quit", "Quit", show=True),
    ]

    def compose(self):
        yield Container(
            Static("[bold orange1]NOXER  v1.22\u03b2[/]", id="app-title"),
            StatusBar(id="status-bar"),
            Static("", classes="spacer"),
            Static("[bold orange1]MENU[/]", id="menu-title"),
            Static(""),
            Static("  [bold]1[/]  Windows Tools"),
            Static("  [bold]2[/]  NOX Player Options"),
            Static("  [bold]3[/]  Frida-Tools Options"),
            Static("  [bold]q[/]  Quit"),
            Static("", classes="spacer"),
            Static("[dim]Keys: 1-3 navigate | r refresh | q quit[/]", id="hint"),
            id="main-box",
        )


# ── Windows Tools screen ───────────────────────

class WindowsToolsScreen(Screen):
    BINDINGS = [
        Binding("1", "install('frida')", "Frida", show=True),
        Binding("2", "install('objection')", "Objection", show=True),
        Binding("3", "install('reFlutter')", "reFlutter", show=True),
        Binding("escape", "app.switch_mode('main')", "Back", show=True),
    ]

    def compose(self):
        yield Container(
            Static("[bold orange1]Windows Tools[/]", id="screen-title"),
            Static("", classes="spacer"),
            Static("  [bold]1[/]  Frida"),
            Static("  [bold]2[/]  Objection"),
            Static("  [bold]3[/]  reFlutter"),
            Static(""),
            Static("[dim]Keys: 1-3 install | ESC back[/]", id="hint"),
            RichLog(id="win-log", highlight=True, wrap=True, max_lines=50),
            id="win-box",
        )

    def on_mount(self):
        self._check_all()

    @work(thread=True)
    def _check_all(self):
        for name, cmd in [("Frida", "frida --version"), ("Objection", "objection --version"), ("reFlutter", "reFlutter --version")]:
            r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            v = r.stdout.strip() or r.stderr.strip() or "not installed"
            self.call_from_thread(self.query_one("#win-log").write, f"  {name}: {v[:60]}")

    @work(thread=True)
    def _install(self, name: str, pip_name: str, check_cmd: str):
        log = self.query_one("#win-log")
        self.call_from_thread(log.write, f"\n  Checking {name}...")
        r = subprocess.run(check_cmd, shell=True, capture_output=True, text=True)
        if r.returncode == 0:
            v = r.stdout.strip() or r.stderr.strip()
            self.call_from_thread(log.write, f"  [green]\u2713[/] {name} already installed ({v[:40]})")
            return
        self.call_from_thread(log.write, f"  Installing {name} via pip...")
        out = install_pip(pip_name)
        self.call_from_thread(log.write, out[-200:] if len(out) > 200 else out)
        self.call_from_thread(log.write, f"  [green]\u2713[/] {name} installed")

    def action_install(self, name: str):
        pip_map = {"frida": "frida-tools", "objection": "objection", "reFlutter": "reFlutter"}
        check_map = {"frida": "frida --version", "objection": "objection --version", "reFlutter": "reFlutter --version"}
        self._install(name, pip_map[name], check_map[name])


# ── NOX screen ─────────────────────────────────

class NoxScreen(Screen):
    BINDINGS = [
        Binding("1", "action_debloat", "Debloat", show=True),
        Binding("2", "action_install_frida_server", "FridaSrv", show=True),
        Binding("3", "action_run_frida_server", "Run FridaSrv", show=True),
        Binding("4", "action_adb_shell", "ADB Shell", show=True),
        Binding("5", "action_burp_cert", "Burp Cert", show=True),
        Binding("6", "action_proxy_on", "Proxy On", show=True),
        Binding("7", "action_proxy_off", "Proxy Off", show=True),
        Binding("escape", "app.switch_mode('main')", "Back", show=True),
    ]

    _adb_ready = False

    def compose(self):
        yield Container(
            Static("[bold orange1]NOX Player Options[/]", id="screen-title"),
            Static("", classes="spacer"),
            Static("  [bold]1[/]  Remove Ads & Bloatware"),
            Static("  [bold]2[/]  Install Frida Server"),
            Static("  [bold]3[/]  Run Frida Server"),
            Static("  [bold]4[/]  ADB Shell"),
            Static("  [bold]5[/]  Install BurpSuite Cert"),
            Static("  [bold]6[/]  Enable Proxy"),
            Static("  [bold]7[/]  Disable Proxy"),
            Static(""),
            Static("[dim]Keys: 1-7 actions | ESC back[/]", id="hint"),
            RichLog(id="nox-log", highlight=True, wrap=True, max_lines=50),
            id="nox-box",
        )

    def on_mount(self):
        self._connect_adb()

    @work(thread=True)
    def _connect_adb(self):
        log = self.query_one("#nox-log")
        path = find_nox_path()
        if not path:
            self.call_from_thread(log.write, "[red]\u2717[/] Nox not running")
            return
        r = subprocess.run(f'"{path}\\nox_adb.exe" connect 127.0.0.1:62001', shell=True, capture_output=True, text=True)
        out = r.stdout.strip()
        self._adb_ready = "connected" in out
        if self._adb_ready:
            self.call_from_thread(log.write, f"[green]\u2713[/] {out}")
        else:
            self.call_from_thread(log.write, f"[red]\u2717[/] {out}")

    @work(thread=True)
    def _run(self, cmd_fn, desc: str):
        log = self.query_one("#nox-log")
        self.call_from_thread(log.write, f"\n  {desc}...")
        out = cmd_fn()
        self.call_from_thread(log.write, out[-500:] if len(out) > 500 else out)

    def action_debloat(self):
        def fn():
            p = find_nox_path()
            if not p:
                return "Nox not found"
            adb = f'"{p}\\nox_adb.exe"'
            os.system(f"{adb} root && {adb} remount")
            r = subprocess.run(f'{adb} shell rm -rf /system/app/AmazeFileManager /system/app/AppStore /system/app/CtsShimPrebuilt /system/app/EasterEgg /system/app/Facebook /system/app/Helper /system/app/LiveWallpapersPicker /system/app/PrintRecommendationService /system/app/PrintSpooler /system/app/WallpaperBackup /system/app/newAppNameEn', shell=True, capture_output=True, text=True)
            # Install file manager & launcher
            for url, name in [("https://aggressiveuser.github.io/food/fmanager.apk", "fmanager.apk"), ("https://aggressiveuser.github.io/food/rootless.apk", "rootless.apk")]:
                subprocess.run(f'{adb} shell curl -s -L {url} -o /data/local/tmp/{name}', shell=True)
                subprocess.run(f'{adb} shell pm install /data/local/tmp/{name}', shell=True)
            subprocess.run(f'{adb} shell su -c "setprop ctl.restart zygote"', shell=True)
            return "Done. Emulator will reboot.\nSelect Rootless Launcher as default after reboot."
        self._run(fn, "Removing bloatware")

    def action_install_frida_server(self):
        def fn():
            path = find_nox_path()
            if not path:
                return "Nox not found"
            adb = f'"{path}\\nox_adb.exe"'
            try:
                fv = subprocess.check_output("frida --version 2>&1", shell=True, text=True).strip()
                m = re.search(r"(\d+\.\d+\.\d+)", fv)
                if not m:
                    return "Can't detect frida version"
                ver = m.group(1)
            except Exception:
                return "Frida-tools not installed on host"
            arch = subprocess.run(f'{adb} shell getprop ro.product.cpu.abi', shell=True, capture_output=True, text=True).stdout.strip()
            url = f"https://github.com/frida/frida/releases/download/{ver}/frida-server-{ver}-android-{arch}.xz"
            subprocess.run(f'{adb} shell curl -s -L {url} -o /data/local/tmp/FridaServer.xz', shell=True)
            z7 = f"https://aggressiveuser.github.io/food/7zzs-{arch}"
            subprocess.run(f'{adb} shell curl -s -L {z7} -o /data/local/tmp/7zzs', shell=True)
            subprocess.run(f'{adb} shell chmod +x /data/local/tmp/7zzs', shell=True)
            subprocess.run(f'{adb} shell /data/local/tmp/7zzs x /data/local/tmp/FridaServer.xz -o/data/local/tmp/ -bsp1 -bso0', shell=True)
            subprocess.run(f'{adb} shell chmod +x /data/local/tmp/FridaServer', shell=True)
            return f"Frida Server {ver} ({arch}) installed at /data/local/tmp/FridaServer"
        self._run(fn, "Installing Frida Server")

    def action_run_frida_server(self):
        def fn():
            return adb_run_shell("/data/local/tmp/FridaServer &")
        self._run(fn, "Starting Frida Server")

    def action_adb_shell(self):
        def fn():
            path = find_nox_path()
            if path:
                subprocess.run(f'"{path}\\nox_adb.exe" shell -t su', shell=True)
            return "ADB shell session ended"
        self._run(fn, "Opening ADB shell")

    def action_burp_cert(self):
        def fn():
            path = find_nox_path()
            if not path:
                return "Nox not found"
            adb = f'"{path}\\nox_adb.exe"'
            try:
                import requests
                from OpenSSL import crypto
                from requests.exceptions import ConnectionError
                r = requests.get("http://127.0.0.1:8080/cert", timeout=5)
                if r.status_code != 200:
                    return f"HTTP {r.status_code} from Burp"
                with open("cacert.der", "wb") as f:
                    f.write(r.content)
                with open("cacert.der", "rb") as f:
                    c = crypto.load_certificate(crypto.FILETYPE_ASN1, f.read())
                pem = crypto.dump_certificate(crypto.FILETYPE_PEM, c)
                with open("9a5ba575.0", "wb") as f:
                    f.write(pem)
                os.system(f"{adb} root && {adb} remount")
                os.system(f'{adb} push 9a5ba575.0 /system/etc/security/cacerts/')
                os.system(f'{adb} shell chmod 644 /system/etc/security/cacerts/9a5ba575.0')
                return "BurpSuite certificate installed"
            except ConnectionError:
                return "Burp not running on 127.0.0.1:8080"
            except Exception as e:
                return f"Error: {e}"
        self._run(fn, "Installing Burp cert")

    def _get_ip(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
        except:
            return "127.0.0.1"
        finally:
            s.close()

    def _detect_burp_port(self):
        found = []
        try:
            o = subprocess.check_output("netstat -ano", shell=True, text=True, stderr=subprocess.DEVNULL)
            for line in o.splitlines():
                m = re.search(r":(\d+)\s+.*LISTENING", line)
                if m and int(m.group(1)) in [8080, 8081, 8082, 8443, 9090, 8888, 80, 443]:
                    found.append(int(m.group(1)))
        except:
            pass
        for p in [8081, 8080, 8082, 8443, 9090, 8888]:
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(0.3)
                if s.connect_ex(("127.0.0.1", p)) == 0:
                    found.append(p)
                s.close()
            except:
                pass
        return list(set(found))

    def action_proxy_on(self):
        def fn():
            path = find_nox_path()
            if not path:
                return "Nox not found"
            adb = f'"{path}\\nox_adb.exe"'
            ip = self._get_ip()
            ports = self._detect_burp_port()
            port = str(ports[0]) if ports else input("Enter Burp port: ")
            os.system(f'{adb} shell settings put global http_proxy {ip}:{port}')
            os.system(f'{adb} shell svc wifi disable')
            time.sleep(2)
            os.system(f'{adb} shell svc wifi enable')
            return f"Proxy ON: {ip}:{port}"
        self._run(fn, "Enabling proxy")

    def action_proxy_off(self):
        def fn():
            path = find_nox_path()
            if not path:
                return "Nox not found"
            adb = f'"{path}\\nox_adb.exe"'
            os.system(f'{adb} shell settings delete global http_proxy')
            os.system(f'{adb} shell settings delete global global_http_proxy_host')
            os.system(f'{adb} shell settings delete global global_http_proxy_port')
            os.system(f'{adb} shell settings put global http_proxy :0')
            os.system(f'{adb} shell svc wifi disable')
            time.sleep(2)
            os.system(f'{adb} shell svc wifi enable')
            return "Proxy OFF"
        self._run(fn, "Disabling proxy")


# ── Frida Tools screen ─────────────────────────

class FridaScreen(Screen):
    BINDINGS = [
        Binding("1", "action_ps", "List Apps", show=True),
        Binding("2", "action_inject", "Inject Script", show=True),
        Binding("escape", "app.switch_mode('main')", "Back", show=True),
    ]

    def compose(self):
        yield Container(
            Static("[bold orange1]Frida-Tools Options[/]", id="screen-title"),
            Static("", classes="spacer"),
            Static("  [bold]1[/]  List installed apps (frida-ps -Uai)"),
            Static("  [bold]2[/]  Inject script from Fripts/"),
            Static(""),
            Static("[dim]Keys: 1-2 actions | ESC back[/]", id="hint"),
            RichLog(id="frida-log", highlight=True, wrap=True, max_lines=50),
            id="frida-box",
        )

    @work(thread=True)
    def action_ps(self):
        log = self.query_one("#frida-log")
        self.call_from_thread(log.write, "\n  [bold]Installed applications:[/]")
        r = subprocess.run("frida-ps -Uai", shell=True, capture_output=True, text=True)
        out = r.stdout.strip() or r.stderr.strip() or "(no output)"
        self.call_from_thread(log.write, out)

    def action_inject(self):
        self.app.push_screen(ScriptPickerScreen())


# ── Script Picker Screen ─────────────────────────

class ScriptPickerScreen(ModalScreen):
    """Let user pick a script and target package, then inject."""

    def compose(self):
        try:
            scripts = sorted(f for f in os.listdir(FRIPTS_DIR) if f.endswith(".js"))
        except FileNotFoundError:
            scripts = []

        items = [Static(f"  [bold]{i}[/]  {s}") for i, s in enumerate(scripts, 1)]
        yield Container(
            Static("[bold orange1]Select a script to inject[/]", id="modal-title"),
            VerticalScroll(*items, id="script-list"),
            Input(placeholder="Script number (or ESC to cancel)", id="script-input"),
            Input(placeholder="Package name (e.g. com.example.app)", id="pkg-input"),
            Static("", id="inj-status"),
            id="picker-box",
        )

    def on_input_submitted(self, event: Input.Submitted):
        if event.input.id == "script-input":
            # Move focus to package input
            self.query_one("#pkg-input", Input).focus()
        elif event.input.id == "pkg-input":
            self._run_injection()

    def on_key(self, event):
        if event.key == "escape":
            self.dismiss()
        if event.key == "enter":
            self._run_injection()

    @work(thread=True)
    def _run_injection(self):
        try:
            scripts = sorted(f for f in os.listdir(FRIPTS_DIR) if f.endswith(".js"))
        except FileNotFoundError:
            self.call_from_thread(self._set_status, "[red]Fripts/ not found[/]")
            return
        if not scripts:
            self.call_from_thread(self._set_status, "[red]No scripts[/]")
            return

        idx_s = self.query_one("#script-input", Input).value.strip()
        pkg = self.query_one("#pkg-input", Input).value.strip()
        if not idx_s or not pkg:
            return
        try:
            idx = int(idx_s)
            if idx < 1 or idx > len(scripts):
                self.call_from_thread(self._set_status, "[red]Invalid number[/]")
                return
        except ValueError:
            return

        chosen = scripts[idx - 1]
        script_path = os.path.join(FRIPTS_DIR, chosen)
        self.call_from_thread(self._set_status, f"[yellow]Running {chosen} on {pkg}...[/]")
        r = subprocess.run(f'frida -U -l "{script_path}" -f {pkg}', shell=True, capture_output=True, text=True)
        out = (r.stdout + r.stderr).strip() or "(done)"
        self.call_from_thread(self._set_status, f"[green]Done[/]\n{out[:300]}")

    def _set_status(self, msg):
        self.query_one("#inj-status", Static).update(msg)


# ── App ────────────────────────────────────────

CSS = """
Screen {
    background: #0d1117;
}

Container {
    align: center top;
}

Static {
    color: #c9d1d9;
}

#app-title {
    text-align: center;
    text-style: bold;
    color: orange1;
    padding: 1 0;
    background: #161b22;
    width: 100%;
}

#screen-title {
    text-align: center;
    text-style: bold;
    color: orange1;
    padding: 1 0;
    background: #161b22;
    width: 100%;
}

#status-bar {
    margin: 1 2;
    padding: 1 2;
    background: #161b22;
    border: solid #30363d;
    width: 60;
}

#menu-title {
    text-align: center;
    text-style: bold;
    color: orange1;
    margin-top: 1;
}

#main-box, #win-box, #nox-box, #frida-box {
    width: 100%;
    height: 100%;
}

RichLog {
    margin: 1 2;
    padding: 1;
    background: #0d1117;
    border: solid #30363d;
    width: 80%;
    height: 50%;
}

#hint {
    color: #484f58;
    text-align: center;
}

.spacer {
    height: 1;
}

#modal-box {
    align: center middle;
    width: 80%;
    height: 80%;
}

#modal-title {
    text-align: center;
    text-style: bold;
    color: orange1;
    padding: 1;
    background: #161b22;
    width: 100%;
}

#modal-output {
    background: #0d1117;
    border: solid #30363d;
    width: 100%;
    height: 80%;
}

#modal-close {
    text-align: center;
    color: #484f58;
    padding: 1;
}

#picker-box {
    align: center middle;
    width: 80%;
    height: 80%;
}

#script-list {
    height: 60%;
    margin: 1;
    border: solid #30363d;
}

#script-input, #pkg-input {
    margin: 0 1;
    width: 80%;
}

#inj-status {
    color: orange1;
    margin: 1;
}
"""


class NoxerApp(App):
    TITLE = "NOXER"
    CSS = CSS

    MODES = {
        "main": MainScreen,
        "windows": WindowsToolsScreen,
        "nox": NoxScreen,
        "frida": FridaScreen,
    }
    DEFAULT_MODE = "main"


def run():
    app = NoxerApp()
    app.run()


if __name__ == "__main__":
    run()
