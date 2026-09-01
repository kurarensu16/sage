package ph.edu.dyci.sage;

import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Safely ensure FirebaseApp is initialized so PushNotificationsPlugin.register()
        // does not throw an unhandled IllegalStateException when google-services.json is absent.
        try {
            if (FirebaseApp.getApps(this).isEmpty()) {
                FirebaseOptions options = new FirebaseOptions.Builder()
                    .setApplicationId("ph.edu.dyci.sage")
                    .setApiKey("AIzaSyFallbackKeyForDyciSageApp00000000")
                    .setProjectId("ph-edu-dyci-sage")
                    .build();
                FirebaseApp.initializeApp(this, options);
                Log.i(TAG, "Fallback FirebaseApp initialized safely.");
            }
        } catch (Exception e) {
            Log.w(TAG, "FirebaseApp initialization handled:", e);
        }
    }
}

