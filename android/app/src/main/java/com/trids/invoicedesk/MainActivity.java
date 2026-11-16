package com.trids.invoicedesk;

import android.content.Intent;
import android.os.Bundle;
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

    @Override
    public void onResume() {
        super.onResume();
        Bridge bridge = getBridge();
        if (bridge != null) {
            bridge.eval("window.dispatchEvent(new Event('trids-resume'))", null);
        }
    }
}
