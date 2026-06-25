// Created by 13rose
setTimeout(function() {
    Java.perform(function() {
        console.log("[*] Universal Root Detection Bypass started...");

        // --- 1. File.exists() bypass ---
        // Created by 13rose
        try {
            var File = Java.use("java.io.File");
            File.exists.implementation = function() {
                var path = this.getAbsolutePath();
                var susPaths = [
                    "/system/app/Superuser.apk",
                    "/sbin/su",
                    "/system/bin/su",
                    "/system/xbin/su",
                    "/data/local/xbin/su",
                    "/data/local/bin/su",
                    "/system/sd/xbin/su",
                    "/system/bin/failsafe/su",
                    "/data/local/su",
                    "/su",
                ];
                if (susPaths.indexOf(path) >= 0) {
                    console.log("[+] Bypass: File.exists -> " + path + " = false");
                    return false;
                }
                return this.exists();
            };
        } catch (e) {
            console.log("[-] File.exists bypass failed: " + e);
        }

        // --- 2. Runtime.exec("su") bypass ---
        // Created by 13rose
        try {
            var Runtime = Java.use("java.lang.Runtime");
            Runtime.exec.overloads.forEach(function(overload) {
                overload.implementation = function() {
                    var cmd = arguments[0];
                    if (typeof cmd === "string" && cmd.includes("su")) {
                        console.log("[+] Bypass: Runtime.exec(\"" + cmd + "\") blocked");
                        throw new Error("Blocked by Frida");
                    } else if (Array.isArray(cmd) && cmd.join(" ").includes("su")) {
                        console.log("[+] Bypass: Runtime.exec(array su) blocked");
                        throw new Error("Blocked by Frida");
                    }
                    return overload.apply(this, arguments);
                };
            });
        } catch (e) {
            console.log("[-] Runtime.exec bypass failed: " + e);
        }

        // --- 3. Build info spoofing ---
        // Created by 13rose
        try {
            var Build = Java.use("android.os.Build");
            Build.TAGS.value = "release-keys";
            Build.FINGERPRINT.value = "generic";
            Build.BOARD.value = "unknown";
            Build.BOOTLOADER.value = "unknown";
            Build.HARDWARE.value = "goldfish";
            console.log("[+] Bypass: Build info spoofed");
        } catch (e) {
            console.log("[-] Build spoofing failed: " + e);
        }

        // --- 4. RootDetectionActivity.isRooted() bypass ---
        // Created by 13rose
        try {
            var RootDetection = Java.use("owasp.sat.agoat.RootDetectionActivity");
            RootDetection.isRooted.implementation = function() {
                console.log("[+] isRooted() returns false");
                return false;
            };
        } catch (e) {
            console.log("[-] RootDetectionActivity bypass failed: " + e);
        }

        // --- 5. SystemProperties.get("...") override ---
        // Created by 13rose
        try {
            var SystemProperties = Java.use('android.os.SystemProperties');
            SystemProperties.get.overload('java.lang.String').implementation = function(key) {
                console.log("[+] Bypass: SystemProperties.get(" + key + ") -> ''");
                return "";
            };
        } catch (e) {
            console.log("[-] SystemProperties bypass failed: " + e);
        }

        // --- 6. RootBeer lib bypass ---
        // Created by 13rose
        try {
            var RootBeer = Java.use("com.scottyab.rootbeer.RootBeer");
            RootBeer.isRooted.implementation = function() {
                console.log("[+] Bypass: RootBeer.isRooted -> false");
                return false;
            };
        } catch (e) {
            console.log("[-] RootBeer hook failed: " + e);
        }

        // --- 7. Xposed detection bypass ---
        // Created by 13rose
        try {
            var XposedBridge = Java.use("de.robv.android.xposed.XposedBridge");
            XposedBridge.hasXposedBridge.implementation = function() {
                console.log("[+] Bypass: Xposed detection -> false");
                return false;
            };
        } catch (e) {
            console.log("[-] Xposed detection bypass failed: " + e);
        }

        // --- 8. Magisk detection bypass (package name based) ---
        // Created by 13rose
        try {
            var pm = Java.use("android.app.ApplicationPackageManager");
            pm.getPackageInfo.overload('java.lang.String', 'int').implementation = function(pkg, flags) {
                if (pkg.includes("magisk")) {
                    console.log("[+] Bypass: Magisk package info blocked");
                    throw new Error("Package not found");
                }
                return this.getPackageInfo(pkg, flags);
            };
        } catch (e) {
            console.log("[-] Magisk detection bypass failed: " + e);
        }

        console.log("[*] All universal hooks successfully applied. Root detection bypass is active.");
        // Created by 13rose
    });
}, 3000);