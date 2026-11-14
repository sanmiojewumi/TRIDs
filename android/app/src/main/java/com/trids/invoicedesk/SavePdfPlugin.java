package com.trids.invoicedesk;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

/** Saves a PDF into Downloads, or into a folder the user picks. */
@CapacitorPlugin(
    name = "SavePdf",
    permissions = { @Permission(strings = { android.Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "storage") }
)
public class SavePdfPlugin extends Plugin {

    private static final String PREFS = "trids-apps";
    private static final String TREE = "treeUri";

    @PluginMethod
    public void folder(PluginCall call) {
        call.resolve(folderStatus());
    }

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        );
        if (Build.VERSION.SDK_INT >= 26) intent.putExtra(DocumentsContract.EXTRA_PROMPT, "Select the Trids apps folder");
        startActivityForResult(call, intent, "onFolderPicked");
    }

    @ActivityCallback
    private void onFolderPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject cancelled = new JSObject();
            cancelled.put("connected", false);
            call.resolve(cancelled);
            return;
        }
        Uri tree = result.getData().getData();
        final int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
        getContext().getContentResolver().takePersistableUriPermission(tree, flags);
        prefs().edit().putString(TREE, tree.toString()).apply();
        call.resolve(folderStatus());
    }

    @PluginMethod
    public void saveToFolder(PluginCall call) {
        byte[] bytes = decode(call);
        if (bytes == null) return;
        String stored = prefs().getString(TREE, null);
        if (stored == null) {
            call.reject("Choose the Trids apps folder first.");
            return;
        }
        try {
            String name = writeIntoTree(Uri.parse(stored), filename(call), call.getString("mime", "application/pdf"), bytes);
            JSObject ret = folderStatus();
            ret.put("saved", true);
            ret.put("file", name);
            call.resolve(ret);
        } catch (SecurityException e) {
            prefs().edit().remove(TREE).apply();
            call.reject("The Trids apps folder needs to be chosen again.");
        } catch (Exception e) {
            call.reject("Could not save into the Trids apps folder");
        }
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE);
    }

    private JSObject folderStatus() {
        JSObject ret = new JSObject();
        String stored = prefs().getString(TREE, null);
        if (stored == null) {
            ret.put("connected", false);
            return ret;
        }
        String name = "Trids apps";
        try {
            Uri tree = Uri.parse(stored);
            Uri doc = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
            try (Cursor cursor = getContext().getContentResolver().query(
                doc,
                new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME },
                null,
                null,
                null
            )) {
                if (cursor != null && cursor.moveToFirst() && cursor.getString(0) != null) name = cursor.getString(0);
            }
            ret.put("connected", true);
            ret.put("name", name);
        } catch (Exception e) {
            prefs().edit().remove(TREE).apply();
            ret.put("connected", false);
        }
        return ret;
    }

    private String writeIntoTree(Uri tree, String filename, String mime, byte[] bytes) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        Uri existing = findChild(tree, filename);
        Uri target = existing != null
            ? existing
            : DocumentsContract.createDocument(
                resolver,
                DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree)),
                mime,
                filename
            );
        if (target == null) throw new IOException("Could not create the file");
        try (OutputStream out = resolver.openOutputStream(target, "wt")) {
            if (out == null) throw new IOException("Could not open the file");
            out.write(bytes);
        }
        return filename;
    }

    private Uri findChild(Uri tree, String name) {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        try (Cursor cursor = getContext().getContentResolver().query(
            children,
            new String[] { DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME },
            null,
            null,
            null
        )) {
            if (cursor == null) return null;
            while (cursor.moveToNext()) {
                if (name.equals(cursor.getString(1))) {
                    return DocumentsContract.buildDocumentUriUsingTree(tree, cursor.getString(0));
                }
            }
        } catch (Exception e) {
            return null;
        }
        return null;
    }

    @PluginMethod
    public void toDownloads(PluginCall call) {
        if (Build.VERSION.SDK_INT < 29 && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storagePermsCallback");
            return;
        }
        writeDownloads(call);
    }

    @PermissionCallback
    private void storagePermsCallback(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) writeDownloads(call);
        else call.reject("Allow storage access to save the PDF into Downloads.");
    }

    @PluginMethod
    public void save(PluginCall call) {
        byte[] bytes = decode(call);
        if (bytes == null) return;
        try {
            try (FileOutputStream out = new FileOutputStream(pendingFile())) {
                out.write(bytes);
            }
        } catch (IOException e) {
            call.reject("Could not prepare the PDF");
            return;
        }
        String filename = filename(call);
        String mime = call.getString("mime", "application/pdf");
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(call, intent, "onSaveResult");
    }

    @ActivityCallback
    private void onSaveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            pendingFile().delete();
            JSObject cancelled = new JSObject();
            cancelled.put("saved", false);
            call.resolve(cancelled);
            return;
        }
        byte[] bytes;
        try {
            bytes = readPending();
        } catch (IOException e) {
            call.reject("Could not read the PDF");
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
        } finally {
            pendingFile().delete();
        }
    }

    private void writeDownloads(PluginCall call) {
        byte[] bytes = decode(call);
        if (bytes == null) return;
        String filename = filename(call);
        String mime = call.getString("mime", "application/pdf");
        try {
            String savedAs = Build.VERSION.SDK_INT >= 29
                ? insertDownloads(filename, mime, bytes)
                : writePublicDownloads(filename, bytes);
            JSObject ret = new JSObject();
            ret.put("saved", true);
            ret.put("name", savedAs);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not save the PDF to Downloads");
        }
    }

    private String insertDownloads(String filename, String mime, byte[] bytes) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        String name = uniqueDisplayName(resolver, filename);
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IOException("Could not create the download");
        try (OutputStream out = resolver.openOutputStream(uri)) {
            if (out == null) throw new IOException("Could not open the download");
            out.write(bytes);
        } catch (IOException e) {
            resolver.delete(uri, null, null);
            throw e;
        }
        values.clear();
        values.put(MediaStore.MediaColumns.IS_PENDING, 0);
        resolver.update(uri, values, null, null);
        return name;
    }

    private String uniqueDisplayName(ContentResolver resolver, String filename) {
        String name = filename;
        String base = filename.replaceFirst("\\.[^.]+$", "");
        String ext = filename.substring(base.length());
        for (int n = 2; n < 100; n++) {
            try (android.database.Cursor cursor = resolver.query(
                MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                new String[] { MediaStore.MediaColumns._ID },
                MediaStore.MediaColumns.DISPLAY_NAME + "=?",
                new String[] { name },
                null
            )) {
                if (cursor == null || !cursor.moveToFirst()) return name;
            } catch (Exception e) {
                return name;
            }
            name = base + " (" + n + ")" + ext;
        }
        return name;
    }

    private String writePublicDownloads(String filename, byte[] bytes) throws IOException {
        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("Could not open Downloads");
        String base = filename.replaceFirst("\\.[^.]+$", "");
        String ext = filename.substring(base.length());
        File file = new File(dir, filename);
        for (int n = 2; file.exists() && n < 100; n++) file = new File(dir, base + " (" + n + ")" + ext);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        MediaScannerConnection.scanFile(getContext(), new String[] { file.getAbsolutePath() }, new String[] { "application/pdf" }, null);
        return file.getName();
    }

    private byte[] decode(PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.isEmpty()) {
            call.reject("Missing file data");
            return null;
        }
        try {
            return Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("Could not read the file");
            return null;
        }
    }

    private String filename(PluginCall call) {
        return call.getString("filename", "invoice.pdf").replaceAll("[\\\\/]", "-");
    }

    private File pendingFile() {
        return new File(getContext().getCacheDir(), "pending-save.bin");
    }

    private byte[] readPending() throws IOException {
        File file = pendingFile();
        byte[] bytes = new byte[(int) file.length()];
        try (FileInputStream in = new FileInputStream(file)) {
            int off = 0;
            while (off < bytes.length) {
                int n = in.read(bytes, off, bytes.length - off);
                if (n < 0) break;
                off += n;
            }
        }
        return bytes;
    }
}
