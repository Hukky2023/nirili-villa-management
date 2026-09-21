import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";

import {
  HOTEL_SYSTEM_URL,
  isExternalAppUrl,
  isInternalUrl,
} from "./config";

const USER_AGENT_SUFFIX = "NiriliVillaMobile/1.0";
const NativeWebView = WebView as unknown as React.ComponentType<any>;

export default function App() {
  const webViewRef = useRef<any>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loadKey, setLoadKey] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setFailed(false);
    setLoading(true);
    setLoadKey((value) => value + 1);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (canGoBack) {
          webViewRef.current?.goBack();
          return true;
        }
        return false;
      },
    );

    return () => subscription.remove();
  }, [canGoBack]);

  const handleNavigation = useCallback((navigation: any) => {
    setCanGoBack(Boolean(navigation?.canGoBack));
  }, []);

  const handleShouldStart = useCallback((request: { url: string }) => {
    const { url } = request;

    if (isInternalUrl(url)) {
      return true;
    }

    if (isExternalAppUrl(url) || /^https?:/i.test(url)) {
      void Linking.openURL(url).catch(() => undefined);
      return false;
    }

    return true;
  }, []);

  const handleLoadEnd = useCallback(() => {
    setLoading(false);
  }, []);

  const handleError = useCallback(() => {
    setLoading(false);
    setFailed(true);
  }, []);

  if (failed) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Cannot connect to Nirili Villa</Text>
          <Text style={styles.errorText}>
            Check your internet connection and try again. Your hotel data remains
            safely stored in the main Nirili management system.
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Retry connection"
            style={styles.retryButton}
            onPress={reload}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.container}>
        <NativeWebView
          key={loadKey}
          ref={webViewRef}
          source={{ uri: HOTEL_SYSTEM_URL }}
          style={styles.webView}
          originWhitelist={["https://*", "http://*", "about:*", "blob:*", "data:*"]}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          allowsBackForwardNavigationGestures
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          setSupportMultipleWindows={false}
          pullToRefreshEnabled
          onNavigationStateChange={handleNavigation}
          onShouldStartLoadWithRequest={handleShouldStart}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={handleLoadEnd}
          onError={handleError}
          applicationNameForUserAgent={USER_AGENT_SUFFIX}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" />
              <Text style={styles.loadingText}>Opening Nirili Villa…</Text>
            </View>
          )}
        />
        {loading ? (
          <View pointerEvents="none" style={styles.thinLoadingBar}>
            <ActivityIndicator size="small" />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  webView: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#ffffff",
  },
  loadingText: {
    fontSize: 15,
    fontWeight: "600",
  },
  thinLoadingBar: {
    position: "absolute",
    top: 8,
    right: 10,
    borderRadius: 18,
    padding: 6,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  errorTitle: {
    marginBottom: 10,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
  },
  errorText: {
    maxWidth: 420,
    marginBottom: 22,
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
  },
  retryButton: {
    minWidth: 132,
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 13,
    backgroundColor: "#111111",
  },
  retryText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
});
