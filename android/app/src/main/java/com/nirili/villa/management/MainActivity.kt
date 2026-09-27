package com.nirili.villa.management

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONObject

class MainActivity : AppCompatActivity() {
    companion object {
        const val BASE_URL = "https://nirili-villa.nirili-management.workers.dev"
        private const val CHANNEL_ID = "nirili_management"
    }

    private lateinit var webView: WebView
    private var fcmToken: String? = null
    private var pageReady = false

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        NotificationSupport.ensureChannel(this, CHANNEL_ID)
        requestNotificationPermission()

        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.webView)

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = false
        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                pageReady = url.startsWith(BASE_URL)
                if (pageReady) registerTokenWithSignedInWebSession()
            }
        }

        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            fcmToken = token
            getSharedPreferences("nirili_push", MODE_PRIVATE)
                .edit().putString("fcm_token", token).apply()
            registerTokenWithSignedInWebSession()
        }

        val initialPath = intent.getStringExtra("url") ?: "/"
        webView.loadUrl(safeUrl(initialPath))
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val path = intent.getStringExtra("url") ?: return
        if (::webView.isInitialized) webView.loadUrl(safeUrl(path))
    }

    private fun safeUrl(path: String): String {
        val clean = if (path.startsWith("/") && !path.startsWith("//")) path else "/"
        return BASE_URL + clean
    }

    private fun registerTokenWithSignedInWebSession() {
        val token = fcmToken ?: getSharedPreferences("nirili_push", MODE_PRIVATE)
            .getString("fcm_token", null) ?: return
        if (!pageReady || !::webView.isInitialized) return

        val payload = JSONObject()
            .put("nativeToken", token)
            .put("platform", "android")
            .toString()

        val js = """
            (() => {
              if (location.origin !== ${JSONObject.quote(BASE_URL)}) return;
              fetch('/api/admin-push', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {'Content-Type': 'application/json'},
                body: ${JSONObject.quote(payload)}
              }).catch(() => {});
            })();
        """.trimIndent()
        webView.evaluateJavascript(js, null)
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack()
        else super.onBackPressed()
    }
}
