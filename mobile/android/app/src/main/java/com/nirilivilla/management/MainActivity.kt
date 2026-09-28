package com.nirilivilla.management

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebSettings
import android.webkit.WebResourceRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            Log.i(TAG, "Notification permission granted=$granted")
            if (granted) {
                refreshFcmToken()
            } else {
                dispatchNativePushStatus("blocked", currentPushToken())
            }
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        createNotificationChannel()

        webView = WebView(this)
        setContentView(webView)

        CookieManager.getInstance().setAcceptCookie(true)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.cacheMode = WebSettings.LOAD_NO_CACHE
        webView.settings.setSupportZoom(false)
        webView.clearCache(true)
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val target = request?.url?.toString().orEmpty()
                if (target.isBlank() || !target.startsWith(BuildConfig.MANAGEMENT_URL)) return false

                val preserved = preserveSessionTab(target)
                if (preserved != target) {
                    view?.loadUrl(preserved)
                    return true
                }
                return false
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                if (!url.isNullOrBlank() && url.startsWith(BuildConfig.MANAGEMENT_URL)) {
                    when {
                        isAuthenticatedUrl(url) -> {
                            getSharedPreferences(PREFS, MODE_PRIVATE)
                                .edit()
                                .putString(KEY_LAST_URL, url)
                                .apply()
                            // Once login succeeds, never let Android Back navigate
                            // into the old sign-in page that was behind the dashboard.
                            view?.clearHistory()
                            injectTabPersistence(view, url)
                        }
                        isLoginUrl(url) -> {
                            // Reaching the login screen normally means the user
                            // explicitly signed out or the server ended the session.
                            getSharedPreferences(PREFS, MODE_PRIVATE)
                                .edit()
                                .putString(KEY_LAST_URL, BuildConfig.MANAGEMENT_URL)
                                .apply()
                            view?.clearHistory()
                        }
                    }
                    CookieManager.getInstance().flush()
                }
                dispatchNativePushStatus(notificationStatus(), currentPushToken())
            }
        }
        webView.webChromeClient = WebChromeClient()
        webView.addJavascriptInterface(NativeBridge(), "NiriliNative")

        val lastUrl = getSharedPreferences(PREFS, MODE_PRIVATE)
            .getString(KEY_LAST_URL, BuildConfig.MANAGEMENT_URL)
            .orEmpty()
            .takeIf { it.startsWith(BuildConfig.MANAGEMENT_URL) }
            ?: BuildConfig.MANAGEMENT_URL
        webView.loadUrl(lastUrl)
        requestNotificationPermissionIfNeeded()
        refreshFcmToken()
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return

        if (
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(
            getString(R.string.default_notification_channel_id),
            getString(R.string.default_notification_channel_name),
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = getString(R.string.default_notification_channel_description)
            enableVibration(true)
            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        }

        manager.createNotificationChannel(channel)
    }

    private fun refreshFcmToken() {
        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { token ->
                getSharedPreferences(PREFS, MODE_PRIVATE)
                    .edit()
                    .putString(KEY_FCM_TOKEN, token)
                    .apply()

                Log.i(TAG, "FCM token refreshed")
                dispatchNativePushStatus(notificationStatus(), token)
            }
            .addOnFailureListener { error ->
                Log.e(TAG, "Unable to obtain FCM token", error)
                dispatchNativePushStatus("error", currentPushToken())
            }
    }

    private fun forceRefreshFcmToken() {
        FirebaseMessaging.getInstance().deleteToken()
            .addOnCompleteListener {
                getSharedPreferences(PREFS, MODE_PRIVATE)
                    .edit()
                    .remove(KEY_FCM_TOKEN)
                    .apply()
                refreshFcmToken()
            }
    }

    private fun currentPushToken(): String {
        return getSharedPreferences(PREFS, MODE_PRIVATE)
            .getString(KEY_FCM_TOKEN, "")
            .orEmpty()
    }

    private fun currentTabId(): String {
        val current = if (::webView.isInitialized) webView.url.orEmpty() else ""
        return try {
            Uri.parse(current).getQueryParameter("tab").orEmpty()
                .takeIf { it.matches(Regex("^[a-f0-9]{32}$")) }
                ?: getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_TAB_ID, "").orEmpty()
        } catch (_: Exception) {
            getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_TAB_ID, "").orEmpty()
        }
    }

    private fun preserveSessionTab(value: String): String {
        if (!value.startsWith(BuildConfig.MANAGEMENT_URL)) return value
        return try {
            val uri = Uri.parse(value)
            val existing = uri.getQueryParameter("tab").orEmpty()
            if (existing.matches(Regex("^[a-f0-9]{32}$"))) {
                getSharedPreferences(PREFS, MODE_PRIVATE)
                    .edit()
                    .putString(KEY_TAB_ID, existing)
                    .apply()
                return value
            }
            val tab = currentTabId()
            if (!tab.matches(Regex("^[a-f0-9]{32}$"))) return value
            uri.buildUpon().appendQueryParameter("tab", tab).build().toString()
        } catch (_: Exception) {
            value
        }
    }

    private fun injectTabPersistence(view: WebView?, pageUrl: String) {
        if (view == null) return
        val tab = try { Uri.parse(pageUrl).getQueryParameter("tab").orEmpty() } catch (_: Exception) { "" }
        if (!tab.matches(Regex("^[a-f0-9]{32}$"))) return

        getSharedPreferences(PREFS, MODE_PRIVATE)
            .edit()
            .putString(KEY_TAB_ID, tab)
            .apply()

        val script = """
            (function(){
              const tab='$tab';
              const sameOrigin=(u)=>{try{return new URL(u,location.href).origin===location.origin}catch(e){return false}};
              const withTab=(u)=>{
                try{
                  const x=new URL(u,location.href);
                  if(x.origin!==location.origin)return u;
                  if(!x.searchParams.get('tab'))x.searchParams.set('tab',tab);
                  return x.pathname+x.search+x.hash;
                }catch(e){return u}
              };
              const ps=history.pushState.bind(history);
              const rs=history.replaceState.bind(history);
              history.pushState=(s,t,u)=>ps(s,t,u?withTab(u):u);
              history.replaceState=(s,t,u)=>rs(s,t,u?withTab(u):u);
              document.addEventListener('click',function(e){
                const a=e.target&&e.target.closest?e.target.closest('a[href]'):null;
                if(!a)return;
                const href=a.getAttribute('href');
                if(!href||href.startsWith('#')||!sameOrigin(href))return;
                a.setAttribute('href',withTab(href));
              },true);
            })();
        """.trimIndent()
        view.evaluateJavascript(script, null)
    }

    private fun isLoginUrl(value: String): Boolean {
        return try {
            val uri = Uri.parse(value)
            val path = uri.path.orEmpty()
            val portal = uri.getQueryParameter("portal").orEmpty()
            path.contains("/login") || (path == "/" && portal.isBlank())
        } catch (_: Exception) {
            false
        }
    }

    private fun isAuthenticatedUrl(value: String): Boolean {
        return try {
            val uri = Uri.parse(value)
            val path = uri.path.orEmpty()
            val portal = uri.getQueryParameter("portal").orEmpty()
            if (isLoginUrl(value)) return false
            portal in setOf("admin", "staff") ||
                path.startsWith("/home") ||
                path.startsWith("/transport") ||
                path.startsWith("/restaurant") ||
                path.startsWith("/crew") ||
                path.startsWith("/buggy-driver")
        } catch (_: Exception) {
            false
        }
    }

    private fun isAuthenticatedHome(value: String?): Boolean {
        if (value.isNullOrBlank()) return false
        return try {
            val uri = Uri.parse(value)
            uri.path.orEmpty() == "/" &&
                uri.getQueryParameter("portal").orEmpty() in setOf("admin", "staff")
        } catch (_: Exception) {
            false
        }
    }

    private fun notificationStatus(): String {
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            return "blocked"
        }

        val manager = getSystemService(NotificationManager::class.java)
        return if (manager.areNotificationsEnabled()) "enabled" else "blocked"
    }

    private fun dispatchNativePushStatus(status: String, token: String) {
        if (!::webView.isInitialized) return
        val safeStatus = jsEscape(status)
        val safeToken = jsEscape(token)
        webView.post {
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('nirili:native-push-status',{detail:{status:'$safeStatus',token:'$safeToken'}}));",
                null
            )
        }
    }

    private fun jsEscape(value: String): String {
        return value
            .replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
    }

    private fun openNotificationSettings() {
        val intent = Intent().apply {
            action = Settings.ACTION_APP_NOTIFICATION_SETTINGS
            putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
            data = Uri.parse("package:$packageName")
        }
        startActivity(intent)
    }

    inner class NativeBridge {

        @JavascriptInterface
        fun getPushToken(): String = currentPushToken()

        @JavascriptInterface
        fun getNotificationStatus(): String = notificationStatus()

        @JavascriptInterface
        fun requestNotificationPermission() {
            runOnUiThread {
                if (
                    Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                    ContextCompat.checkSelfPermission(
                        this@MainActivity,
                        Manifest.permission.POST_NOTIFICATIONS
                    ) == PackageManager.PERMISSION_GRANTED
                ) {
                    refreshFcmToken()
                } else {
                    notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
            }
        }

        @JavascriptInterface
        fun refreshPushToken() {
            runOnUiThread {
                forceRefreshFcmToken()
            }
        }

        @JavascriptInterface
        fun openNotificationSettings() {
            runOnUiThread {
                this@MainActivity.openNotificationSettings()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (::webView.isInitialized) {
            dispatchNativePushStatus(notificationStatus(), currentPushToken())
        }
    }

    override fun onPause() {
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onBackPressed() {
        if (!::webView.isInitialized) {
            super.onBackPressed()
            return
        }

        val current = webView.url
        if (isAuthenticatedHome(current)) {
            // On the logged-in dashboard, Back exits the Android app.
            // It must never expose the sign-in page underneath.
            moveTaskToBack(true)
            return
        }

        if (webView.canGoBack()) {
            val history = webView.copyBackForwardList()
            val previousIndex = history.currentIndex - 1
            val previousUrl =
                if (previousIndex >= 0) history.getItemAtIndex(previousIndex)?.url else null

            if (!previousUrl.isNullOrBlank() && isLoginUrl(previousUrl) && isAuthenticatedUrl(current.orEmpty())) {
                moveTaskToBack(true)
            } else {
                webView.goBack()
            }
            return
        }

        moveTaskToBack(true)
    }

    companion object {
        private const val TAG = "NiriliPush"
        private const val PREFS = "nirili_push"
        private const val KEY_FCM_TOKEN = "fcm_token"
        private const val KEY_LAST_URL = "last_url"
        private const val KEY_TAB_ID = "tab_id"
    }
}
