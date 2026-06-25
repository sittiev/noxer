function hook_okhttp3() {
    Java.perform(function() {
        var ByteString = Java.use("com.android.okhttp.okio.ByteString");
        var Buffer = Java.use("com.android.okhttp.okio.Buffer");
        var Interceptor = Java.use("okhttp3.Interceptor");
        var MyInterceptor = Java.registerClass({
            name: "okhttp3.MyInterceptor",
            implements: [Interceptor],
            methods: {
                intercept: function(chain) {
                    var request = chain.request();
                    try {
                        console.log("MyInterceptor.intercept onEnter:", request, "
request headers:
", request.headers());
                        var requestBody = request.body();
                        var contentLength = requestBody ? requestBody.contentLength() : 0;
                        if (contentLength > 0) {
                            var BufferObj = Buffer.$new();
                            requestBody.writeTo(BufferObj);
                            try {
                                console.log("
request body String:
", BufferObj.readString(), "
");
                            } catch (error) {
                                try {
                                    console.log("
request body ByteString:
", ByteString.of(BufferObj.readByteArray()).hex(), "
");
                                } catch (error) {
                                    console.log("error 1:", error);
                                }
                            }
                        }
                    } catch (error) {
                        console.log("error 2:", error);
                    }
                    var response = chain.proceed(request);
                    try {
                        console.log("MyInterceptor.intercept onLeave:", response, "
response headers:
", response.headers());
                        var responseBody = response.body();
                        var contentLength = responseBody ? responseBody.contentLength() : 0;
                        if (contentLength > 0) {
                            console.log("
responsecontentLength:", contentLength, "responseBody:", responseBody, "
");

                            var ContentType = response.headers().get("Content-Type");
                            console.log("ContentType:", ContentType);
                            if (ContentType.indexOf("video") == -1) {
                                if (ContentType.indexOf("application") == 0) {
                                    var source = responseBody.source();
                                    if (ContentType.indexOf("application/zip") != 0) {
                                        try {
                                            console.log("
response.body StringClass
", source.readUtf8(), "
");
                                        } catch (error) {
                                            try {
                                                console.log("
response.body ByteString
", source.readByteString().hex(), "
");
                                            } catch (error) {
                                                console.log("error 4:", error);
                                            }
                                        }
                                    }
                                }

                            }

                        }

                    } catch (error) {
                        console.log("error 3:", error);
                    }
                    return response;
                }
            }
        });
        var ArrayList = Java.use("java.util.ArrayList");
        var OkHttpClient = Java.use("okhttp3.OkHttpClient");
        console.log(OkHttpClient);
        OkHttpClient.$init.overload('okhttp3.OkHttpClient$Builder').implementation = function(Builder) {
            console.log("OkHttpClient.$init:", this, Java.cast(Builder.interceptors(), ArrayList));
            this.$init(Builder);
        };

        var MyInterceptorObj = MyInterceptor.$new();
        var Builder = Java.use("okhttp3.OkHttpClient$Builder");
        console.log(Builder);
        Builder.build.implementation = function() {
            this.interceptors().clear();
            //var MyInterceptorObj = MyInterceptor.$new();
            this.interceptors().add(MyInterceptorObj);
            var result = this.build();
            return result;
        };

        Builder.addInterceptor.implementation = function(interceptor) {
            this.interceptors().clear();
            //var MyInterceptorObj = MyInterceptor.$new();
            this.interceptors().add(MyInterceptorObj);
            return this;
            //return this.addInterceptor(interceptor);
        };

        console.log("hook_okhttp3...");
    });
}