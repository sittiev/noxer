
Java.perform(function() {
    var rootBeerNative = Java.use("com.scottyab.rootbeer.RootBeerNative");
    rootBeerNative.checkForRoot.implementation = function(objArr) {
        return 0
    }
})

// adb shell pm list package -3 ==> find third party app(app.name) for hook
// frida -U -l .\RootBeerNative-universal-Bypass.js -f app.name