package com.trids.invoicedesk;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(SavePdfPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
