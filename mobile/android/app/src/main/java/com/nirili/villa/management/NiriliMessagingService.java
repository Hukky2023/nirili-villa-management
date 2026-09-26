package com.nirili.villa.management;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class NiriliMessagingService extends FirebaseMessagingService {
    static final String CHANNEL_ID = "nirili_alerts";
    static final String PREFS = "nirili_native_push";
    static final String TOKEN_KEY = "fcm_token";

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        getSharedPreferences(PREFS, MODE_PRIVATE)
                .edit()
                .putString(TOKEN_KEY, token == null ? "" : token)
                .apply();
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        String title = value(data.get("title"), "Nirili Villa");
        String body = value(data.get("body"), "You have a new management update.");
        String url = safePath(data.get("url"));
        String tag = value(data.get("tag"), "nirili-" + System.currentTimeMillis());

        ensureChannel();

        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("nirili_url", url);

        int requestCode = Math.abs(tag.hashCode());
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }

        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                requestCode,
                intent,
                pendingFlags
        );

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
            builder.setPriority(Notification.PRIORITY_HIGH);
        }

        builder.setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setDefaults(Notification.DEFAULT_ALL);

        NotificationManager manager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        manager.notify(tag, requestCode, builder.build());
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel current = manager.getNotificationChannel(CHANNEL_ID);
        if (current != null) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Nirili Villa alerts",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Bookings, messages, guest, transport, excursion, buggy and POS alerts.");
        channel.enableVibration(true);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }

    private static String value(String raw, String fallback) {
        return raw == null || raw.trim().isEmpty() ? fallback : raw.trim();
    }

    private static String safePath(String raw) {
        if (raw == null) {
            return "/home";
        }
        String value = raw.trim();
        if (!value.startsWith("/") || value.startsWith("//")) {
            return "/home";
        }
        return value;
    }
}
