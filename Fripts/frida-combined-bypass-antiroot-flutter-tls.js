/*
    Combined Frida Script
    ---------------------
    1) Anti-Root Bypass (Java layer + native libc hooks)
       Original author: Daniele Linguaglossa (28/07/2021)
       Edited by: Simone Quatrini
    2) Flutter TLS Verification Bypass
       Source: NVISOsecurity/disable-flutter-tls-verification

    Execution order:
      - Anti-root hooks are installed first (inside Java.perform).
      - Flutter TLS bypass is started afterwards; it polls until the
        Flutter library is loaded, so it is safe to call here.

    Usage:
      frida -U -f <package> -l combined_bypass.js
      frida -U -n <process>  -l combined_bypass.js
*/

/* =====================================================================
 * SECTION 1 :: ANTI-ROOT BYPASS
 * ===================================================================== */
Java.perform(function () {

    var RootPackages = [
        "com.noshufou.android.su", "com.noshufou.android.su.elite", "eu.chainfire.supersu",
        "com.koushikdutta.superuser", "com.thirdparty.superuser", "com.yellowes.su",
        "com.koushikdutta.rommanager", "com.koushikdutta.rommanager.license",
        "com.dimonvideo.luckypatcher", "com.chelpus.lackypatch",
        "com.ramdroid.appquarantine", "com.ramdroid.appquarantinepro",
        "com.devadvance.rootcloak", "com.devadvance.rootcloakplus",
        "de.robv.android.xposed.installer", "com.saurik.substrate",
        "com.zachspong.temprootremovejb", "com.amphoras.hidemyroot",
        "com.amphoras.hidemyrootadfree", "com.formyhm.hiderootPremium",
        "com.formyhm.hideroot", "me.phh.superuser",
        "eu.chainfire.supersu.pro", "com.kingouser.com", "com.topjohnwu.magisk"
    ];

    var RootBinaries = ["su", "busybox", "supersu", "Superuser.apk", "KingoUser.apk", "SuperSu.apk", "magisk"];

    var RootProperties = {
        "ro.build.selinux": "1",
        "ro.debuggable": "0",
        "service.adb.root": "0",
        "ro.secure": "1"
    };

    var RootPropertiesKeys = [];
    for (var k in RootProperties) RootPropertiesKeys.push(k);

    var PackageManager    = Java.use("android.app.ApplicationPackageManager");
    var Runtime           = Java.use('java.lang.Runtime');
    var NativeFile        = Java.use('java.io.File');
    var JString           = Java.use('java.lang.String');
    var SystemProperties  = Java.use('android.os.SystemProperties');
    var BufferedReader    = Java.use('java.io.BufferedReader');
    var ProcessBuilder    = Java.use('java.lang.ProcessBuilder');
    var StringBuffer      = Java.use('java.lang.StringBuffer');

    var loaded_classes = Java.enumerateLoadedClassesSync();
    send("[ANTIROOT] Loaded " + loaded_classes.length + " classes!");

    var useKeyInfo        = false;
    var useProcessManager = false;

    send("[ANTIROOT] loaded: " + loaded_classes.indexOf('java.lang.ProcessManager'));

    if (loaded_classes.indexOf('java.lang.ProcessManager') != -1) {
        try {
            //useProcessManager = true;
            //var ProcessManager = Java.use('java.lang.ProcessManager');
        } catch (err) {
            send("[ANTIROOT] ProcessManager Hook failed: " + err);
        }
    } else {
        send("[ANTIROOT] ProcessManager hook not loaded");
    }

    var KeyInfo = null;
    if (loaded_classes.indexOf('android.security.keystore.KeyInfo') != -1) {
        try {
            //useKeyInfo = true;
            //var KeyInfo = Java.use('android.security.keystore.KeyInfo');
        } catch (err) {
            send("[ANTIROOT] KeyInfo Hook failed: " + err);
        }
    } else {
        send("[ANTIROOT] KeyInfo hook not loaded");
    }

    /* ----- PackageManager.getPackageInfo ----- */
    PackageManager.getPackageInfo.overload('java.lang.String', 'int').implementation = function (pname, flags) {
        var shouldFakePackage = (RootPackages.indexOf(pname) > -1);
        if (shouldFakePackage) {
            send("[ANTIROOT] Bypass root check for package: " + pname);
            pname = "set.package.name.to.a.fake.one.so.we.can.bypass.it";
        }
        return this.getPackageInfo.overload('java.lang.String', 'int').call(this, pname, flags);
    };

    /* ----- File.exists ----- */
    NativeFile.exists.implementation = function () {
        var name = NativeFile.getName.call(this);
        var shouldFakeReturn = (RootBinaries.indexOf(name) > -1);
        if (shouldFakeReturn) {
            send("[ANTIROOT] Bypass return value for binary: " + name);
            return false;
        } else {
            return this.exists.call(this);
        }
    };

    /* ----- Runtime.exec overloads ----- */
    var exec  = Runtime.exec.overload('[Ljava.lang.String;');
    var exec1 = Runtime.exec.overload('java.lang.String');
    var exec2 = Runtime.exec.overload('java.lang.String', '[Ljava.lang.String;');
    var exec3 = Runtime.exec.overload('[Ljava.lang.String;', '[Ljava.lang.String;');
    var exec4 = Runtime.exec.overload('[Ljava.lang.String;', '[Ljava.lang.String;', 'java.io.File');
    var exec5 = Runtime.exec.overload('java.lang.String', '[Ljava.lang.String;', 'java.io.File');

    exec5.implementation = function (cmd, env, dir) {
        if (cmd.indexOf("getprop") != -1 || cmd == "mount" || cmd.indexOf("build.prop") != -1 || cmd == "id" || cmd == "sh") {
            var fakeCmd = "grep";
            send("[ANTIROOT] Bypass " + cmd + " command");
            return exec1.call(this, fakeCmd);
        }
        if (cmd == "su") {
            var fakeCmd = "justafakecommandthatcannotexistsusingthisshouldthowanexceptionwheneversuiscalled";
            send("[ANTIROOT] Bypass " + cmd + " command");
            return exec1.call(this, fakeCmd);
        }
        return exec5.call(this, cmd, env, dir);
    };

    exec4.implementation = function (cmdarr, env, file) {
        for (var i = 0; i < cmdarr.length; i = i + 1) {
            var tmp_cmd = cmdarr[i];
            if (tmp_cmd.indexOf("getprop") != -1 || tmp_cmd == "mount" || tmp_cmd.indexOf("build.prop") != -1 || tmp_cmd == "id" || tmp_cmd == "sh") {
                var fakeCmd = "grep";
                send("[ANTIROOT] Bypass " + cmdarr + " command");
                return exec1.call(this, fakeCmd);
            }
            if (tmp_cmd == "su") {
                var fakeCmd = "justafakecommandthatcannotexistsusingthisshouldthowanexceptionwheneversuiscalled";
                send("[ANTIROOT] Bypass " + cmdarr + " command");
                return exec1.call(this, fakeCmd);
            }
        }
        return exec4.call(this, cmdarr, env, file);
    };

    exec3.implementation = function (cmdarr, envp) {
        for (var i = 0; i < cmdarr.length; i = i + 1) {
            var tmp_cmd = cmdarr[i];
            if (tmp_cmd.indexOf("getprop") != -1 || tmp_cmd == "mount" || tmp_cmd.indexOf("build.prop") != -1 || tmp_cmd == "id" || tmp_cmd == "sh") {
                var fakeCmd = "grep";
                send("[ANTIROOT] Bypass " + cmdarr + " command");
                return exec1.call(this, fakeCmd);
            }
            if (tmp_cmd == "su") {
                var fakeCmd = "justafakecommandthatcannotexistsusingthisshouldthowanexceptionwheneversuiscalled";
                send("[ANTIROOT] Bypass " + cmdarr + " command");
                return exec1.call(this, fakeCmd);
            }
        }
        return exec3.call(this, cmdarr, envp);
    };

    exec2.implementation = function (cmd, env) {
        if (cmd.indexOf("getprop") != -1 || cmd == "mount" || cmd.indexOf("build.prop") != -1 || cmd == "id" || cmd == "sh") {
            var fakeCmd = "grep";
            send("[ANTIROOT] Bypass " + cmd + " command");
            return exec1.call(this, fakeCmd);
        }
        if (cmd == "su") {
            var fakeCmd = "justafakecommandthatcannotexistsusingthisshouldthowanexceptionwheneversuiscalled";
            send("[ANTIROOT] Bypass " + cmd + " command");
            return exec1.call(this, fakeCmd);
        }
        return exec2.call(this, cmd, env);
    };

    exec.implementation = function (cmd) {
        for (var i = 0; i < cmd.length; i = i + 1) {
            var tmp_cmd = cmd[i];
            if (tmp_cmd.indexOf("getprop") != -1 || tmp_cmd == "mount" || tmp_cmd.indexOf("build.prop") != -1 || tmp_cmd == "id" || tmp_cmd == "sh") {
                var fakeCmd = "grep";
                send("[ANTIROOT] Bypass " + cmd + " command");
                return exec1.call(this, fakeCmd);
            }
            if (tmp_cmd == "su") {
                var fakeCmd = "justafakecommandthatcannotexistsusingthisshouldthowanexceptionwheneversuiscalled";
                send("[ANTIROOT] Bypass " + cmd + " command");
                return exec1.call(this, fakeCmd);
            }
        }
        return exec.call(this, cmd);
    };

    exec1.implementation = function (cmd) {
        if (cmd.indexOf("getprop") != -1 || cmd == "mount" || cmd.indexOf("build.prop") != -1 || cmd == "id" || cmd == "sh") {
            var fakeCmd = "grep";
            send("[ANTIROOT] Bypass " + cmd + " command");
            return exec1.call(this, fakeCmd);
        }
        if (cmd == "su") {
            var fakeCmd = "justafakecommandthatcannotexistsusingthisshouldthowanexceptionwheneversuiscalled";
            send("[ANTIROOT] Bypass " + cmd + " command");
            return exec1.call(this, fakeCmd);
        }
        return exec1.call(this, cmd);
    };

    /* ----- String.contains ----- */
    JString.contains.implementation = function (name) {
        if (name == "test-keys") {
            send("[ANTIROOT] Bypass test-keys check");
            return false;
        }
        return this.contains.call(this, name);
    };

    /* ----- SystemProperties.get ----- */
    var get = SystemProperties.get.overload('java.lang.String');
    get.implementation = function (name) {
        if (RootPropertiesKeys.indexOf(name) != -1) {
            send("[ANTIROOT] Bypass " + name);
            return RootProperties[name];
        }
        return this.get.call(this, name);
    };

    /* ----- libc fopen ----- */
    Interceptor.attach(Module.findExportByName("libc.so", "fopen"), {
        onEnter: function (args) {
            var path = Memory.readCString(args[0]);
            path = path.split("/");
            var executable = path[path.length - 1];
            var shouldFakeReturn = (RootBinaries.indexOf(executable) > -1);
            if (shouldFakeReturn) {
                Memory.writeUtf8String(args[0], "/notexists");
                send("[ANTIROOT] Bypass native fopen");
            }
        },
        onLeave: function (retval) { }
    });

    /* ----- libc system ----- */
    Interceptor.attach(Module.findExportByName("libc.so", "system"), {
        onEnter: function (args) {
            var cmd = Memory.readCString(args[0]);
            send("[ANTIROOT] SYSTEM CMD: " + cmd);
            if (cmd.indexOf("getprop") != -1 || cmd == "mount" || cmd.indexOf("build.prop") != -1 || cmd == "id") {
                send("[ANTIROOT] Bypass native system: " + cmd);
                Memory.writeUtf8String(args[0], "grep");
            }
            if (cmd == "su") {
                send("[ANTIROOT] Bypass native system: " + cmd);
                Memory.writeUtf8String(args[0], "justafakecommandthatcannotexistsusingthisshouldthowanexceptionwheneversuiscalled");
            }
        },
        onLeave: function (retval) { }
    });

    /* ----- BufferedReader.readLine ----- */
    BufferedReader.readLine.overload('boolean').implementation = function () {
        var text = this.readLine.overload('boolean').call(this);
        if (text === null) {
            // null pass-through
        } else {
            var shouldFakeRead = (text.indexOf("ro.build.tags=test-keys") > -1);
            if (shouldFakeRead) {
                send("[ANTIROOT] Bypass build.prop file read");
                text = text.replace("ro.build.tags=test-keys", "ro.build.tags=release-keys");
            }
        }
        return text;
    };

    /* ----- ProcessBuilder.start ----- */
    var executeCommand = ProcessBuilder.command.overload('java.util.List');
    ProcessBuilder.start.implementation = function () {
        var cmd = this.command.call(this);
        var shouldModifyCommand = false;
        for (var i = 0; i < cmd.size(); i = i + 1) {
            var tmp_cmd = cmd.get(i).toString();
            if (tmp_cmd.indexOf("getprop") != -1 || tmp_cmd.indexOf("mount") != -1 || tmp_cmd.indexOf("build.prop") != -1 || tmp_cmd.indexOf("id") != -1) {
                shouldModifyCommand = true;
            }
        }
        if (shouldModifyCommand) {
            send("[ANTIROOT] Bypass ProcessBuilder " + cmd);
            this.command.call(this, ["grep"]);
            return this.start.call(this);
        }
        if (cmd.indexOf("su") != -1) {
            send("[ANTIROOT] Bypass ProcessBuilder " + cmd);
            this.command.call(this, ["justafakecommandthatcannotexistsusingthisshouldthowanexceptionwheneversuiscalled"]);
            return this.start.call(this);
        }
        return this.start.call(this);
    };

    if (useProcessManager) {
        var ProcManExec        = ProcessManager.exec.overload('[Ljava.lang.String;', '[Ljava.lang.String;', 'java.io.File', 'boolean');
        var ProcManExecVariant = ProcessManager.exec.overload('[Ljava.lang.String;', '[Ljava.lang.String;', 'java.lang.String', 'java.io.FileDescriptor', 'java.io.FileDescriptor', 'java.io.FileDescriptor', 'boolean');

        ProcManExec.implementation = function (cmd, env, workdir, redirectstderr) {
            var fake_cmd = cmd;
            for (var i = 0; i < cmd.length; i = i + 1) {
                var tmp_cmd = cmd[i];
                if (tmp_cmd.indexOf("getprop") != -1 || tmp_cmd == "mount" || tmp_cmd.indexOf("build.prop") != -1 || tmp_cmd == "id") {
                    fake_cmd = ["grep"];
                    send("[ANTIROOT] Bypass " + cmd + " command");
                }
                if (tmp_cmd == "su") {
                    fake_cmd = ["justafakecommandthatcannotexistsusingthisshouldthowanexceptionwheneversuiscalled"];
                    send("[ANTIROOT] Bypass " + cmd + " command");
                }
            }
            return ProcManExec.call(this, fake_cmd, env, workdir, redirectstderr);
        };

        ProcManExecVariant.implementation = function (cmd, env, directory, stdin, stdout, stderr, redirect) {
            var fake_cmd = cmd;
            for (var i = 0; i < cmd.length; i = i + 1) {
                var tmp_cmd = cmd[i];
                if (tmp_cmd.indexOf("getprop") != -1 || tmp_cmd == "mount" || tmp_cmd.indexOf("build.prop") != -1 || tmp_cmd == "id") {
                    fake_cmd = ["grep"];
                    send("[ANTIROOT] Bypass " + cmd + " command");
                }
                if (tmp_cmd == "su") {
                    fake_cmd = ["justafakecommandthatcannotexistsusingthisshouldthowanexceptionwheneversuiscalled"];
                    send("[ANTIROOT] Bypass " + cmd + " command");
                }
            }
            return ProcManExecVariant.call(this, fake_cmd, env, directory, stdin, stdout, stderr, redirect);
        };
    }

    if (useKeyInfo) {
        KeyInfo.isInsideSecureHardware.implementation = function () {
            send("[ANTIROOT] Bypass isInsideSecureHardware");
            return true;
        };
    }

    console.log("[+] Anti-Root hooks installed. Starting Flutter TLS bypass next...");
});


/* =====================================================================
 * SECTION 2 :: FLUTTER TLS VERIFICATION BYPASS
 * ===================================================================== */
var config = {
    "ios": {
        "modulename": "Flutter",
        "patterns": {
            "arm64": [
                "FF 83 01 D1 FA 67 01 A9 F8 5F 02 A9 F6 57 03 A9 F4 4F 04 A9 FD 7B 05 A9 FD 43 01 91 F4 03 00 AA 68 31 00 F0 08 01 40 F9 08 01 40 F9 E8 07 00 F9",
                "FF 83 01 D1 FA 67 01 A9 F8 5F 02 A9 F6 57 03 A9 F4 4F 04 A9 FD 7B 05 A9 FD 43 01 91 F? 03 00 AA ?? 0? 40 F? ?8 ?? 40 F9 ?? ?? 4? F9 ?? 00 00",
                "FF 43 01 D1 F8 5F 01 A9 F6 57 02 A9 F4 4F 03 A9 FD 7B 04 A9 FD 03 01 91 F3 03 00 AA 14 00 40 F9 88 1A 40 F9 15 E9 40 F9 B5 00 00 B4 B6 46 40 F9"
            ],
        },
    },
    "android": {
        "modulename": "libflutter.so",
        "patterns": {
            "arm64": [
                "F? 0F 1C F8 F? 5? 01 A9 F? 5? 02 A9 F? ?? 03 A9 ?? ?? ?? ?? 68 1A 40 F9",
                "F? 43 01 D1 FE 67 01 A9 F8 5F 02 A9 F6 57 03 A9 F4 4F 04 A9 13 00 40 F9 F4 03 00 AA 68 1A 40 F9",
                "FF 43 01 D1 FE 67 01 A9 ?? ?? 06 94 ?? 7? 06 94 68 1A 40 F9 15 15 41 F9 B5 00 00 B4 B6 4A 40 F9",
                "FF C3 01 D1 FD 7B 01 A9 6A A1 0B 94 08 0A 80 52 48 00 00 39 1A 50 40 F9 DA 02 00 B4 48 03 40 F9"
            ],
            "arm": [
                "2D E9 F? 4? D0 F8 00 80 81 46 D8 F8 18 00 D0 F8",
            ],
            "x64": [
                "55 41 57 41 56 41 55 41 54 53 50 49 89 F? 4? 8B ?? 4? 8B 4? 30 4C 8B ?? ?? 0? 00 00 4D 85 ?? 74 1? 4D 8B",
                "55 41 57 41 56 41 55 41 54 53 48 83 EC 18 49 89 FF 48 8B 1F 48 8B 43 30 4C 8B A0 28 02 00 00 4D 85 E4 74",
                "55 41 57 41 56 41 55 41 54 53 48 83 EC 18 49 89 FE 4C 8B 27 49 8B 44 24 30 48 8B 98 D0 01 00 00 48 85 DB"
            ],
            "x86": [
                "55 89 E5 53 57 56 83 E4 F0 83 EC 20 E8 00 00 00 00 5B 81 C3 2B 79 66 00 8B 7D 08 8B 17 8B 42 18 8B 80 88 01"
            ]
        }
    },
    "windows": {
        "modulename": "flutter_windows.dll",
        "patterns": {
            "x64": [
                "41 57 41 56 41 55 41 54 56 57 53 48 83 EC 40 4? 89 CF 48 8B 05 ?? ?? ?? 00 48 31 E0 48 89 44 24 38 4? 8B 31 4? 8B",
                "41 57 41 56 41 55 41 54 56 57 55 53 48 83 EC 38 48 89 CF 48 8B 05 20 45 C6 00 48 31 E0 48 89 44 24 30 48 8B 31 48",
            ]
        }
    },
    "linux": {
        "modulename": "libflutter_linux_gtk.so",
        "patterns": {
            "x64": [
                "55 41 57 41 56 41 55 41 54 53 48 83 EC 18 49 89 FE 4C 8B 27 49 8B 44 24 30 48 8B 98 D0 01 00 00 48 85 DB"
            ]
        }
    }
};

console.log("[+] Pattern version: Jan 26 2026");
console.log("[+] Arch:", Process.arch);
console.log("[+] Platform: ", Process.platform);

var TLSValidationDisabled = false;
var flutterLibraryFound   = false;
var tries                 = 0;
var maxTries              = 5;
var timeout               = 1000;
var androidBypass         = false;

disableTLSValidation();

function disableTLSValidation() {
    if (TLSValidationDisabled) return;

    tries++;
    if (tries > maxTries && !androidBypass) {
        console.warn(`\n`);
        console.warn('[!] Flutter library not found. Possible reasons:');
        console.warn('[!] - The application does not use Flutter');
        console.warn('[!] - The application has not loaded the Flutter library yet');
        console.warn('[!] - You are using an emulator + gadget (https://github.com/NVISOsecurity/disable-flutter-tls-verification/issues/43)');
        console.warn('[!] The script will continue, but is likely to fail');
        console.warn(`\n`);
        androidBypass = true;
    } else {
        if (typeof m === "undefined" || m == null) {
            if (androidBypass) {
                console.log(`[ ] Locating ssl_verify_peer_cert (${tries}/${maxTries})`);
            } else {
                console.log(`[ ] Locating Flutter library ${tries}/${maxTries}`);
            }
        } else {
            console.log(`[ ] Locating ssl_verify_peer_cert (${tries}/${maxTries})`);
        }
    }

    var platformConfig = {};
    if (Java.available) {
        platformConfig = config["android"];
    } else if (Java.available || (typeof Swift !== "undefined" && Swift.available)) {
        platformConfig = config["ios"];
    } else if (Process.platform in config) {
        platformConfig = config[Process.platform];
    } else {
        console.log(`[!] Platform not supported: ${Process.platform}`);
    }

    var m = Process.findModuleByName(platformConfig["modulename"]);

    if (m === null && !androidBypass) {
        setTimeout(disableTLSValidation, timeout);
        return;
    } else {
        if (!androidBypass) {
            console.log(`[+] Flutter library located`);
        }
        if (flutterLibraryFound == false) {
            flutterLibraryFound = true;
            tries = 0;
        }
    }

    if (Process.arch in platformConfig["patterns"]) {
        var ranges;
        if (Java.available) {
            ranges = Process.enumerateRanges({ protection: 'r-x' }).filter(isFlutterRange);
        } else {
            ranges = m.enumerateRanges('r-x');
        }
        findAndPatch(ranges, platformConfig["patterns"][Process.arch], Java.available && Process.arch == "arm" ? 1 : 0);
    } else {
        console.log('[!] Processor architecture not supported: ', Process.arch);
    }

    if (!TLSValidationDisabled) {
        if (tries == maxTries) {
            if (androidBypass) {
                console.warn(`\n`);
                console.warn(`[!] No function matching ssl_verify_peer_cert could be found.`);
                console.warn(`[!] If you are sure that the application is using Flutter, please open an issue:`);
                console.warn(`[!] https://github.com/NVISOsecurity/disable-flutter-tls-verification/issues`);
                console.warn(`\n`);
            } else {
                console.warn(`\n`);
                console.error(`[!] libFlutter was found, but ssl_verify_peer_cert could not be located`);
                console.error(`Please open an issue at https://github.com/NVISOsecurity/disable-flutter-tls-verification/issues`);
                console.warn(`\n`);
            }
            TLSValidationDisabled = true;
        }
    }
}

function findAndPatch(ranges, patterns, thumb) {
    ranges.forEach(range => {
        patterns.forEach(pattern => {
            var matches = Memory.scanSync(range.base, range.size, pattern);
            matches.forEach(match => {
                var info = DebugSymbol.fromAddress(match.address);
                if (info.name) {
                    console.log(`[+] ssl_verify_peer_cert found at offset: ${info.name || match.address}`);
                } else {
                    console.log(`[+] ssl_verify_peer_cert found at location: ${match.address}`);
                }
                TLSValidationDisabled = true;
                hook_ssl_verify_peer_cert(match.address.add(thumb));
                console.log('[+] ssl_verify_peer_cert has been patched');
            });
            if (matches.length > 1) {
                console.log('[!] Multiple matches detected. This can have a negative impact and may crash the app. Please open a ticket');
            }
        });
    });

    setTimeout(disableTLSValidation, timeout);
}

function isFlutterRange(range) {
    if (androidBypass) return true;
    var address = range.base;
    var info = DebugSymbol.fromAddress(address);
    if (info.moduleName != null) {
        if (info.moduleName.toLowerCase().includes("flutter")) {
            return true;
        }
    }
    return false;
}

function hook_ssl_verify_peer_cert(address) {
    Interceptor.replace(address, new NativeCallback((pathPtr, flags) => {
        return 0;
    }, 'int', ['pointer', 'int']));
}
