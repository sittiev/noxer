import os
import re
import socket
import subprocess
import sys
import time
from urllib.request import urlopen, Request

import psutil
import requests
from OpenSSL import crypto
from requests.exceptions import ConnectionError

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FRIPTS_DIR = os.path.join(SCRIPT_DIR, "Fripts")


# ── Nox path ────────────────────────────────────


def get_nox_path():
    return find_nox_installation_path()


def find_nox_installation_path():
    for process in psutil.process_iter(["pid", "name", "exe"]):
        if "Nox.exe" in process.info["name"]:
            return os.path.dirname(process.info["exe"])
    return None


# ── ADB helpers ─────────────────────────────────


def adb_cmd(*args):
    path = get_nox_path()
    if not path:
        return "", "Nox not found", 1
    cmd = f'"{path}\\nox_adb.exe"'
    for a in args:
        cmd += f" {a}"
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return r.stdout.strip(), r.stderr.strip(), r.returncode


def adb_shell(cmd_str):
    out, _, _ = adb_cmd("shell", f'"{cmd_str}"')
    return out


# ── Status checks ───────────────────────────────


def check_nox_running():
    return get_nox_path() is not None


def check_adb_connected():
    try:
        out, _, rc = adb_cmd("devices")
        return rc == 0 and "device" in out
    except Exception:
        return False


def check_frida_host():
    try:
        v = subprocess.check_output(
            "frida --version 2>&1", shell=True, text=True, stderr=subprocess.STDOUT
        )
        m = re.search(r"(\d+\.\d+\.\d+)", v.strip())
        return m.group(1) if m else None
    except Exception:
        return None


def check_frida_server_installed():
    if not check_adb_connected():
        return False
    out = adb_shell("test -f /data/local/tmp/FridaServer && echo 1 || echo 0")
    return "1" in out


def check_frida_server_running():
    if not check_adb_connected():
        return False
    out = adb_shell("ps -A | grep -c FridaServer 2>/dev/null || echo 0")
    try:
        return int(out.strip()) > 0
    except ValueError:
        return False


def check_proxy():
    if not check_adb_connected():
        return False
    out = adb_shell("settings get global http_proxy")
    return out.strip() not in ("", ":0", "null")


# ── ANSI colors ─────────────────────────────────

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
ORANGE = "\033[38;5;208m"
BOLD = "\033[1m"
RESET = "\033[0m"


def badge(label, ok, width=26):
    dot = f"{GREEN}\u25cf{RESET}" if ok else f"{RED}\u25cb{RESET}"
    visible = 2 + len(label)
    pad = max(0, width - visible)
    return f"{dot} {label}{' ' * pad}"


# ── Render ──────────────────────────────────────

W = 62
COL = 26


def render_dashboard():
    os.system("cls" if os.name == "nt" else "clear")

    nox_ok = check_nox_running()
    adb_ok = check_adb_connected() if nox_ok else False
    fv = check_frida_host()
    fv_label = f"Frida (host) {fv}" if fv else "Frida (host)"
    fi_ok = check_frida_server_installed() if adb_ok else False
    fr_ok = check_frida_server_running() if adb_ok else False
    pr_ok = check_proxy() if adb_ok else False

    hdr = f"{ORANGE}{BOLD}NOXER v1.22\u03b2{RESET}"
    hdr_visible = 12

    print()
    print(f"  \u250c{'':-^{W - 4}}\u2510")
    print(f"  \u2502  {hdr}{'':>{W - 6 - hdr_visible}}\u2502")
    print(f"  \u2502{'':^{W - 4}}\u2502")
    print(f"  \u2502  {badge('Nox', nox_ok, COL)}{badge('ADB', adb_ok, COL)}    \u2502")
    print(f"  \u2502  {badge(fv_label, fv is not None, COL)}{badge('FridaSrv', fi_ok, COL)}    \u2502")
    print(f"  \u2502  {badge('FridaSrv run', fr_ok, COL)}{badge('Proxy', pr_ok, COL)}    \u2502")
    print(f"  \u2502{'':^{W - 4}}\u2502")
    print(f"  \u2502{'':^{W - 4}}\u2502")
    print(f"  \u2502  {ORANGE}{BOLD}MENU{RESET}{'':>{W - 12}}\u2502")
    print(f"  \u2502{'':^{W - 4}}\u2502")

    items = [
        ("1", "Windows Tools"),
        ("2", "NOX Player Options"),
        ("3", "Frida-Tools Options"),
        ("4", "Exit"),
    ]
    for num, label in items:
        pad = W - 13 - len(label)
        print(f"  \u2502    {ORANGE}{num}{RESET}. {label}{' ' * pad}  \u2502")

    print(f"  \u2502{'':^{W - 4}}\u2502")
    print(f"  \u2514{'':-^{W - 4}}\u2518")


# ── Original functions ──────────────────────────


def is_tool_installed(tool):
    try:
        subprocess.run([tool], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return True
    except FileNotFoundError:
        return False


def install_tool(tool):
    subprocess.run(["pip", "install", tool])


def connect_to_nox_adb(ip="127.0.0.1", port=62001):
    path = get_nox_path()
    if path:
        adb_command = f'"{path}\\nox_adb.exe" connect {ip}:{port}'
        result = subprocess.run(adb_command, shell=True, text=True, capture_output=True)
        return result.stdout.strip()
    else:
        return "Nox player not installed."


def burpsuite_cacert():
    cert_url = "http://127.0.0.1:8080/cert"
    input_der_file = "cacert.der"
    output_pem_file = "9a5ba575.0"
    path = get_nox_path()

    try:
        response = requests.get(cert_url)

        if response.status_code == 200:
            with open(input_der_file, "wb") as certificate_file:
                certificate_file.write(response.content)
            print("Burp Suite certificate downloaded successfully.")

            with open(input_der_file, "rb") as der_file:
                der_data = der_file.read()
                cert = crypto.load_certificate(crypto.FILETYPE_ASN1, der_data)

            with open(output_pem_file, "wb") as pem_file:
                pem_data = crypto.dump_certificate(crypto.FILETYPE_PEM, cert)
                pem_file.write(pem_data)

            os.system(f'"{path}\\nox_adb.exe" root')
            os.system(f'"{path}\\nox_adb.exe" remount')
            os.system(
                f'"{path}\\nox_adb.exe" push {output_pem_file} /system/etc/security/cacerts/'
            )
            os.system(
                f'"{path}\\nox_adb.exe" shell chmod 644 /system/etc/security/cacerts/{output_pem_file}'
            )
            print(
                "\x1b[1;32mBurpSuite Certificate Install Successfully in Nox Player\x1b[0m"
            )
            print("")

        else:
            print("Error: Unable to download the certificate from the specified URL.")

    except ConnectionError:
        print(
            "Error: Burp Suite is not running or the proxy server is not on 127.0.0.1:8080."
        )
        print("")
    except Exception as e:
        print(f"An unexpected error occurred: {str(e)}")


def open_adb_shell_from_nox():
    path = get_nox_path()
    if path:
        adb_shell_command = f'"{path}\\nox_adb.exe" shell -t su'
        print(
            "\x1b[1;32mOpening ADB Shell. Type 'exit' to return to the main menu.\x1b[0m"
        )
        subprocess.run(adb_shell_command, shell=True)
    else:
        print("\033[91mNox player not installed.\033[0m")


def frida_server_install():
    print("Checking Installed Frida-Tools Version")
    frida_version_output = subprocess.check_output(
        "frida --version 2>&1", shell=True, stderr=subprocess.STDOUT, text=True
    )
    if re.search(r"(\d+\.\d+\.\d+)", frida_version_output):
        frida_version = re.search(r"(\d+\.\d+\.\d+)", frida_version_output).group(1)
        print(f"Frida-Tools Version: {frida_version}")
        path = get_nox_path()

        noxarch = f'"{path}\\nox_adb.exe"  shell getprop ro.product.cpu.abi'
        noxarchre = subprocess.run(
            noxarch, shell=True, text=True, check=True, capture_output=True
        )
        noxarchresult = noxarchre.stdout.strip()
        print(f"CPU Architecture of Nox Emulator: {noxarchresult}")

        print("Downloading Frida-Server With Same Version")
        frida_server_url = f"https://github.com/frida/frida/releases/download/{frida_version}/frida-server-{frida_version}-android-{noxarchresult}.xz"

        downloadfridaserver = f'"{path}\\nox_adb.exe"  shell curl -s -L {frida_server_url} -o /data/local/tmp/FridaServer.xz'
        os.system(downloadfridaserver)
        print("Frida Server downloaded successfully.")

        z7zzsbinurl = f"https://aggressiveuser.github.io/food/7zzs-{noxarchresult}"
        download7zzsbinary = f'"{path}\\nox_adb.exe"  shell curl -s -L {z7zzsbinurl} -o /data/local/tmp/7zzs'
        os.system(download7zzsbinary)
        chmod7zzs = f'"{path}\\nox_adb.exe"  shell chmod +x /data/local/tmp/7zzs'
        os.system(chmod7zzs)

        unzipfridaserver = f'"{path}\\nox_adb.exe"  shell /data/local/tmp/7zzs x /data/local/tmp/FridaServer.xz -o/data/local/tmp/ -bsp1 -bso0'
        os.system(unzipfridaserver)
        print("Frida Server Unziped to Nox Emulator successfully.")

        chmodfridaserver = f'"{path}\\nox_adb.exe"  shell chmod +x /data/local/tmp/FridaServer'
        os.system(chmodfridaserver)
        print("Provided executable permissions to Frida Server.")
        print("\x1b[1;32mFrida Server setup completely on Nox Emulator.\x1b[0m")
        print()
    else:
        print("\033[91mFrida Tools is not installed on this system.\033[0m")


def run_frida_server_new_powershell():
    path = get_nox_path()
    if not path:
        print("Frida server not started on the Nox Player.")
        return
    subprocess.Popen(
        f'"{path}\\nox_adb.exe" shell "/data/local/tmp/FridaServer &"',
        shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    print("\x1b[1;32mFrida Server started in background.\x1b[0m")


def stop_frida_server():
    out = adb_shell("ps -A | grep FridaServer | awk '{print $2}'")
    if not out.strip():
        print("\033[91mFrida Server is not running.\033[0m")
        return
    for pid in out.strip().splitlines():
        adb_shell(f"kill {pid.strip()}")
    print("\x1b[1;32mFrida Server stopped.\x1b[0m")


def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip


def detect_burp_port():
    found = []
    try:
        out = subprocess.check_output(
            "netstat -ano", shell=True, text=True, stderr=subprocess.DEVNULL
        )
        for line in out.splitlines():
            m = re.search(r":(\d+)\s+.*LISTENING", line)
            if m:
                port = int(m.group(1))
                if port in [8080, 8081, 8082, 8443, 9090, 8888, 80, 443]:
                    found.append(port)
    except Exception:
        pass
    for port in [8081, 8080, 8082, 8443, 9090, 8888]:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.3)
            if s.connect_ex(("127.0.0.1", port)) == 0:
                found.append(port)
            s.close()
        except Exception:
            pass
    return list(set(found))


def set_nox_proxy():
    print(
        "\033[91mIMPORTANT: Make sure the WiFi proxy setting on Nox is set to 'None' (not 'Manual') before proceeding.\033[0m"
    )
    ip = get_local_ip()
    ports = detect_burp_port()
    if ports:
        port = str(ports[0])
        print(f"\x1b[1;32mBurp detected on port {port}\x1b[0m")
    else:
        port = input(
            "\033[38;5;208mCouldn't detect Burp port. Enter port: \033[0m"
        ).strip()
    path = get_nox_path()
    adb = f'"{path}\\nox_adb.exe"'
    os.system(f"{adb} shell settings put global http_proxy {ip}:{port}")
    print(f"\x1b[1;32mProxy configured to {ip}:{port}\x1b[0m")
    print("\033[38;5;208mRestarting WiFi to apply changes...\033[0m")
    os.system(f"{adb} shell svc wifi disable")
    time.sleep(2)
    os.system(f"{adb} shell svc wifi enable")
    print("\033[38;5;208mWiFi reconnected.\033[0m")
    print("\x1b[1;32mProxy successfully enabled.\x1b[0m")


def clear_nox_proxy():
    print(
        "\033[91mIMPORTANT: Make sure the WiFi proxy setting on Nox is set to 'None' (not 'Manual') before proceeding.\033[0m"
    )
    path = get_nox_path()
    adb = f'"{path}\\nox_adb.exe"'
    os.system(f"{adb} shell settings delete global http_proxy")
    os.system(f"{adb} shell settings delete global global_http_proxy_host")
    os.system(f"{adb} shell settings delete global global_http_proxy_port")
    os.system(f"{adb} shell settings put global http_proxy :0")
    print("\033[38;5;208mRestarting WiFi to apply changes...\033[0m")
    os.system(f"{adb} shell svc wifi disable")
    time.sleep(2)
    os.system(f"{adb} shell svc wifi enable")
    print("\033[38;5;208mWiFi reconnected.\033[0m")
    print("\x1b[1;32mProxy successfully disabled.\x1b[0m")


def remove_ads_and_bloatware():
    print("Removing Bloatware and Ads from Nox Emulator...")
    path = get_nox_path()
    adb = f'"{path}\\nox_adb.exe"'
    os.system(f"{adb} root")
    os.system(f"{adb} remount")
    fuckads = "rm -rf /system/app/AmazeFileManager /system/app/AppStore /system/app/CtsShimPrebuilt /system/app/EasterEgg /system/app/Facebook /system/app/Helper /system/app/LiveWallpapersPicker /system/app/PrintRecommendationService /system/app/PrintSpooler  /system/app/WallpaperBackup /system/app/newAppNameEn"
    os.system(f'"{path}\\nox_adb.exe" shell {fuckads}')

    print("Installing File Manager...")
    os.system(
        f'"{path}\\nox_adb.exe"  shell curl -s -L https://aggressiveuser.github.io/food/fmanager.apk -o /data/local/tmp/fmanager.apk'
    )
    os.system(
        f'"{path}\\nox_adb.exe" shell pm install /data/local/tmp/fmanager.apk'
    )
    print("Installing Rootless Launcher...")
    os.system(
        f'"{path}\\nox_adb.exe"  shell curl -s -L https://aggressiveuser.github.io/food/rootless.apk -o /data/local/tmp/rootless.apk'
    )
    os.system(
        f'"{path}\\nox_adb.exe" shell pm install /data/local/tmp/rootless.apk'
    )
    print("Rebooting the Nox Emulator...")
    print(
        "\033[38;5;208mAfert Successfull Reboot, Select Rootless Launcher for Always.\033[0m"
    )
    os.system(
        f'"{path}\\nox_adb.exe" shell su -c \'setprop ctl.restart zygote\''
    )
    print("")


def display_nox_options():
    print("")
    print("\033[93mNox Player options:\033[0m")
    print("1. Remove Ads From Nox emulator")
    print("2. Install Frida Server")
    print("3. Run Frida Server (background)")
    print("4. Stop Frida Server")
    print("5. ADB Shell from NOX")
    print("6. Install Burpsuite Certificate")
    print("7. Enable Proxy")
    print("8. Disable Proxy")
    print("9. Back")
    print("")


def display_windows_tools_options():
    print("")
    print("\033[93mChoose a window tool:\033[0m")
    print("1. Frida")
    print("2. Objection")
    print("3. reFlutter")
    print("4. Back")
    print("")


def list_fripts():
    scripts = [f for f in os.listdir(FRIPTS_DIR) if f.endswith(".js")]
    return sorted(scripts)


def fetch_codeshare_scripts(page=1):
    """Scrape CodeShare browse page. Returns (scripts, total_pages)."""
    scripts = []
    total_pages = 1
    try:
        url = f"https://codeshare.frida.re/browse?page={page}"
        resp = requests.get(url, timeout=10)
        if resp.status_code != 200:
            return scripts, 1
        html = resp.text
        pat = re.compile(
            r'<h2><a href="https://codeshare\.frida\.re/@([^/]+)/([^"/]+)/">([^<]+)</a></h2>'
        )
        for m in pat.finditer(html):
            author = m.group(1)
            slug = m.group(2)
            title = m.group(3)
            scripts.append({
                "title": title, "author": author,
                "slug": f"{author}/{slug}", "source": "codeshare",
            })
        pages = re.findall(r'\?page=(\d+)', html)
        if pages:
            total_pages = max(int(p) for p in pages)
    except Exception:
        pass
    return scripts, total_pages


def get_all_scripts(page=1):
    """Combine local + online CodeShare scripts for given page."""
    local = [{"title": s.replace(".js", ""), "path": s, "source": "local"}
             for s in list_fripts()]
    local_titles = {s["title"].lower() for s in local}
    online, total_pages = fetch_codeshare_scripts(page)
    online = [s for s in online if s["title"].lower() not in local_titles]
    return local + online, total_pages


def frida_tool_options():
    print("")
    print("\033[93mFrida-Tool Options:\033[0m")
    print("1. List installed applications (frida-ps -Uai)")
    print("2. Inject script (local Fripts/ + online CodeShare)")
    print("3. Manual: frida -U -l <script> -f <package>")
    print("4. Back")
    print("")


def run_frida_tool_option(opt):
    if opt == "1":
        print("Listing installed applications:")
        os.system("frida-ps -Uai")
        print("")
    elif opt == "2":
        page = 1
        while True:
            scripts, total_pages = get_all_scripts(page)
            if not scripts:
                print("\033[91mNo scripts available.\033[0m")
                return
            num_local = len(list_fripts())
            print("\n\033[93mAvailable scripts:\033[0m")
            if num_local > 0:
                print(f"  \033[92m-- Local (Fripts/) --\033[0m")
                for i, s in enumerate(scripts[:num_local], 1):
                    print(f"  {i:>3}. {s['title']}")
            online_slice = scripts[num_local:]
            if online_slice:
                print(f"  \033[96m-- Online (CodeShare page {page}/{total_pages}) --\033[0m")
                for i, s in enumerate(online_slice, num_local + 1):
                    print(f"  {i:>3}. {s['title']} (\033[38;5;208m{s['slug']}\033[0m)")
            print()
            nav = ""
            if page > 1:
                nav += "  p. Prev page"
            if page < total_pages and online_slice:
                nav += "  n. Next page" if not nav else "    n. Next page"
            if nav:
                print(nav)
                print()
            inp = input("\033[38;5;208mSelect [num, n=next, p=prev, b=back]: \033[0m").strip().lower()
            if inp == "b":
                break
            if inp in ("n", "next"):
                if page < total_pages:
                    page += 1
                continue
            if inp in ("p", "prev"):
                if page > 1:
                    page -= 1
                continue
            try:
                idx = int(inp)
            except ValueError:
                print("\033[91mInvalid input.\033[0m")
                continue
            if idx < 1 or idx > len(scripts):
                print("\033[91mInvalid selection.\033[0m")
                continue
            chosen = scripts[idx - 1]
            package_name = input(
                "\033[38;5;208mEnter the application package name: \033[0m"
            ).strip()
            if not package_name:
                print("\033[91mPackage name cannot be empty.\033[0m")
                continue
            if chosen["source"] == "local":
                script_path = os.path.join(FRIPTS_DIR, chosen["path"])
                os.system(f'frida -U -l "{script_path}" -f {package_name}')
            else:
                os.system(f"frida -U --codeshare {chosen['slug']} -f {package_name}")
            print("")
            break
    elif opt == "3":
        print("\n\x1b[1;32mUsage: frida -U -l <script> -f <package>\033[0m")
        print("  Or: frida -U --codeshare author/name -f <package>")
        print("Scripts available in: %s" % FRIPTS_DIR)
        print("")
    else:
        print("\033[91mInvalid choice.\033[0m")


# ── Main loop ───────────────────────────────────

if __name__ == "__main__":
    while True:
        render_dashboard()
        choice = input(f"\n  {ORANGE}Enter your choice:{RESET} ")

        if choice == "1":
            while True:
                display_windows_tools_options()
                tool_choice = input("\033[38;5;208mEnter your choice: \033[0m")

                if tool_choice == "1":
                    if is_tool_installed("frida"):
                        print("Frida is already installed.")
                    else:
                        install_tool("frida-tools")
                        print("Frida installed successfully.")
                elif tool_choice == "2":
                    if is_tool_installed("objection"):
                        print("Objection is already installed.")
                    else:
                        install_tool("objection")
                        print("Objection installed successfully.")
                elif tool_choice == "3":
                    if is_tool_installed("reFlutter"):
                        print("reFlutter is already installed.")
                    else:
                        install_tool("reFlutter")
                        print("reFlutter installed successfully.")
                elif tool_choice == "4":
                    break
                else:
                    print("\033[91mInvalid choice.\033[0m")

        elif choice == "2":
            path = get_nox_path()
            if path:
                while True:
                    adb_output = connect_to_nox_adb()
                    if "connected to" in adb_output:
                        print("\x1b[1;32mADB Connected to Nox Emulator.\x1b[0m")
                        display_nox_options()
                        nox_choice = input("\033[38;5;208mEnter your choice: \033[0m")
                        if nox_choice == "9":
                            break
                        elif nox_choice == "8":
                            clear_nox_proxy()
                        elif nox_choice == "7":
                            set_nox_proxy()
                        elif nox_choice == "6":
                            burpsuite_cacert()
                        elif nox_choice == "5":
                            open_adb_shell_from_nox()
                        elif nox_choice == "4":
                            stop_frida_server()
                        elif nox_choice == "3":
                            run_frida_server_new_powershell()
                        elif nox_choice == "2":
                            frida_server_install()
                        elif nox_choice == "1":
                            remove_ads_and_bloatware()
                        else:
                            print("\033[91mInvalid choice.\033[0m")
                    else:
                        print("\033[91mNox Player is not running.\033[0m")
                        break
            else:
                print("\033[91mNox Player is not running or not installed.\033[0m")

        elif choice == "3":
            while True:
                frida_tool_options()
                frida_choice = input(
                    "\033[38;5;208mEnter your Frida tool choice: \033[0m"
                )
                if frida_choice == "4":
                    break
                run_frida_tool_option(frida_choice)

        elif choice == "4":
            print("\033[91mExiting...\033[0m")
            break

        else:
            print("\033[91mInvalid choice.\033[0m")
