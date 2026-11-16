package com.trids.invoicedesk;

import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;

/**
 * Opens the phone's folder list from a screen that is already in the foreground.
 * Starting that list from the WebView left the app inactive and never showed the folders.
 */
public class FolderPickerActivity extends AppCompatActivity {

    private final ActivityResultLauncher<Uri> folders = registerForActivityResult(
        new ActivityResultContracts.OpenDocumentTree(),
        this::onFolder
    );

    private boolean opened;
    private TextView message;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        opened = savedInstanceState != null && savedInstanceState.getBoolean("opened");
        setContentView(buildScreen());
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                SavePdfPlugin.noteCancelled(FolderPickerActivity.this);
                finish();
            }
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        outState.putBoolean("opened", opened);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onPostResume() {
        super.onPostResume();
        if (opened) return;
        opened = true;
        getWindow().getDecorView().post(this::showFolders);
    }

    private void showFolders() {
        try {
            folders.launch(null);
            opened = true;
        } catch (Exception err) {
            opened = false;
            if (message != null) {
                message.setText("The folder list did not open. Tap Show folders and try again.");
            }
        }
    }

    private void onFolder(Uri tree) {
        if (tree == null) {
            opened = true;
            if (message != null) {
                message.setText("Open the folder you want, such as Internal storage, then tap Use this folder. Or tap Show folders to look again.");
            }
            return;
        }
        SavePdfPlugin.rememberTree(this, tree);
        finish();
    }

    private View buildScreen() {
        int pad = dp(24);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER_HORIZONTAL);
        layout.setPadding(pad, dp(48), pad, pad);
        layout.setBackgroundColor(Color.parseColor("#10141c"));

        TextView title = new TextView(this);
        title.setText("Choose a folder");
        title.setTextColor(Color.WHITE);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 24);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        layout.addView(title);

        message = new TextView(this);
        message.setText("Your phone folders should open now. Open the folder invoices should go in, then tap Use this folder.");
        message.setTextColor(Color.parseColor("#d5dbe6"));
        message.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        message.setPadding(0, dp(16), 0, dp(24));
        layout.addView(message);

        Button show = new Button(this);
        show.setText("Show folders");
        show.setAllCaps(false);
        show.setTextColor(Color.WHITE);
        show.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(Color.parseColor("#2f6fed"));
        shape.setCornerRadius(dp(12));
        show.setBackground(shape);
        show.setMinHeight(dp(48));
        show.setPadding(dp(18), dp(12), dp(18), dp(12));
        show.setOnClickListener((view) -> showFolders());
        layout.addView(show, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        Button back = new Button(this);
        back.setText("Back");
        back.setAllCaps(false);
        back.setTextColor(Color.parseColor("#d5dbe6"));
        back.setBackgroundColor(Color.TRANSPARENT);
        back.setOnClickListener((view) -> {
            SavePdfPlugin.noteCancelled(this);
            finish();
        });
        layout.addView(back);
        return layout;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
