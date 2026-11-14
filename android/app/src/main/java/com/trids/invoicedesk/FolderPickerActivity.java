package com.trids.invoicedesk;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.DocumentsContract;

/** Opens the phone's folder list from a normal activity so the main screen does not swallow it. */
public class FolderPickerActivity extends Activity {

    private static final int REQUEST = 41;
    private boolean opened;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        opened = savedInstanceState != null && savedInstanceState.getBoolean("opened");
        if (!opened) openPicker();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        outState.putBoolean("opened", opened);
        super.onSaveInstanceState(outState);
    }

    private void openPicker() {
        opened = true;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        );
        if (android.os.Build.VERSION.SDK_INT >= 26) {
            intent.putExtra(DocumentsContract.EXTRA_PROMPT, "Open your folder, then tap Use this folder");
        }
        try {
            startActivityForResult(intent, REQUEST);
        } catch (Exception err) {
            setResult(RESULT_CANCELED);
            finish();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST) return;
        if (resultCode == RESULT_OK && data != null && data.getData() != null) {
            Uri tree = data.getData();
            int flags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            if (flags == 0) flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
            try {
                getContentResolver().takePersistableUriPermission(tree, flags);
            } catch (Exception ignored) {
                /* The main screen stores the folder and tries again. */
            }
            Intent back = new Intent();
            back.setData(tree);
            back.addFlags(flags);
            setResult(RESULT_OK, back);
        } else {
            setResult(RESULT_CANCELED);
        }
        finish();
    }
}
