package com.nirili.villamanagement

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
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
    private lateinit var progress: ProgressBar
    private lateinit var statusText: TextView
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
        progress = findViewById(R.id.pageProgress)
        statusText = findViewById(R.id.statusText)

        findViewById<Button>(R.id.navBack).setOnClickListener {
            if (webView.canGoBack()) webView.goBack()
        }
        findViewById<Button>(R.id.navHome).setOnClickListener {
            webView.loadUrl(BASE_URL)
        }
        findViewById<Button>(R.id.navRefresh).setOnClickListener {
            webView.reload()
        }

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.setBackgroundColor(Color.WHITE)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.loadsImagesAutomatically = true
        webView.settings.mediaPlaybackRequiresUserGesture = false
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = false
        webView.settings.setSupportZoom(false)

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progress.progress = newProgress
                progress.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
                if (newProgress in 1..99) {
                    statusText.text = getString(R.string.status_loading)
                }
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                pageReady = url.startsWith(BASE_URL)
                statusText.text = getString(R.string.status_online)
                progress.visibility = View.GONE
                if (pageReady) registerTokenWithSignedInWebSession()
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                if (request.isForMainFrame) {
                    statusText.text = getString(R.string.status_offline)
                }
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
