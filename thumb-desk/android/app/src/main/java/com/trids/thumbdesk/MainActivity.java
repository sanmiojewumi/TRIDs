package com.trids.thumbdesk;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends AppCompatActivity {
    private static final String PAGE_HOST = "https://appassets.androidplatform.net/pages/";
    private static final int MAX_PAGES = 20;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private final ActivityResultLauncher<Intent> pickDoc = registerForActivityResult(
        new ActivityResultContracts.StartActivityForResult(),
        result -> {
            if (result.getResultCode() != RESULT_OK || result.getData() == null || result.getData().getData() == null) {
                return;
            }
            acceptDocument(result.getData().getData());
        }
    );

    private final ActivityResultLauncher<Intent> pickFiles = registerForActivityResult(
        new ActivityResultContracts.StartActivityForResult(),
        result -> {
            if (fileCallback == null) return;
            Uri[] uris = null;
            if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                uris = WebChromeClient.FileChooserParams.parseResult(result.getResultCode(), result.getData());
            }
            fileCallback.onReceiveValue(uris);
            fileCallback = null;
        }
    );

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .addPathHandler("/pages/", path -> pageResponse(path))
            .build();

        web = new WebView(this);
        web.setFitsSystemWindows(true);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUseWideViewPort(true);
        settings.setTextZoom(100);
        web.setBackgroundColor(Color.parseColor("#f4f6f8"));
        web.addJavascriptInterface(new Bridge(), "ThumbPhone");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assets.shouldInterceptRequest(request.getUrl());
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    pickFiles.launch(params.createIntent());
                } catch (Exception err) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
                return true;
            }
        });
        setContentView(web);
        web.loadUrl("https://appassets.androidplatform.net/assets/www/index.html");
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.evaluateJavascript("window.thumbDesk&&window.thumbDesk.resumed()", null);
    }

    @Override
    protected void onDestroy() {
        io.shutdownNow();
        super.onDestroy();
    }

    private WebResourceResponse pageResponse(String path) {
        if (path == null || path.contains("..") || path.contains("/")) return null;
        File file = new File(new File(getCacheDir(), "pages"), path);
        if (!file.isFile()) return null;
        try {
            String mime = path.endsWith(".png") ? "image/png" : "image/jpeg";
            return new WebResourceResponse(mime, null, new FileInputStream(file));
        } catch (IOException e) {
            return null;
        }
    }

    private void acceptDocument(Uri uri) {
        io.execute(() -> {
            try {
                String name = displayName(uri);
                String mime = getContentResolver().getType(uri);
                boolean pdf = "application/pdf".equals(mime) || name.toLowerCase().endsWith(".pdf");
                File dir = new File(getCacheDir(), "pages");
                if (dir.exists()) {
                    File[] old = dir.listFiles();
                    if (old != null) for (File child : old) child.delete();
                } else if (!dir.mkdirs()) {
                    throw new IOException("Could not prepare the page.");
                }
                JSONArray pages = pdf ? renderPdf(uri, dir) : renderImage(uri, dir);
                JSONObject payload = new JSONObject();
                payload.put("name", name);
                payload.put("kind", pdf ? "pdf" : "image");
                payload.put("pages", pages);
                deliver("window.thumbDesk&&window.thumbDesk.loadNative(" + payload + ")");
            } catch (Exception err) {
                String message = err.getMessage() == null ? "Could not open that file." : err.getMessage();
                deliver("window.thumbDesk&&window.thumbDesk.fail(" + JSONObject.quote(message) + ")");
            }
        });
    }

    private JSONArray renderImage(Uri uri, File dir) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (java.io.InputStream in = getContentResolver().openInputStream(uri)) {
            BitmapFactory.decodeStream(in, null, bounds);
        }
        if (bounds.outWidth < 1 || bounds.outHeight < 1) throw new IOException("Could not read that picture.");
        int sample = 1;
        while (bounds.outWidth / sample > 1600 || bounds.outHeight / sample > 1600) sample *= 2;
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = sample;
        Bitmap bitmap;
        try (java.io.InputStream in = getContentResolver().openInputStream(uri)) {
            bitmap = BitmapFactory.decodeStream(in, null, opts);
        }
        if (bitmap == null) throw new IOException("Could not read that picture.");
        return onePage(bitmap, dir);
    }

    private JSONArray renderPdf(Uri uri, File dir) throws Exception {
        try (ParcelFileDescriptor fd = getContentResolver().openFileDescriptor(uri, "r")) {
            if (fd == null) throw new IOException("Could not open that PDF.");
            try (PdfRenderer renderer = new PdfRenderer(fd)) {
                if (renderer.getPageCount() < 1) throw new IOException("That PDF has no pages.");
                if (renderer.getPageCount() > MAX_PAGES) throw new IOException("Use a PDF of up to 20 pages.");
                JSONArray pages = new JSONArray();
                for (int i = 0; i < renderer.getPageCount(); i++) {
                    try (PdfRenderer.Page page = renderer.openPage(i)) {
                        int width = 1400;
                        int height = Math.max(1, Math.round(width * (page.getHeight() / (float) page.getWidth())));
                        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
                        bitmap.eraseColor(Color.WHITE);
                        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                        pages.put(writePage(bitmap, dir, i));
                    }
                }
                return pages;
            }
        }
    }

    private JSONArray onePage(Bitmap bitmap, File dir) throws Exception {
        JSONArray pages = new JSONArray();
        pages.put(writePage(bitmap, dir, 0));
        return pages;
    }

    private JSONObject writePage(Bitmap bitmap, File dir, int index) throws Exception {
        File file = new File(dir, index + ".jpg");
        try (FileOutputStream out = new FileOutputStream(file)) {
            if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 92, out)) throw new IOException("Could not draw that page.");
        }
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        bitmap.recycle();
        JSONObject page = new JSONObject();
        page.put("src", PAGE_HOST + index + ".jpg");
        page.put("width", width);
        page.put("height", height);
        return page;
    }

    private String displayName(Uri uri) {
        try (Cursor cursor = getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && cursor.getString(0) != null) return cursor.getString(0);
        } catch (Exception ignored) {
            /* Fall through to a plain name. */
        }
        return "document";
    }

    private void deliver(String script) {
        runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript(script, null);
        });
    }

    private void openAllFilesAccess() {
        Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
        intent.setData(Uri.parse("package:" + getPackageName()));
        try {
            startActivity(intent);
        } catch (Exception err) {
            startActivity(new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION));
        }
    }

    private class Bridge {
        @android.webkit.JavascriptInterface
        public void pickDocument() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "image/*", "application/pdf" });
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                pickDoc.launch(intent);
            });
        }

        @android.webkit.JavascriptInterface
        public void pickFolder() {
            runOnUiThread(() -> startActivity(new Intent(MainActivity.this, FolderPickerActivity.class)));
        }

        @android.webkit.JavascriptInterface
        public String folderPath() {
            return SaveStore.chosenLabel(MainActivity.this);
        }

        @android.webkit.JavascriptInterface
        public String saveFile(String filename, String base64, String mime) {
            try {
                if (Build.VERSION.SDK_INT >= 30 && !Environment.isExternalStorageManager()) {
                    runOnUiThread(MainActivity.this::openAllFilesAccess);
                    return "NEED_ACCESS";
                }
                byte[] bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
                return SaveStore.write(MainActivity.this, filename, bytes, mime);
            } catch (Exception err) {
                String message = err.getMessage() == null ? "Could not save the file." : err.getMessage();
                return "ERROR:" + message;
            }
        }
    }
}
