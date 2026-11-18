package __PKG__;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebChromeClient.FileChooserParams;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/** 하루 플래너 전용: 파일 안의 웹앱을 보여주고, 백업 저장/불러오기를 연결합니다. */
public class MainActivity extends Activity {
    private static final String HOST = "app.local";
    static final int PICK = 1001;
    private WebView web;
    ValueCallback<Uri[]> pending;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.parseColor("__COLOR__"));
        getWindow().setNavigationBarColor(Color.parseColor("__COLOR__"));
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("__COLOR__"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setSupportMultipleWindows(false);
        s.setAllowFileAccess(false);
        web.addJavascriptInterface(new Bridge(this), "HaruAndroid");
        web.setWebViewClient(new Client(this));
        web.setWebChromeClient(new Chooser(this));
        setContentView(web);
        if (state != null) web.restoreState(state);
        else web.loadUrl("https://" + HOST + "/index.html");
    }

    void toast(final String msg) {
        runOnUiThread(new ToastTask(this, msg));
    }

    static class ToastTask implements Runnable {
        private final Activity a; private final String m;
        ToastTask(Activity a, String m) { this.a = a; this.m = m; }
        public void run() { Toast.makeText(a, m, Toast.LENGTH_LONG).show(); }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == PICK && pending != null) {
            Uri[] r = (res == RESULT_OK && data != null && data.getData() != null) ? new Uri[]{data.getData()} : null;
            pending.onReceiveValue(r);
            pending = null;
        }
    }

    static class Chooser extends WebChromeClient {
        private final MainActivity a;
        Chooser(MainActivity a) { this.a = a; }

        @Override
        public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
            if (a.pending != null) a.pending.onReceiveValue(null);
            a.pending = cb;
            Intent i = new Intent(Intent.ACTION_GET_CONTENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            try {
                a.startActivityForResult(Intent.createChooser(i, "백업 파일 선택"), PICK);
            } catch (Exception e) {
                a.pending = null;
                cb.onReceiveValue(null);
                return false;
            }
            return true;
        }
    }

    /** 자바스크립트에서 HaruAndroid.saveFile(파일명, 내용) 으로 호출: 다운로드 폴더에 저장 */
    static class Bridge {
        private final MainActivity a;
        Bridge(MainActivity a) { this.a = a; }

        @JavascriptInterface
        public String saveFile(String name, String text) {
            try {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                v.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                v.put(MediaStore.Downloads.RELATIVE_PATH, "Download");
                Uri u = a.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (u == null) return "error";
                OutputStream o = a.getContentResolver().openOutputStream(u);
                o.write(text.getBytes(StandardCharsets.UTF_8));
                o.close();
                final String msg = "다운로드 폴더에 저장했어요: " + name;
                a.toast(msg);
                return "ok";
            } catch (Exception e) {
                return "error";
            }
        }
    }

    static class Client extends WebViewClient {
        private final MainActivity a;
        Client(MainActivity a) { this.a = a; }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (!HOST.equals(u.getHost())) return null;
            String path = u.getPath();
            if (path == null || path.equals("/")) path = "/index.html";
            try {
                InputStream in = a.getAssets().open("www" + path);
                WebResourceResponse r = new WebResourceResponse(mime(path), "utf-8", in);
                Map<String, String> h = new HashMap<>();
                h.put("Cache-Control", "no-cache");
                r.setResponseHeaders(h);
                return r;
            } catch (Exception e) {
                return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<String, String>(), null);
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (HOST.equals(u.getHost())) return false;
            try { a.startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
            return true;
        }
    }

    private static String mime(String p) {
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    @Override
    protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
}
