package com.trids.invoicedesk;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/** Starts the folder screen from the tap itself, before Android treats the app as inactive. */
public class TridsWebViewClient extends BridgeWebViewClient {

    private final MainActivity activity;

    public TridsWebViewClient(Bridge bridge, MainActivity activity) {
        super(bridge);
        this.activity = activity;
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        if (url != null && "trids".equals(url.getScheme()) && "pick-folder".equals(url.getHost())) {
            activity.openFolderPicker();
            return true;
        }
        if (url != null && "trids".equals(url.getScheme()) && "allow-files".equals(url.getHost())) {
            activity.openAllFilesAccess();
            return true;
        }
        return super.shouldOverrideUrlLoading(view, request);
    }
}
