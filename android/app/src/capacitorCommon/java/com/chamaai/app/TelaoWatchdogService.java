package com.chamaai.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.admin.DevicePolicyManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

public class TelaoWatchdogService extends Service {
    static final String CHANNEL_ID = "telao_continuidade";
    static final int NOTIFICATION_ID = 8102;

    private static final long CHECK_INTERVAL_MILLIS = 30_000L;
    private static final long RESTART_DELAY_MILLIS = 2_000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private PowerManager.WakeLock wakeLock;

    private final Runnable watchdogCheck = new Runnable() {
        @Override
        public void run() {
            ensureActivityOrNotify();
            handler.postDelayed(this, CHECK_INTERVAL_MILLIS);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        startForeground(NOTIFICATION_ID, buildNotification(false));
        acquireWakeLock();
        handler.post(watchdogCheck);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIFICATION_ID, buildNotification(!MainActivity.isTelaoVisible()));
        return START_STICKY;
    }

    private void acquireWakeLock() {
        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager == null) {
            return;
        }
        // Appliance dedicado e alimentado continuamente: além da CPU, mantém o
        // display aceso mesmo se a Activity precisar ser recuperada.
        wakeLock = powerManager.newWakeLock(
            PowerManager.FULL_WAKE_LOCK
                | PowerManager.ACQUIRE_CAUSES_WAKEUP
                | PowerManager.ON_AFTER_RELEASE,
            getPackageName() + ":telao-watchdog"
        );
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire();
    }

    private void ensureActivityOrNotify() {
        if (MainActivity.isTelaoVisible()) {
            updateNotification(false);
            return;
        }

        updateNotification(true);
        if (canRelaunchActivityDirectly()) {
            try {
                startActivity(activityIntent());
            } catch (RuntimeException ignored) {
                // The persistent notification remains the supported recovery path.
            }
        }
    }

    private boolean canRelaunchActivityDirectly() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return true;
        }
        DevicePolicyManager policy = (DevicePolicyManager) getSystemService(Context.DEVICE_POLICY_SERVICE);
        return policy != null && policy.isLockTaskPermitted(getPackageName());
    }

    private Intent activityIntent() {
        return new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    }

    private PendingIntent activityPendingIntent() {
        return PendingIntent.getActivity(
            this,
            0,
            activityIntent(),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private Notification buildNotification(boolean recoveryNeeded) {
        String text = recoveryNeeded
            ? "Toque para restaurar o Telão."
            : "Telão ativo e monitorado.";
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("ChamaAi Telão")
            .setContentText(text)
            .setContentIntent(activityPendingIntent())
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    private void updateNotification(boolean recoveryNeeded) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, buildNotification(recoveryNeeded));
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Continuidade do Telão",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Mantém o painel Telão disponível e oferece restauração segura.");
        channel.setShowBadge(false);
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        scheduleServiceRestart();
        ensureActivityOrNotify();
        super.onTaskRemoved(rootIntent);
    }

    private void scheduleServiceRestart() {
        Intent serviceIntent = new Intent(this, TelaoWatchdogService.class);
        PendingIntent restart = PendingIntent.getForegroundService(
            this,
            1,
            serviceIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        AlarmManager alarmManager = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
        if (alarmManager != null) {
            alarmManager.setAndAllowWhileIdle(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                SystemClock.elapsedRealtime() + RESTART_DELAY_MILLIS,
                restart
            );
        }
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(watchdogCheck);
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        wakeLock = null;
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
