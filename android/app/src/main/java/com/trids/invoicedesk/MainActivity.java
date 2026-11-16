package com.trids.invoicedesk;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(SavePdfPlugin.class);
        registerPlugin(ReadTextPlugin.class);
        super.onCreate(savedInstanceState);
        Bridge bridge = getBridge();
        if (bridge != null && bridge.getWebView() != null) {
            bridge.setWebViewClient(new TridsWebViewClient(bridge, this));
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
