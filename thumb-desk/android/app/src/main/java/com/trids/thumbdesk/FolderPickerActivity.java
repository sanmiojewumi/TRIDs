package com.trids.thumbdesk;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import java.io.File;
import java.util.Arrays;

/** Lists folders on Internal storage so the stamped file can be saved there. */
public class FolderPickerActivity extends AppCompatActivity {
    private static final int STORAGE_REQUEST = 41;
    private File current;
    private LinearLayout root;
    private boolean askedAccess;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        current = Environment.getExternalStorageDirectory();
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#f4f6f8"));
        root.setFitsSystemWindows(true);
        setContentView(root);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (current != null && current.getParentFile() != null && !isRoot(current)) {
                    current = current.getParentFile();
                    show();
                    return;
                }
                finish();
            }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!hasStorageAccess()) {
            showPermission();
            if (!askedAccess) {
                askedAccess = true;
                openAccessSettings();
            }
            return;
        }
        if (current == null || !current.isDirectory()) current = Environment.getExternalStorageDirectory();
        show();
    }

    private boolean hasStorageAccess() {
        if (Build.VERSION.SDK_INT >= 30) return Environment.isExternalStorageManager();
        return ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    private void openAccessSettings() {
        if (Build.VERSION.SDK_INT >= 30) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
            intent.setData(Uri.parse("package:" + getPackageName()));
            try {
                startActivity(intent);
            } catch (Exception err) {
                startActivity(new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION));
            }
            return;
        }
        ActivityCompat.requestPermissions(this, new String[] { Manifest.permission.WRITE_EXTERNAL_STORAGE }, STORAGE_REQUEST);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == STORAGE_REQUEST && hasStorageAccess()) show();
    }

    private void showPermission() {
        root.removeAllViews();
        root.addView(heading("Allow file access"));
        root.addView(body("Android needs permission before Thumb Desk can open your folders. Turn on Allow access to manage all files, then come back to this screen."));
        root.addView(primary("Allow file access", (view) -> openAccessSettings()));
        root.addView(quiet("Back", (view) -> finish()));
    }

    private void show() {
        root.removeAllViews();
        root.addView(heading(pretty(current)));
        root.addView(body("Open a folder, then tap Use this folder. Stamped documents are saved there."));
        if (!isRoot(current)) {
            root.addView(primary("Up one folder", (view) -> {
                File parent = current.getParentFile();
                if (parent != null) current = parent;
                show();
            }));
        }
        ScrollView scroll = new ScrollView(this);
        LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        File[] kids = current.listFiles();
        if (kids != null) {
            Arrays.sort(kids, (a, b) -> a.getName().compareToIgnoreCase(b.getName()));
            for (File kid : kids) {
                if (kid.getName().startsWith(".")) continue;
                if (kid.isDirectory()) list.addView(folderButton(kid));
            }
        }
        if (list.getChildCount() == 0) list.addView(body("No folders inside this one. You can still use this folder."));
        scroll.addView(list);
        root.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        root.addView(primary("Use this folder", (view) -> {
            SaveStore.rememberDirectory(this, current);
            finish();
        }));
    }

    private Button folderButton(File dir) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(dir.getName());
        button.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        button.setTextColor(Color.parseColor("#0f172a"));
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        button.setMinHeight(dp(52));
        button.setPadding(dp(16), dp(8), dp(16), dp(8));
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(Color.WHITE);
        shape.setCornerRadius(dp(12));
        shape.setStroke(dp(1), Color.parseColor("#e2e8f0"));
        button.setBackground(shape);
        button.setOnClickListener((view) -> {
            current = dir;
            show();
        });
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.setMargins(dp(16), dp(6), dp(16), dp(6));
        button.setLayoutParams(params);
        return button;
    }

    private TextView heading(String text) {
        TextView title = new TextView(this);
        title.setText(text);
        title.setTextColor(Color.parseColor("#0f172a"));
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setPadding(dp(16), dp(20), dp(16), dp(4));
        return title;
    }

    private TextView body(String text) {
        TextView message = new TextView(this);
        message.setText(text);
        message.setTextColor(Color.parseColor("#475569"));
        message.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        message.setPadding(dp(16), dp(8), dp(16), dp(12));
        return message;
    }

    private Button primary(String label, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(label);
        button.setTextColor(Color.WHITE);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        button.setMinHeight(dp(52));
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(Color.parseColor("#b45309"));
        shape.setCornerRadius(dp(12));
        button.setBackground(shape);
        button.setOnClickListener(listener);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.setMargins(dp(16), dp(8), dp(16), dp(8));
        button.setLayoutParams(params);
        return button;
    }

    private Button quiet(String label, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(label);
        button.setTextColor(Color.parseColor("#b45309"));
        button.setBackgroundColor(Color.TRANSPARENT);
        button.setOnClickListener(listener);
        return button;
    }

    private boolean isRoot(File dir) {
        return dir.getAbsolutePath().equals(Environment.getExternalStorageDirectory().getAbsolutePath());
    }

    private String pretty(File dir) {
        return SaveStore.displayPath(dir);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
