package com.trids.invoicedesk;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private boolean webViewReady;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(SavePdfPlugin.class);
        registerPlugin(ReadTextPlugin.class);
        super.onCreate(savedInstanceState);
        prepareWebView();
    }

    @Override
    public void onStart() {
        super.onStart();
        prepareWebView();
    }

    /** Keeps the page at the phone's own width and lets a tap open the folder list. */
    private void prepareWebView() {
        Bridge bridge = getBridge();
        if (webViewReady || bridge == null || bridge.getWebView() == null) return;
        webViewReady = true;
        WebView web = bridge.getWebView();
        WebSettings settings = web.getSettings();
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setTextZoom(100);
        settings.setSupportZoom(false);
        web.setInitialScale(0);
        web.addJavascriptInterface(new PhoneFolders(), "TridsPhone");
        bridge.setWebViewClient(new TridsWebViewClient(bridge, this));
    }

    public class PhoneFolders {
        @JavascriptInterface
        public void pickFolder() {
            runOnUiThread(() -> startActivity(new Intent(MainActivity.this, FolderPickerActivity.class)));
        }

        @JavascriptInterface
        public String folderPath() {
            return SavePdfPlugin.chosenLabel(getApplicationContext());
        }

        @JavascriptInterface
        public String savePdf(String filename, String base64) {
            try {
                byte[] bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
                return SavePdfPlugin.writeChosen(getApplicationContext(), filename, bytes);
            } catch (Exception err) {
                String message = err.getMessage() == null ? "Could not save the PDF." : err.getMessage();
                if (message.contains("Allow access")) {
                    runOnUiThread(MainActivity.this::openAllFilesAccess);
                }
                return "ERROR:" + message;
            }
        }
    }

    /** Called from the Choose folder tap, on the same turn as the tap. */
    public void openFolderPicker() {
        startActivity(new Intent(this, FolderPickerActivity.class));
    }

    /** Opens the Android switch that lets Invoice Desk write Internal storage/TRIDS APPS/Invoice Desk. */
    public void openAllFilesAccess() {
        Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
        intent.setData(Uri.parse("package:" + getPackageName()));
        try {
            startActivity(intent);
        } catch (Exception err) {
            startActivity(new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION));
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        Bridge bridge = getBridge();
        if (bridge != null) {
            bridge.eval("window.dispatchEvent(new Event('trids-resume'))", null);
        }
    }
}
