package com.trids.invoicedesk;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Reads writing in a picture with the on-device text model. */
@CapacitorPlugin(name = "ReadText")
public class ReadTextPlugin extends Plugin {

    private final ExecutorService pool = Executors.newSingleThreadExecutor();
    private TextRecognizer recognizer;

    @PluginMethod
    public void read(PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.isEmpty()) {
            call.reject("No picture");
            return;
        }
        pool.execute(() -> {
            Bitmap bitmap = null;
            try {
                bitmap = decode(data);
                if (bitmap == null) {
                    call.reject("Could not open that picture");
                    return;
                }
                InputImage image = InputImage.fromBitmap(bitmap, 0);
                Bitmap toRecycle = bitmap;
                recognizer().process(image)
                    .addOnSuccessListener(text -> {
                        toRecycle.recycle();
                        JSObject out = new JSObject();
                        out.put("text", text.getText() == null ? "" : text.getText());
                        call.resolve(out);
                    })
                    .addOnFailureListener(err -> {
                        toRecycle.recycle();
                        call.reject(err.getMessage() == null ? "Could not read that picture" : err.getMessage());
                    });
            } catch (Exception err) {
                if (bitmap != null) bitmap.recycle();
                call.reject(err.getMessage() == null ? "Could not read that picture" : err.getMessage());
            }
        });
    }

    private TextRecognizer recognizer() {
        if (recognizer == null) recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        return recognizer;
    }

    private static Bitmap decode(String data) {
        byte[] bytes = Base64.decode(data, Base64.DEFAULT);
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = sample(bounds.outWidth, bounds.outHeight, 1280);
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opts);
    }

    private static int sample(int width, int height, int maxEdge) {
        int longest = Math.max(width, height);
        int sample = 1;
        while (longest / (sample * 2) >= maxEdge) sample *= 2;
        return sample;
    }
}
