package ua.teplo.customer.test;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

/** Test customer shell. All order permissions and test-only guards remain on the server. */
public final class MainActivity extends Activity {
    private static final String START_URL = "https://kirillbebzenka-coder.github.io/teplo-app/?v=81&source=android-test";
    private LinearLayout root;
    private WebView web;
    private LinearLayout errorPanel;
    private ProgressBar progress;
    private boolean mainFrameFailed;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        else getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);

        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            int left, top, right, bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                left = bars.left; top = bars.top; right = bars.right;
                bottom = Math.max(bars.bottom, insets.getInsets(WindowInsets.Type.ime()).bottom);
            } else {
                left = insets.getSystemWindowInsetLeft(); top = insets.getSystemWindowInsetTop();
                right = insets.getSystemWindowInsetRight(); bottom = insets.getSystemWindowInsetBottom();
            }
            view.setPadding(left, top, right, bottom);
            return insets;
        });
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        root.addView(progress, new LinearLayout.LayoutParams(-1, dp(3)));
        FrameLayout content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        web = new WebView(this);
        content.addView(web, new FrameLayout.LayoutParams(-1, -1));
        errorPanel = new LinearLayout(this);
        errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorPanel.setGravity(Gravity.CENTER);
        errorPanel.setPadding(dp(28), dp(28), dp(28), dp(28));
        errorPanel.setBackgroundColor(Color.WHITE);
        TextView title = new TextView(this);
        title.setText("TEPLO"); title.setTextColor(Color.rgb(172,46,118)); title.setTextSize(30);
        errorPanel.addView(title);
        TextView explanation = new TextView(this);
        explanation.setText("Не удалось открыть приложение.\nПроверь интернет и попробуй ещё раз.");
        explanation.setTextColor(Color.rgb(65,50,70)); explanation.setTextSize(17);
        explanation.setGravity(Gravity.CENTER); explanation.setPadding(0,dp(20),0,dp(20));
        errorPanel.addView(explanation);
        Button retry = new Button(this); retry.setText("Повторить");
        retry.setOnClickListener(v -> web.loadUrl(isCustomerUrl(web.getUrl()) ? web.getUrl() : START_URL));
        errorPanel.addView(retry);
        content.addView(errorPanel, new FrameLayout.LayoutParams(-1,-1));
        errorPanel.setVisibility(View.GONE);
        setContentView(root);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        WebView.setWebContentsDebuggingEnabled(false);
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int value) {
                progress.setProgress(value);
                progress.setVisibility(value < 100 && !mainFrameFailed ? View.VISIBLE : View.GONE);
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return navigate(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return navigate(Uri.parse(url));
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                mainFrameFailed = false; errorPanel.setVisibility(View.GONE); progress.setVisibility(View.VISIBLE);
            }
            @Override public void onPageFinished(WebView view, String url) {
                progress.setVisibility(View.GONE); syncChromeColors();
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showLoadError();
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) showLoadError();
            }
        });
        if (state == null || web.restoreState(state) == null) web.loadUrl(START_URL);
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private void showLoadError() { mainFrameFailed = true; progress.setVisibility(View.GONE); errorPanel.setVisibility(View.VISIBLE); }

    static boolean isCustomerUrl(String value) {
        if (value == null) return false;
        Uri uri = Uri.parse(value);
        if (!"https".equalsIgnoreCase(uri.getScheme()) || !"kirillbebzenka-coder.github.io".equalsIgnoreCase(uri.getHost())
                || (uri.getPort() != -1 && uri.getPort() != 443) || uri.getUserInfo() != null) return false;
        String path = uri.getPath();
        return "/teplo-app/".equals(path) || "/teplo-app/index.html".equals(path)
                || "/teplo-app/order.html".equals(path) || "/teplo-app/felicita.html".equals(path);
    }
    private boolean navigate(Uri uri) {
        if (isCustomerUrl(uri.toString())) return false;
        String scheme = uri.getScheme();
        Intent intent = null;
        if ("https".equalsIgnoreCase(scheme)) intent = new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE);
        if ("tel".equalsIgnoreCase(scheme)) intent = new Intent(Intent.ACTION_DIAL, uri);
        if ("mailto".equalsIgnoreCase(scheme)) intent = new Intent(Intent.ACTION_SENDTO, uri);
        if (intent != null) {
            try { startActivity(intent); } catch (ActivityNotFoundException error) { Toast.makeText(this,"Не найдено приложение для этой ссылки",Toast.LENGTH_SHORT).show(); }
        }
        return true;
    }
    private void syncChromeColors() {
        if (web == null || !isCustomerUrl(web.getUrl())) return;
        web.evaluateJavascript("(function(){var m=document.querySelector('meta[name=\"theme-color\"]');return m?m.content:'';})()", new ValueCallback<String>() {
            @Override public void onReceiveValue(String value) {
                boolean dark = "\"#0b090f\"".equals(value);
                int color = dark ? Color.rgb(11,9,15) : Color.WHITE;
                root.setBackgroundColor(color);
                getWindow().setStatusBarColor(color); getWindow().setNavigationBarColor(color);
                if (Build.VERSION.SDK_INT >= 30) {
                    WindowInsetsController controller = getWindow().getInsetsController();
                    int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                    if (controller != null) controller.setSystemBarsAppearance(dark ? 0 : mask, mask);
                } else {
                    int flags = getWindow().getDecorView().getSystemUiVisibility();
                    int mask = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | (Build.VERSION.SDK_INT >= 26 ? View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : 0);
                    getWindow().getDecorView().setSystemUiVisibility(dark ? flags & ~mask : flags | mask);
                }
            }
        });
    }
    @Override public void onUserInteraction() {
        super.onUserInteraction();
        if (web != null) web.postDelayed(this::syncChromeColors,200);
    }
    @Override protected void onSaveInstanceState(Bundle state) { web.saveState(state); super.onSaveInstanceState(state); }
    @Override protected void onPause() { CookieManager.getInstance().flush(); super.onPause(); }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onDestroy() { web.stopLoading(); web.destroy(); super.onDestroy(); }
}
