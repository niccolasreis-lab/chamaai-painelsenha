package com.chamaai.app;

import android.app.UiModeManager;
import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.MotionEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private boolean isAndroidTV() {
        UiModeManager uiModeManager = (UiModeManager) getSystemService(Context.UI_MODE_SERVICE);
        return uiModeManager != null
            && uiModeManager.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        boolean isTv = isAndroidTV();
        boolean isTelao = isTv || BuildConfig.APP_MODE.equals("telao");

        // 1. Edge-to-Edge e Modo Imersivo para usar 100% da tela física
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        // Android TV ou Telão: manter tela sempre ligada (telão 24/7)
        if (isTelao) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }

        // 2. Configurações de Adaptação, Bloqueio de Scroll e Padronização de Botões
        this.getBridge().getWebView().post(() -> {
            WebView webView = this.getBridge().getWebView();
            WebSettings settings = webView.getSettings();
            
            settings.setUseWideViewPort(true);
            settings.setLoadWithOverviewMode(true);
            settings.setDomStorageEnabled(true);
            settings.setJavaScriptEnabled(true);
            settings.setTextZoom(100);
            settings.setSupportZoom(false);

            webView.setVerticalScrollBarEnabled(true);
            webView.setHorizontalScrollBarEnabled(false);
            
            // Injeta CSS para manter a tela fixa, e redireciona rotas de acordo com app_mode
            webView.postDelayed(() -> {
                // Configura o app_mode no localStorage de acordo com o flavor
                String appModeValue = isTelao ? "telao" : "touch";
                webView.evaluateJavascript("window.localStorage.setItem('app_mode', '" + appModeValue + "');", null);

                // Redirecionamento com base no modo
                if (isTelao) {
                    webView.evaluateJavascript(
                        "(function() {" +
                        "  if (window.location.hash !== '#/telao') {" +
                        "    window.location.hash = '#/telao';" +
                        "  }" +
                        "})();",
                        null
                    );
                } else {
                    // APK Dedicado Touch: Redireciona para operador-touch
                    webView.evaluateJavascript(
                        "(function() {" +
                        "  if (window.location.hash === '' || window.location.hash === '#/') {" +
                        "    window.location.hash = '#/operador-touch';" +
                        "  }" +
                        "})();",
                        null
                    );
                }

                // Injeta estilo de bloqueio apenas se for modo Telão/TV
                if (isTelao) {
                    webView.evaluateJavascript(
                        "(function() {" +
                        "  var style = document.createElement('style');" +
                        "  style.innerHTML = ` " +
                        "    html, body, #root { " +
                        "      overflow: hidden !important; " +
                        "      touch-action: none !important; " +
                        "      user-select: none !important; " +
                        "    } " +
                        "  `;" +
                        "  document.head.appendChild(style);" +
                        "})();",
                        null
                    );
                }

                webView.evaluateJavascript(
                    "(function() {" +
                    "  var style = document.createElement('style');" +
                    "  style.innerHTML = ` " +
                    "    html, body, #root { " +
                    "      height: 100vh !important; " +
                    "      width: 100vw !important; " +
                    "      margin: 0 !important; " +
                    "      padding: 0 !important; " +
                    "    } " +
                    "  `; " +
                    "  document.head.appendChild(style);" +
                    "  window.dispatchEvent(new Event('resize'));" +
                    "})();", 
                    null
                );
            }, 1000);

            webView.setBackgroundColor(Color.TRANSPARENT);
        });

        // 3. Esconde barras de sistema
        WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(window, window.getDecorView());
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}

