package com.chamaai.app;

import android.Manifest;
import android.app.ActivityManager;
import android.app.admin.DevicePolicyManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

/**
 * Shared Capacitor activity used by the Android appliance flavors.
 *
 * <p>The TV shell deliberately consumes BACK. A three-second hold asks the web
 * application to open its server settings; a short press must never close the
 * unattended display.</p>
 */
public class MainActivity extends BridgeActivity {
    private static final long SETTINGS_HOLD_MILLIS = 3_000L;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 4102;
    private static volatile boolean telaoVisible;

    private final Handler backHandler = new Handler(Looper.getMainLooper());
    private boolean backPressed;
    private boolean settingsEventSent;

    private final Runnable openSettings = () -> {
        if (!backPressed || settingsEventSent || getBridge() == null) {
            return;
        }
        settingsEventSent = true;
        getBridge().triggerWindowJSEvent("TELAO_OPEN_SETTINGS", "{}");
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(TelaoCachePlugin.class);
        super.onCreate(savedInstanceState);

        if (isTelao()) {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
            configureWebView();
            enterImmersiveMode();
            startTelaoWatchdog();
            requestNotificationPermission();
            enterPermittedLockTaskMode();
        }
    }

    static boolean isTelaoVisible() {
        return telaoVisible;
    }

    private boolean isTelao() {
        return "telao".equals(BuildConfig.APP_MODE);
    }

    private void configureWebView() {
        if (getBridge() == null) {
            return;
        }
        WebView webView = getBridge().getWebView();
        if (webView == null) {
            return;
        }
        WebSettings settings = webView.getSettings();
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setMediaPlaybackRequiresUserGesture(false);
    }

    private void enterImmersiveMode() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }

    private void startTelaoWatchdog() {
        Intent service = new Intent(this, TelaoWatchdogService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(service);
        } else {
            startService(service);
        }
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                new String[] { Manifest.permission.POST_NOTIFICATIONS },
                NOTIFICATION_PERMISSION_REQUEST
            );
        }
    }

    private void enterPermittedLockTaskMode() {
        DevicePolicyManager policy = (DevicePolicyManager) getSystemService(Context.DEVICE_POLICY_SERVICE);
        ActivityManager activityManager = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        if (policy != null
            && activityManager != null
            && policy.isLockTaskPermitted(getPackageName())
            && activityManager.getLockTaskModeState() == ActivityManager.LOCK_TASK_MODE_NONE) {
            startLockTask();
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        if (isTelao()) {
            telaoVisible = true;
        }
    }

    @Override
    public void onStop() {
        if (isTelao()) {
            telaoVisible = false;
        }
        super.onStop();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && isTelao()) {
            enterImmersiveMode();
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (!isTelao()) {
            return super.dispatchKeyEvent(event);
        }
        if (event.getKeyCode() != KeyEvent.KEYCODE_BACK) {
            return super.dispatchKeyEvent(event);
        }

        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            if (!backPressed) {
                backPressed = true;
                settingsEventSent = false;
                backHandler.postDelayed(openSettings, SETTINGS_HOLD_MILLIS);
            }
            return true;
        }

        if (event.getAction() == KeyEvent.ACTION_UP) {
            backPressed = false;
            backHandler.removeCallbacks(openSettings);
            return true;
        }

        return true;
    }

    @Override
    public void onDestroy() {
        if (isTelao()) {
            telaoVisible = false;
        }
        backPressed = false;
        backHandler.removeCallbacks(openSettings);
        super.onDestroy();
    }
}
