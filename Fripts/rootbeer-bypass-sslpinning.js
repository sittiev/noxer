/*
 * Project: Universal Android Bypass & Logger (RootBeer + SSL Pinning + Traffic)
 * Author: Raja Muhammad Kurnia Setyawan
 * Description: 
 * - Bypasses RootBeer (Java & Native checks)
 * - Bypasses SSL Pinning (OkHttp, TrustManager, HttpsURLConnection, WebView)
 * - Logs OkHttp Requests/Responses for debugging
 */

Java.perform(function() {
    console.log("");
    console.log("[*] Starting Universal Bypass Script by iMoon404");
    console.log("[*] Target: RootBeer Native & SSL Pinning...");
    console.log("");

    // ============================================================
    // 1. ROOT DETECTION BYPASS (JAVA & NATIVE)
    // ============================================================

    // Bypass RootBeer (Java Layer)
    try {
        const RootBeer = Java.use("com.scottyab.rootbeer.RootBeer");
        
        RootBeer.isRooted.implementation = function() {
            console.log("[+] RootBeer.isRooted() hooked: returning false");
            return false;
        };

        RootBeer.isRootedWithoutBusyBoxCheck.implementation = function() {
            console.log("[+] RootBeer.isRootedWithoutBusyBoxCheck() hooked: returning false");
            return false;
        };
        
        // Hook all other boolean checks in RootBeer just in case
        const methods = RootBeer.class.getDeclaredMethods();
        for (let i = 0; i < methods.length; i++) {
            if (methods[i].getReturnType().getName() === "boolean" && methods[i].getName() !== "isRooted") {
                 let methodName = methods[i].getName();
                 try {
                     RootBeer[methodName].implementation = function() {
                        console.log("[+] RootBeer." + methodName + "() hooked -> returning false");
                        return false;
                     }
                 } catch(e) {}
            }
        }

    } catch (e) {
        console.log("[-] RootBeer Java hook failed:", e);
    }

    // Bypass RootBeer (Native Layer Wrapper) -> CRITICAL FOR HYBRID DETECTION
    try {
        const RootBeerNative = Java.use("com.scottyab.rootbeer.RootBeerNative");
        
        // Hook native check function
        RootBeerNative.checkForRoot.implementation = function(obj) {
            console.log("[+] RootBeerNative.checkForRoot() hooked: returning 0 (False)");
            return 0; // 0 = False in C++
        };

        // Hook library loading check to prevent native lib usage
        RootBeerNative.wasNativeLibraryLoaded.implementation = function() {
            console.log("[+] RootBeerNative.wasNativeLibraryLoaded() hooked: returning false");
            return false;
        };
        
        // Prevent debug logging
        RootBeerNative.setLogDebugMessages.implementation = function(z) {
             return 0;
        }

    } catch (e) {
        console.log("[-] RootBeerNative hook failed (Class might not be loaded):", e);
    }


    // ============================================================
    // 2. SSL PINNING BYPASS (UNIVERSAL)
    // ============================================================

    // OkHttp CertificatePinner.check (Kill switch for OkHttp pinning)
    try {
        const CP = Java.use("okhttp3.CertificatePinner");
        
        // Overload 1
        CP.check.overload('java.lang.String', 'java.util.List').implementation = function(host, list) {
            console.log("[+] CertificatePinner.check(host,List) bypass:", host);
            return; // Do nothing = Exception not thrown = Success
        };
        
        // Overload 2
        CP.check.overload('java.lang.String', '[Ljava.security.cert.Certificate;').implementation = function(host, arr) {
            console.log("[+] CertificatePinner.check(host,Certificate[]) bypass:", host);
            return; 
        };
    } catch (e) {
        console.log("[-] CertificatePinner.check hook failed:", e);
    }

    // OkHttp Builder: Force Permissive TrustManager & Remove Pinner
    try {
        const Builder = Java.use("okhttp3.OkHttpClient$Builder");
        
        // Disable CertificatePinner setting
        Builder.certificatePinner.implementation = function(pinner) {
            console.log("[+] OkHttpClient.Builder.certificatePinner() patched: ignoring pins");
            return this;
        };

        // Create Custom TrustManager that trusts everything
        const X509TM = Java.use("javax.net.ssl.X509TrustManager");
        const PermissiveTM = Java.registerClass({
            name: 'com.raja.PermissiveTrustManager',
            implements: [X509TM],
            methods: {
                getAcceptedIssuers: [{
                    returnType: '[Ljava.security.cert.X509Certificate;',
                    implementation: function() { return []; }
                }],
                checkClientTrusted: [{
                    returnType: 'void',
                    argumentTypes: ['[Ljava.security.cert.X509Certificate;', 'java.lang.String'],
                    implementation: function() {}
                }],
                checkServerTrusted: [{
                    returnType: 'void',
                    argumentTypes: ['[Ljava.security.cert.X509Certificate;', 'java.lang.String'],
                    implementation: function() {}
                }]
            }
        });

        // Inject Custom TrustManager into Builder
        Builder.sslSocketFactory.overload('javax.net.ssl.SSLSocketFactory', 'javax.net.ssl.X509TrustManager').implementation = function(ssf, tm) {
            console.log("[+] OkHttpClient.Builder.sslSocketFactory(SSF, TM) patched: using permissive TM");
            // Create a new permissive SSL Context
            const SSLContext = Java.use("javax.net.ssl.SSLContext");
            const context = SSLContext.getInstance("TLS");
            context.init(null, [PermissiveTM.$new()], null);
            return this.sslSocketFactory(context.getSocketFactory(), PermissiveTM.$new());
        };
    } catch (e) {
        console.log("[-] OkHttp Builder hooks failed:", e);
    }

    // Platform TrustManagerImpl fallback (Android Default)
    try {
        let TMI;
        try {
            TMI = Java.use("com.android.org.conscrypt.TrustManagerImpl");
        } catch (e) {
            TMI = Java.use("org.conscrypt.TrustManagerImpl");
        }
        
        // Hook checkServerTrusted to do nothing
        TMI.checkServerTrusted.overload('[Ljava.security.cert.X509Certificate;', 'java.lang.String').implementation = function(c, a) {
            console.log("[+] TMI.simple bypass");
            return c;
        };
        TMI.checkServerTrusted.overload('[Ljava.security.cert.X509Certificate;', 'java.lang.String', 'java.net.Socket').implementation = function(c, a, s) {
            console.log("[+] TMI.socket bypass");
            return c;
        };
        TMI.checkServerTrusted.overload('[Ljava.security.cert.X509Certificate;', 'java.lang.String', 'javax.net.ssl.SSLSession').implementation = function(c, a, ss) {
            console.log("[+] TMI.session bypass");
            return c;
        };
    } catch (e) {
        console.log("[-] TrustManagerImpl hook failed:", e);
    }

    // HttpsURLConnection & HostnameVerifier (Older libs)
    try {
        const HUC = Java.use("javax.net.ssl.HttpsURLConnection");
        const HostnameVerifier = Java.use("javax.net.ssl.HostnameVerifier");
        const AlwaysHV = Java.registerClass({
            name: 'com.raja.AlwaysHostnameVerifier',
            implements: [HostnameVerifier],
            methods: {
                verify: [{
                    returnType: 'boolean',
                    argumentTypes: ['java.lang.String', 'javax.net.ssl.SSLSession'],
                    implementation: function(h, s) { return true; }
                }]
            }
        });

        HUC.setDefaultHostnameVerifier.implementation = function(hv) {
            console.log("[+] HttpsURLConnection.setDefaultHostnameVerifier patched");
            return this.setDefaultHostnameVerifier(AlwaysHV.$new());
        };
        HUC.setHostnameVerifier.implementation = function(hv) {
            console.log("[+] HttpsURLConnection.setHostnameVerifier patched");
            return this.setHostnameVerifier(AlwaysHV.$new());
        };
    } catch (e) {
        console.log("[-] HttpsURLConnection hooks failed:", e);
    }

    // WebView SSL errors (Proceed on Error)
    try {
        const WVC = Java.use("android.webkit.WebViewClient");
        WVC.onReceivedSslError.implementation = function(view, handler, error) {
            console.log("[+] WebViewClient.onReceivedSslError: proceed");
            handler.proceed();
        };
    } catch (e) {
        console.log("[-] WebViewClient hook failed:", e);
    }


    // ============================================================
    // 3. TRAFFIC LOGGING (DEBUGGING)
    // ============================================================

    // Request logging: OkHttp Request + Response
    try {
        const Request = Java.use("okhttp3.Request");
        const Call = Java.use("okhttp3.RealCall"); // might be named differently in obfuscated code
        const Client = Java.use("okhttp3.OkHttpClient");

        Client.newCall.implementation = function(req) {
            try {
                console.log("[*] OkHttp.newCall URL:", req.url().toString());
            } catch (e) {
                console.log("[-] newCall log failed:", e);
            }
            return this.newCall(req);
        };

        // Attempt to hook RealCall.execute() if available
        try {
             // Sometimes RealCall is internal or final, so this might fail on some OkHttp versions
            if (Call && Call.execute) {
                Call.execute.implementation = function () {
                    const resp = this.execute();
                    try {
                        console.log("[*] OkHttp.execute code:", resp.code(), " URL:", resp.request().url().toString());
                    } catch (e) {
                        // ignore logging errors
                    }
                    return resp;
                };
            }
        } catch(err) {}

    } catch (e) {
        console.log("[-] OkHttp logging hooks failed (Class/Method mismatch):", e);
    }
});