// ================================================================
// Script Frida - Bypass Completo "I Am Not A Developer"
// Replica o módulo Xposed IAmNotADeveloper com hooks em Java e Native
// Uso: frida -U -f <pacote> -l iamnotadeveloper_complete.js --no-pause
// ================================================================

Java.perform(function() {
    console.log("[*] IAmNotADeveloper (completo) carregado.");

    // =================================================================
    // 1. HOOKS em Settings.Global e Settings.Secure (camada Java)
    // =================================================================
    var Global = Java.use("android.provider.Settings$Global");
    var Secure = Java.use("android.provider.Settings$Secure");

    // Lista de chaves que queremos bloquear
    var blockedKeys = [
        "development_settings_enabled",
        "adb_enabled",
        "adb_wifi_enabled"
    ];

    function isBlocked(key) {
        return blockedKeys.indexOf(key) !== -1;
    }

    // --- Global.getInt (2 overloads) ---
    Global.getInt.overload('android.content.ContentResolver', 'java.lang.String')
        .implementation = function(resolver, name) {
            if (isBlocked(name)) {
                console.log("[Bypass] Global.getInt(" + name + ") -> 0");
                return 0;
            }
            return this.getInt(resolver, name);
        };

    Global.getInt.overload('android.content.ContentResolver', 'java.lang.String', 'int')
        .implementation = function(resolver, name, def) {
            if (isBlocked(name)) {
                console.log("[Bypass] Global.getInt(" + name + ", def) -> 0");
                return 0;
            }
            return this.getInt(resolver, name, def);
        };

    // --- Global.getString ---
    Global.getString.overload('android.content.ContentResolver', 'java.lang.String')
        .implementation = function(resolver, name) {
            if (isBlocked(name)) {
                console.log("[Bypass] Global.getString(" + name + ") -> '0'");
                return "0";
            }
            return this.getString(resolver, name);
        };

    // --- Secure.getInt (2 overloads) ---
    Secure.getInt.overload('android.content.ContentResolver', 'java.lang.String')
        .implementation = function(resolver, name) {
            if (isBlocked(name)) {
                console.log("[Bypass] Secure.getInt(" + name + ") -> 0");
                return 0;
            }
            return this.getInt(resolver, name);
        };

    Secure.getInt.overload('android.content.ContentResolver', 'java.lang.String', 'int')
        .implementation = function(resolver, name, def) {
            if (isBlocked(name)) {
                console.log("[Bypass] Secure.getInt(" + name + ", def) -> 0");
                return 0;
            }
            return this.getInt(resolver, name, def);
        };

    // --- Secure.getString ---
    Secure.getString.overload('android.content.ContentResolver', 'java.lang.String')
        .implementation = function(resolver, name) {
            if (isBlocked(name)) {
                console.log("[Bypass] Secure.getString(" + name + ") -> '0'");
                return "0";
            }
            return this.getString(resolver, name);
        };

    // =================================================================
    // 2. HOOKS em SystemProperties (camada Java)
    // =================================================================
    var SystemProperties = Java.use("android.os.SystemProperties");

    var blockedNativeProps = [
        "sys.usb.state",
        "sys.usb.config",
        "persist.sys.usb.reboot.func",
        "init.svc.adbd",
        "sys.usb.configfs",
        "sys.usb.ffs.ready"
    ];

    function isNativePropBlocked(key) {
        return blockedNativeProps.indexOf(key) !== -1;
    }

    SystemProperties.get.overload('java.lang.String')
        .implementation = function(key) {
            if (isNativePropBlocked(key)) {
                console.log("[Bypass] SystemProperties.get(" + key + ") -> ''");
                return "";
            }
            return this.get(key);
        };

    SystemProperties.get.overload('java.lang.String', 'java.lang.String')
        .implementation = function(key, def) {
            if (isNativePropBlocked(key)) {
                console.log("[Bypass] SystemProperties.get(" + key + ", def) -> ''");
                return "";
            }
            return this.get(key, def);
        };

    // =================================================================
    // 3. Bypass para Debug.isDebuggerConnected()
    // =================================================================
    var Debug = Java.use("android.os.Debug");
    Debug.isDebuggerConnected.implementation = function() {
        console.log("[Bypass] Debug.isDebuggerConnected() -> false");
        return false;
    };

    // =================================================================
    // 4. (Opcional) Ocultar "test-keys" no Build.TAGS
    // =================================================================
    var Build = Java.use("android.os.Build");
    Object.defineProperty(Build.class, "TAGS", {
        get: function() {
            console.log("[Bypass] Build.TAGS -> 'release-keys'");
            return "release-keys";
        }
    });

    // =================================================================
    // 5. HOOK NATIVO em __system_property_get (libc)
    //    Impede leitura direta de propriedades via C/C++
    // =================================================================
    var nativeGet = Module.findExportByName("libc.so", "__system_property_get");
    if (nativeGet) {
        Interceptor.attach(nativeGet, {
            onEnter: function(args) {
                // args[0] = const char* name
                // args[1] = char* value (buffer de saída)
                var key = Memory.readUtf8String(args[0]);
                if (isNativePropBlocked(key)) {
                    console.log("[Nativo] __system_property_get(" + key + ") bloqueada");
                    // Escreve string vazia no buffer
                    Memory.writeUtf8String(args[1], "");
                    this.bypass = true;
                }
            },
            onLeave: function(retval) {
                if (this.bypass) {
                    // Retorna 0 indicando que a string tem 0 bytes (propriedade não encontrada)
                    retval.replace(0);
                }
            }
        });
        console.log("[*] Hook nativo __system_property_get aplicado.");
    } else {
        console.warn("[!] __system_property_get não encontrado na libc. Pode ser que o Android use outra função.");
    }

    // =================================================================
    // 6. (EXTRA) Hook em Runtime.exec para evitar verificações de binários
    //    Descomente se o app tentar executar comandos como "which adb"
    // =================================================================
    /*
    var Runtime = Java.use("java.lang.Runtime");
    Runtime.exec.overload('java.lang.String').implementation = function(cmd) {
        if (cmd.indexOf("adb") !== -1 || cmd.indexOf("usb") !== -1 || cmd.indexOf("getprop") !== -1) {
            console.log("[Bypass] Comando bloqueado: " + cmd);
            throw Java.use("java.io.IOException").$new("No such file or directory");
        }
        return this.exec(cmd);
    };
    */

    console.log("[*] Todos os hooks (Java + Native) aplicados com sucesso.");
});