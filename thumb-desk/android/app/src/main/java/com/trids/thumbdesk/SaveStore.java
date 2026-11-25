package com.trids.thumbdesk;

import android.content.Context;
import android.media.MediaScannerConnection;
import android.os.Environment;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

/** Remembers the folder and writes the stamped file into it. */
public final class SaveStore {
    private static final String PREFS = "thumb-desk";
    private static final String SAVE_DIR = "saveDir";
    private static final String DEFAULT_RELATIVE = "TRIDS APPS/Thumb Desk";

    private SaveStore() {}

    public static void rememberDirectory(Context context, File dir) {
        File stored = dir;
        try {
            stored = dir.getCanonicalFile();
        } catch (IOException ignored) {
            /* Keep the path the folder list was showing. */
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(SAVE_DIR, stored.getAbsolutePath())
            .commit();
    }

    public static File chosenDirectory(Context context) {
        String stored = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(SAVE_DIR, null);
        File dir = stored == null || stored.isEmpty()
            ? new File(Environment.getExternalStorageDirectory(), DEFAULT_RELATIVE)
            : new File(stored);
        try {
            return dir.getCanonicalFile();
        } catch (IOException e) {
            return dir;
        }
    }

    public static String chosenLabel(Context context) {
        return displayPath(chosenDirectory(context));
    }

    public static String write(Context context, String filename, byte[] bytes, String mime) throws IOException {
        if (bytes == null || bytes.length == 0) throw new IOException("The file was empty.");
        File dir = chosenDirectory(context);
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("Could not create " + displayPath(dir));
        if (!dir.isDirectory()) throw new IOException(displayPath(dir) + " is not a folder.");
        String safe = (filename == null || filename.isEmpty() ? "stamped.jpg" : filename).replaceAll("[\\\\/]", "-");
        String base = safe.replaceFirst("\\.[^.]+$", "");
        String ext = safe.substring(base.length());
        File file = new File(dir, safe);
        for (int n = 2; file.exists() && n < 100; n++) file = new File(dir, base + " (" + n + ")" + ext);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
            out.flush();
            out.getFD().sync();
        }
        if (!file.isFile() || file.length() != bytes.length) {
            throw new IOException("The file was not saved in " + displayPath(dir));
        }
        String kind = mime == null || mime.isEmpty() ? "application/octet-stream" : mime;
        MediaScannerConnection.scanFile(context, new String[] { file.getAbsolutePath() }, new String[] { kind }, null);
        return displayPath(dir) + "/" + file.getName();
    }

    static String displayPath(File dir) {
        try {
            String root = Environment.getExternalStorageDirectory().getCanonicalPath();
            String chosen = dir.getCanonicalPath();
            if (chosen.equals(root)) return "Internal storage";
            if (chosen.startsWith(root + File.separator)) return "Internal storage/" + chosen.substring(root.length() + 1);
        } catch (IOException ignored) {
            /* Use the raw path below. */
        }
        return dir.getAbsolutePath();
    }
}
