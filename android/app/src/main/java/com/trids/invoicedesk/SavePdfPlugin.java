package com.trids.invoicedesk;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;

/** Opens Android's save screen so the user can choose the folder and file name. */
@CapacitorPlugin(name = "SavePdf")
public class SavePdfPlugin extends Plugin {
    private byte[] pendingBytes;

    @PluginMethod
    public void save(PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.isEmpty()) {
            call.reject("Missing file data");
            return;
        }
        String filename = call.getString("filename", "invoice.pdf").replaceAll("[\\\\/]", "-");
        String mime = call.getString("mime", "application/pdf");
        try {
            pendingBytes = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("Could not read the file");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(call, intent, "onSaveResult");
    }

    @ActivityCallback
    private void onSaveResult(PluginCall call, ActivityResult result) {
        byte[] bytes = pendingBytes;
        pendingBytes = null;
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject cancelled = new JSObject();
            cancelled.put("saved", false);
            call.resolve(cancelled);
            return;
        }
        Uri uri = result.getData().getData();
        try (OutputStream out = getContext().getContentResolver().openOutputStream(uri)) {
            if (out == null || bytes == null) {
                call.reject("Could not open the chosen folder");
                return;
            }
            out.write(bytes);
            JSObject saved = new JSObject();
            saved.put("saved", true);
            call.resolve(saved);
        } catch (Exception e) {
            call.reject("Could not save the file");
        }
    }
}
