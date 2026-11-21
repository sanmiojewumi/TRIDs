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
import android.provider.Settings;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
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
    private static final String PICK = "pick";
    private static final String PICK_ID = "pickId";

    @PluginMethod
    public void folder(PluginCall call) {
        call.resolve(folderStatus());
    }

    /** Remembers a folder chosen on the phone so invoice downloads can write into it. */
    public static void rememberTree(android.content.Context context, Uri tree) {
        try {
            context.getContentResolver().takePersistableUriPermission(
                tree,
                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            );
        } catch (Exception ignored) {
            /* The folder can still be used until the app is closed. */
        }
        context.getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)
            .edit()
            .putString(TREE, tree.toString())
            .putString(PICK, "ok")
            .putString(PICK_ID, java.util.UUID.randomUUID().toString())
            .apply();
    }

    public static void noteCancelled(android.content.Context context) {
        context.getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)
            .edit()
            .putString(PICK, "cancel")
            .putString(PICK_ID, java.util.UUID.randomUUID().toString())
            .apply();
    }

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("The app is not ready to open folders. Close it, open it again, then try Choose folder.");
            return;
        }
        activity.runOnUiThread(() -> activity.startActivity(new Intent(activity, FolderPickerActivity.class)));
        call.resolve(folderStatus());
    }

    /** Plugin calls run off the main thread. Android will not show a folder list started from there. */
    private void launchOnScreen(PluginCall call, Intent intent, String callback) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("The app is not ready to open folders. Close it, open it again, then try Choose folder.");
            return;
        }
        call.setKeepAlive(true);
        activity.runOnUiThread(() -> {
            try {
                startActivityForResult(call, intent, callback);
            } catch (Exception err) {
                call.setKeepAlive(false);
                call.reject(err.getMessage() == null ? "Could not open the folder list." : err.getMessage());
            }
        });
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
        int flags = result.getData().getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        if (flags == 0) flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
        try {
            getContext().getContentResolver().takePersistableUriPermission(tree, flags);
        } catch (Exception ignored) {
            /* The folder can still be used for this save. */
        }
        prefs().edit().putString(TREE, tree.toString()).apply();
        JSObject status = new JSObject();
        status.put("connected", true);
        status.put("name", folderName(tree));
        call.resolve(status);
    }

    @PluginMethod
    public void saveToFolder(PluginCall call) {
        byte[] bytes = decode(call);
        if (bytes == null) return;
        String stored = prefs().getString(TREE, null);
        if (stored == null) {
            call.reject("Choose a folder first.");
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
            call.reject("That folder needs to be chosen again.");
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "Could not save into the chosen folder" : e.getMessage());
        }
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE);
    }

    private JSObject folderStatus() {
        JSObject ret = new JSObject();
        String stored = prefs().getString(TREE, null);
        ret.put("pick", prefs().getString(PICK, ""));
        ret.put("pickId", prefs().getString(PICK_ID, ""));
        if (stored == null) {
            ret.put("connected", false);
            return ret;
        }
        Uri tree = Uri.parse(stored);
        String name = folderName(tree);
        try {
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
        } catch (Exception ignored) {
            /* Keep the folder even when its display name cannot be read. */
        }
        ret.put("connected", true);
        ret.put("name", name);
        ret.put("pick", prefs().getString(PICK, ""));
        ret.put("pickId", prefs().getString(PICK_ID, ""));
        return ret;
    }

    private String folderName(Uri tree) {
        try {
            String id = DocumentsContract.getTreeDocumentId(tree);
            if (id != null) {
                int colon = id.indexOf(':');
                String path = colon >= 0 ? id.substring(colon + 1) : id;
                if (path.isEmpty()) return "Internal storage";
                int slash = path.lastIndexOf('/');
                String last = slash >= 0 ? path.substring(slash + 1) : path;
                if (!last.isEmpty()) return last;
            }
        } catch (Exception ignored) {
            /* Fall through to a plain name. */
        }
        return "chosen folder";
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

    private static final String SAVE_DIR = "saveDir";
    private static final String DEFAULT_RELATIVE = "TRIDS APPS/Invoice Desk";

    private File externalRoot() {
        return Environment.getExternalStorageDirectory();
    }

    private File saveDirectory() {
        String stored = prefs().getString(SAVE_DIR, null);
        File fallback = new File(externalRoot(), DEFAULT_RELATIVE);
        if (stored == null || stored.isEmpty()) return fallback;
        File dir = new File(stored);
        try {
            String root = externalRoot().getCanonicalPath();
            String chosen = dir.getCanonicalPath();
            if (!chosen.equals(root) && !chosen.startsWith(root + File.separator)) return fallback;
        } catch (IOException e) {
            return fallback;
        }
        return dir;
    }

    private String pretty(File dir) {
        try {
            String root = externalRoot().getCanonicalPath();
            String chosen = dir.getCanonicalPath();
            if (chosen.equals(root)) return "Internal storage";
            if (chosen.startsWith(root + File.separator)) return "Internal storage/" + chosen.substring(root.length() + 1);
        } catch (IOException ignored) {
            /* Use the raw path below. */
        }
        return dir.getAbsolutePath();
    }

    private boolean insideRoot(File dir) {
        try {
            String root = externalRoot().getCanonicalPath();
            String chosen = dir.getCanonicalPath();
            return chosen.equals(root) || chosen.startsWith(root + File.separator);
        } catch (IOException e) {
            return false;
        }
    }

    private boolean ensureStorage(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 30 && !Environment.isExternalStorageManager()) {
            askForAllFiles(call);
            return false;
        }
        if (Build.VERSION.SDK_INT < 29 && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "invoiceDeskPerms");
            return false;
        }
        return true;
    }

    @PluginMethod
    public void saveFolder(PluginCall call) {
        File dir = saveDirectory();
        JSObject ret = new JSObject();
        ret.put("connected", true);
        ret.put("name", pretty(dir));
        ret.put("path", dir.getAbsolutePath());
        call.resolve(ret);
    }

    @PluginMethod
    public void setSaveFolder(PluginCall call) {
        if (!ensureStorage(call)) return;
        String path = call.getString("path", "");
        File dir = path == null || path.isEmpty() ? new File(externalRoot(), DEFAULT_RELATIVE) : new File(path);
        if (!insideRoot(dir)) {
            call.reject("Choose a folder inside Internal storage.");
            return;
        }
        if (!dir.exists() && !dir.mkdirs()) {
            call.reject("Could not use that folder.");
            return;
        }
        prefs().edit().putString(SAVE_DIR, dir.getAbsolutePath()).apply();
        JSObject ret = new JSObject();
        ret.put("connected", true);
        ret.put("name", pretty(dir));
        ret.put("path", dir.getAbsolutePath());
        call.resolve(ret);
    }

    @PluginMethod
    public void listFolders(PluginCall call) {
        if (!ensureStorage(call)) return;
        String path = call.getString("path", "");
        File dir = path == null || path.isEmpty() ? externalRoot() : new File(path);
        if (!insideRoot(dir) || !dir.isDirectory()) {
            call.reject("That folder could not be opened.");
            return;
        }
        File[] kids = dir.listFiles();
        JSArray folders = new JSArray();
        if (kids != null) {
            java.util.Arrays.sort(kids, (a, b) -> a.getName().compareToIgnoreCase(b.getName()));
            for (File kid : kids) {
                if (!kid.isDirectory() || kid.getName().startsWith(".")) continue;
                JSObject row = new JSObject();
                row.put("name", kid.getName());
                row.put("path", kid.getAbsolutePath());
                folders.put(row);
            }
        }
        JSObject ret = new JSObject();
        ret.put("path", dir.getAbsolutePath());
        ret.put("label", pretty(dir));
        File parent = dir.getParentFile();
        boolean atRoot = dir.getAbsolutePath().equals(externalRoot().getAbsolutePath());
        ret.put("parent", !atRoot && parent != null && insideRoot(parent) ? parent.getAbsolutePath() : "");
        ret.put("folders", folders);
        call.resolve(ret);
    }

    @PluginMethod
    public void toInvoiceDesk(PluginCall call) {
        if (!ensureStorage(call)) return;
        writeInvoiceDesk(call);
    }

    @PermissionCallback
    private void invoiceDeskPerms(PluginCall call) {
        if (getPermissionState("storage") != PermissionState.GRANTED) {
            call.reject("Allow storage access so invoices can be saved on the phone.");
            return;
        }
        String method = call.getMethodName();
        if ("listFolders".equals(method)) listFolders(call);
        else if ("setSaveFolder".equals(method)) setSaveFolder(call);
        else writeInvoiceDesk(call);
    }

    /** Android only allows this folder after the app can manage files on the phone. */
    private void askForAllFiles(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Close Invoice Desk, open it again, and tap Download.");
            return;
        }
        activity.runOnUiThread(() -> {
            if (activity instanceof MainActivity) ((MainActivity) activity).openAllFilesAccess();
        });
        JSObject ret = new JSObject();
        ret.put("saved", false);
        ret.put("needsAccess", true);
        call.resolve(ret);
    }

    private void writeInvoiceDesk(PluginCall call) {
        byte[] bytes = decode(call);
        if (bytes == null) return;
        try {
            String where = writeInvoiceFile(filename(call), bytes);
            JSObject ret = new JSObject();
            ret.put("saved", true);
            ret.put("where", where);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not save the PDF in " + pretty(saveDirectory()));
        }
    }

    private String writeInvoiceFile(String filename, byte[] bytes) throws IOException {
        File dir = saveDirectory();
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("Could not create the folder");
        String base = filename.replaceFirst("\\.[^.]+$", "");
        String ext = filename.substring(base.length());
        File file = new File(dir, filename);
        for (int n = 2; file.exists() && n < 100; n++) file = new File(dir, base + " (" + n + ")" + ext);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        MediaScannerConnection.scanFile(getContext(), new String[] { file.getAbsolutePath() }, new String[] { "application/pdf" }, null);
        return pretty(dir) + "/" + file.getName();
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
        launchOnScreen(call, intent, "onSaveResult");
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
