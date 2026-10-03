package com.nirili.villamanagement

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

object NotificationSupport {
    fun ensureChannel(context: Context, channelId: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(NotificationManager::class.java)
            val channel = NotificationChannel(
                channelId,
                "Nirili Management",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Bookings, excursions, transfers, messages and management updates"
                enableVibration(true)
            }
            manager.createNotificationChannel(channel)
        }
    }
}

class NiriliFirebaseMessagingService : FirebaseMessagingService() {
    companion object {
        private const val CHANNEL_ID = "nirili_management"
    }

    override fun onNewToken(token: String) {
        getSharedPreferences("nirili_push", MODE_PRIVATE)
            .edit().putString("fcm_token", token).apply()
    }

    override fun onMessageReceived(message: RemoteMessage) {
        NotificationSupport.ensureChannel(this, CHANNEL_ID)

        val title = message.data["title"] ?: message.notification?.title ?: "Nirili Villa"
        val body = message.data["body"] ?: message.notification?.body ?: "You have a new update."
        val url = message.data["url"] ?: "/"
        val tag = message.data["tag"] ?: "nirili:" + System.currentTimeMillis()

        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("url", url)
        }
        val pending = PendingIntent.getActivity(
            this,
            tag.hashCode(),
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()

        try {
            NotificationManagerCompat.from(this).notify(tag, tag.hashCode(), notification)
        } catch (_: SecurityException) {
        }
    }
}
