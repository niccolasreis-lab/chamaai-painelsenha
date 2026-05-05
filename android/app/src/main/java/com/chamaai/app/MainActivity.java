package com.chamaai.app;

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
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        
        // 1. Edge-to-Edge: Conteúdo flui por baixo das barras de sistema
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        // 2. Configurações de Adaptação e Bloqueio de Scroll
        this.getBridge().getWebView().post(() -> {
            WebView webView = this.getBridge().getWebView();
            WebSettings settings = webView.getSettings();
            
            // Força comportamento de navegador mobile (Browser Mode)
            settings.setUseWideViewPort(true);
            settings.setLoadWithOverviewMode(true);
            settings.setDomStorageEnabled(true);
            settings.setJavaScriptEnabled(true);
            settings.setTextZoom(100);

            // Desabilita rolagem visual
            webView.setVerticalScrollBarEnabled(false);
            webView.setHorizontalScrollBarEnabled(false);
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
            
            // Trava o movimento de "arrastar" (scroll), mas permite o clique (tap) funcional
            webView.setOnTouchListener((v, event) -> {
                if (event.getAction() == MotionEvent.ACTION_MOVE) {
                    return true; // Bloqueia o scroll
                }
                return false;
            });

            // Injeta CSS para garantir que o layout se force a caber na tela fixa
            webView.postDelayed(() -> {
                webView.evaluateJavascript(
                    "(function() {" +
                    "  var style = document.createElement('style');" +
                    "  style.innerHTML = 'html, body { overflow: hidden !important; height: 100vh !important; position: fixed !important; width: 100vw !important; margin: 0 !important; padding: 0 !important; }';" +
                    "  document.head.appendChild(style);" +
                    "  window.dispatchEvent(new Event(\"resize\"));" +
                    "})();", 
                    null
                );
            }, 1000);

            webView.setBackgroundColor(Color.TRANSPARENT);
        });

        // 3. Ativa o Modo Imersivo (Esconde as barras de sistema)
        WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(window, window.getDecorView());
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
