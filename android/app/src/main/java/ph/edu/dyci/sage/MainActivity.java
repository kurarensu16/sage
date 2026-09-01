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

        // Ensure FirebaseApp is safely initialized to prevent PushNotifications crash
        try {
            if (FirebaseApp.getApps(this).isEmpty()) {
                FirebaseOptions options = new FirebaseOptions.Builder()
                    .setApplicationId("ph.edu.dyci.sage")
                    .setApiKey("sage_internal_app_key_dyci_2026")
                    .setProjectId("sage-institution-dyci")
                    .build();
                FirebaseApp.initializeApp(this, options);
                Log.i(TAG, "FirebaseApp safely initialized for SAGE client.");
            }
        } catch (Exception e) {
            Log.w(TAG, "Firebase initialization exception handled safely:", e);
        }
    }
}
