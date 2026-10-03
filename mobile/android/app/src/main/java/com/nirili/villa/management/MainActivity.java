package com.nirili.villa.management;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.provider.Settings;
import android.graphics.Insets;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
    private static final String LIVE_URL = "https://nirili-villa.nirili-management.workers.dev";
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 1002;
    private static final String CHANNEL_ID = NiriliMessagingService.CHANNEL_ID;
    private static final String PUSH_PREFS = NiriliMessagingService.PREFS;
    private static final String PUSH_TOKEN_KEY = NiriliMessagingService.TOKEN_KEY;
    private static final String PUSH_PERMISSION_ASKED = "notification_permission_requested";
    private static final String APP_PREFS = "nirili_app";
    private static final String LAST_TAB_KEY = "last_tab";

    private WebView webView;
    private ProgressBar progressBar;
    private ValueCallback<Uri[]> fileChooserCallback;
    private boolean firebaseReady = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);

        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);

        FrameLayout.LayoutParams webParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        );
        root.addView(webView, webParams);

        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                dp(3)
        );
        root.addView(progressBar, progressParams);

        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(
                        insets.getSystemWindowInsetLeft(),
                        insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(),
                        insets.getSystemWindowInsetBottom()
                );
            }
            return insets;
        });

        setContentView(root);
        ensureNotificationChannel();
        ensureFirebase();
        configureWebView();

        String launchTarget = notificationTarget(getIntent());
        if (launchTarget != null) {
            webView.loadUrl(LIVE_URL + launchTarget);
        } else if (savedInstanceState == null) {
            webView.loadUrl(dashboardLaunchUrl());
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccess(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUserAgentString(settings.getUserAgentString() + " NiriliVillaAndroid/1.1");

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new NativeBridge(), "NiriliNative");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WebView.startSafeBrowsing(this, null);
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleNavigation(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleNavigation(Uri.parse(url));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                rememberTab(url);
                hideWelcomeSignInButton();
                if (isDashboardUrl(url)) {
                    view.clearHistory();
                }
                if (notificationsAllowed()) {
                    refreshFcmToken();
                } else {
                    publishNativePushStatus();
                }
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                Toast.makeText(MainActivity.this, "Secure connection failed.", Toast.LENGTH_LONG).show();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }

            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (fileChooserCallback != null) {
                    fileChooserCallback.onReceiveValue(null);
                }
                fileChooserCallback = filePathCallback;

                Intent contentIntent = new Intent(Intent.ACTION_GET_CONTENT);
                contentIntent.addCategory(Intent.CATEGORY_OPENABLE);
                contentIntent.setType("*/*");
                contentIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                contentIntent.putExtra(
                        Intent.EXTRA_MIME_TYPES,
                        new String[]{"image/*", "application/pdf"}
                );

                Intent chooser = Intent.createChooser(contentIntent, "Choose photo or document");
                try {
                    startActivityForResult(chooser, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (ActivityNotFoundException error) {
                    fileChooserCallback = null;
                    Toast.makeText(MainActivity.this, "No file picker is available.", Toast.LENGTH_LONG).show();
                    return false;
                }
            }
        });

        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
                openExternal(Uri.parse(url))
        );
    }

    private void hideWelcomeSignInButton() {
        if (webView == null) {
            return;
        }
        String js = "(function(){"
                + "function hideExtraSignIn(){"
                + "var nodes=document.querySelectorAll('a,button,[role=button]');"
                + "for(var i=0;i<nodes.length;i++){"
                + "var n=nodes[i];"
                + "var t=(n.innerText||n.textContent||'').trim().toLowerCase();"
                + "var realLogin=n.classList&&n.classList.contains('nv-submit');"
                + "var inLoginForm=!!n.closest('.nv-login-form');"
                + "if(t==='sign in'&&!realLogin&&!inLoginForm){"
                + "n.style.setProperty('display','none','important');"
                + "n.setAttribute('aria-hidden','true');"
                + "}"
                + "}"
                + "}"
                + "hideExtraSignIn();"
                + "if(!window.__niriliSignInObserver){"
                + "window.__niriliSignInObserver=new MutationObserver(function(){hideExtraSignIn();});"
                + "window.__niriliSignInObserver.observe(document.documentElement,{childList:true,subtree:true,attributes:true});"
                + "}"
                + "setTimeout(hideExtraSignIn,250);"
                + "setTimeout(hideExtraSignIn,1000);"
                + "})();";
        webView.evaluateJavascript(js, null);
    }

    private void rememberTab(String url) {
        try {
            Uri uri = Uri.parse(url);
            String tab = uri.getQueryParameter("tab");
            if (tab != null && tab.matches("^[a-f0-9]{32}$")) {
                getSharedPreferences(APP_PREFS, MODE_PRIVATE)
                        .edit()
                        .putString(LAST_TAB_KEY, tab)
                        .apply();
            }
        } catch (RuntimeException ignored) {
        }
    }

    private String dashboardLaunchUrl() {
        String tab = getSharedPreferences(APP_PREFS, MODE_PRIVATE)
                .getString(LAST_TAB_KEY, "");
        if (tab != null && tab.matches("^[a-f0-9]{32}$")) {
            return LIVE_URL + "/home?tab=" + tab;
        }
        return LIVE_URL + "/home";
    }

    private boolean isDashboardUrl(String url) {
        if (url == null || url.isEmpty()) {
            return false;
        }
        try {
            Uri uri = Uri.parse(url);
            String path = uri.getPath();
            String portal = uri.getQueryParameter("portal");
            return "/home".equals(path)
                    || (("/".equals(path) || path == null || path.isEmpty())
                    && ("admin".equals(portal) || "staff".equals(portal)));
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private void ensureNotificationChannel() {
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
        channel.setDescription("Bookings, messages, guests, transfers, excursions, buggy and POS alerts.");
        channel.enableVibration(true);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }

    private boolean firebaseConfigured() {
        return !BuildConfig.FIREBASE_APP_ID.trim().isEmpty()
                && !BuildConfig.FIREBASE_API_KEY.trim().isEmpty()
                && !BuildConfig.FIREBASE_PROJECT_ID.trim().isEmpty()
                && !BuildConfig.FIREBASE_SENDER_ID.trim().isEmpty();
    }

    private void ensureFirebase() {
        if (!firebaseConfigured()) {
            firebaseReady = false;
            return;
        }

        try {
            FirebaseApp.getInstance();
            firebaseReady = true;
            return;
        } catch (IllegalStateException ignored) {
        }

        try {
            FirebaseOptions options = new FirebaseOptions.Builder()
                    .setApplicationId(BuildConfig.FIREBASE_APP_ID)
                    .setApiKey(BuildConfig.FIREBASE_API_KEY)
                    .setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
                    .setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID)
                    .build();
            FirebaseApp app = FirebaseApp.initializeApp(this, options);
            firebaseReady = app != null;
            if (firebaseReady) {
                FirebaseMessaging.getInstance().setAutoInitEnabled(true);
            }
        } catch (RuntimeException error) {
            firebaseReady = false;
        }
    }

    private boolean notificationsAllowed() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }

    private String nativeNotificationStatus() {
        if (!notificationsAllowed()) {
            SharedPreferences prefs = getSharedPreferences(PUSH_PREFS, MODE_PRIVATE);
            boolean asked = prefs.getBoolean(PUSH_PERMISSION_ASKED, false);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                    && asked
                    && !shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)) {
                return "blocked";
            }
            return "ready";
        }
        if (!firebaseConfigured() || !firebaseReady) {
            return "setup";
        }
        String token = getSharedPreferences(PUSH_PREFS, MODE_PRIVATE)
                .getString(PUSH_TOKEN_KEY, "");
        return token == null || token.isEmpty() ? "ready" : "enabled";
    }

    private void requestNativeNotifications() {
        runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                    && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                getSharedPreferences(PUSH_PREFS, MODE_PRIVATE)
                        .edit()
                        .putBoolean(PUSH_PERMISSION_ASKED, true)
                        .apply();
                requestPermissions(
                        new String[]{Manifest.permission.POST_NOTIFICATIONS},
                        NOTIFICATION_PERMISSION_REQUEST
                );
                return;
            }

            ensureFirebase();
            if (!firebaseReady) {
                Toast.makeText(
                        MainActivity.this,
                        "Phone notification permission is enabled. Firebase push service still needs to be connected.",
                        Toast.LENGTH_LONG
                ).show();
                publishNativePushStatus();
                return;
            }

            refreshFcmToken();
        });
    }

    private void refreshFcmToken() {
        ensureFirebase();
        if (!firebaseReady || !notificationsAllowed()) {
            publishNativePushStatus();
            return;
        }

        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (!task.isSuccessful() || task.getResult() == null || task.getResult().trim().isEmpty()) {
                publishNativePushStatus();
                return;
            }
            String token = task.getResult().trim();
            getSharedPreferences(PUSH_PREFS, MODE_PRIVATE)
                    .edit()
                    .putString(PUSH_TOKEN_KEY, token)
                    .apply();
            publishNativePushStatus();
        });
    }

    private void publishNativePushStatus() {
        if (webView == null) {
            return;
        }
        String status = nativeNotificationStatus();
        String token = getSharedPreferences(PUSH_PREFS, MODE_PRIVATE)
                .getString(PUSH_TOKEN_KEY, "");
        String js = "window.dispatchEvent(new CustomEvent('nirili:native-push-status',{detail:{status:"
                + JSONObject.quote(status)
                + ",token:"
                + JSONObject.quote(token == null ? "" : token)
                + "}}));";
        webView.post(() -> {
            if (webView != null) {
                webView.evaluateJavascript(js, null);
            }
        });
    }

    private class NativeBridge {
        @JavascriptInterface
        public String getNotificationStatus() {
            return nativeNotificationStatus();
        }

        @JavascriptInterface
        public String getPushToken() {
            String token = getSharedPreferences(PUSH_PREFS, MODE_PRIVATE)
                    .getString(PUSH_TOKEN_KEY, "");
            return token == null ? "" : token;
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            requestNativeNotifications();
        }

        @JavascriptInterface
        public void openNotificationSettings() {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                    intent.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                    startActivity(intent);
                } catch (ActivityNotFoundException error) {
                    Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                }
            });
        }
    }

    private boolean handleNavigation(Uri uri) {
        if (uri == null) {
            return false;
        }

        String scheme = uri.getScheme();
        if (scheme == null) {
            return false;
        }

        if ("about".equalsIgnoreCase(scheme)) {
            return false;
        }

        if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
            if (isNiriliHost(uri.getHost())) {
                return false;
            }
            openExternal(uri);
            return true;
        }

        openExternal(uri);
        return true;
    }

    private boolean isNiriliHost(String host) {
        if (host == null) {
            return false;
        }
        return host.equals("nirili-villa.nirili-management.workers.dev")
                || host.endsWith(".nirili-management.workers.dev");
    }

    private String notificationTarget(Intent intent) {
        if (intent == null) {
            return null;
        }
        String target = intent.getStringExtra("nirili_url");
        if (target == null) {
            return null;
        }
        target = target.trim();
        if (!target.startsWith("/") || target.startsWith("//")) {
            return "/home";
        }
        return target;
    }

    private void openExternal(Uri uri) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            startActivity(intent);
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "No app can open this link.", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String target = notificationTarget(intent);
        if (target != null && webView != null) {
            webView.loadUrl(LIVE_URL + target);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            if (notificationsAllowed()) {
                refreshFcmToken();
            } else {
                publishNativePushStatus();
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            String[] permissions,
            int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != NOTIFICATION_PERMISSION_REQUEST) {
            return;
        }
        if (grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            refreshFcmToken();
        } else {
            publishNativePushStatus();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode != FILE_CHOOSER_REQUEST || fileChooserCallback == null) {
            return;
        }

        Uri[] results = null;
        if (resultCode == RESULT_OK && data != null) {
            ClipData clipData = data.getClipData();
            if (clipData != null) {
                List<Uri> uris = new ArrayList<>();
                for (int i = 0; i < clipData.getItemCount(); i++) {
                    Uri uri = clipData.getItemAt(i).getUri();
                    if (uri != null) {
                        uris.add(uri);
                    }
                }
                results = uris.toArray(new Uri[0]);
            } else if (data.getData() != null) {
                results = new Uri[]{data.getData()};
            }
        }

        fileChooserCallback.onReceiveValue(results);
        fileChooserCallback = null;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView == null) {
            finish();
            return;
        }
        String currentUrl = webView.getUrl();
        if (isDashboardUrl(currentUrl)) {
            finish();
            return;
        }
        if (webView.canGoBack()) {
            webView.goBack();
            return;
        }
        finish();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("NiriliNative");
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
