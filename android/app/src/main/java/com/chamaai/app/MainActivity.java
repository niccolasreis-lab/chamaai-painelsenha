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
        
        // 1. Edge-to-Edge e Modo Imersivo para usar 100% da tela física
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
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

            webView.setVerticalScrollBarEnabled(false);
            webView.setHorizontalScrollBarEnabled(false);
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
            
            // Trava o scroll, mas permite cliques
            webView.setOnTouchListener(new View.OnTouchListener() {
                @Override
                public boolean onTouch(View v, MotionEvent event) {
                    if (event.getAction() == MotionEvent.ACTION_MOVE) {
                        return true; 
                    }
                    if (event.getAction() == MotionEvent.ACTION_UP) {
                        v.performClick();
                    }
                    return false;
                }
            });

            // Injeta CSS para manter a tela fixa e botões com tamanhos iguais
            webView.postDelayed(() -> {
                webView.evaluateJavascript(
                    "(function() {" +
                    "  var style = document.createElement('style');" +
                    "  style.innerHTML = ` " +
                    "    html, body, #root { " +
                    "      overflow: hidden !important; " +
                    "      height: 100vh !important; " +
                    "      width: 100vw !important; " +
                    "      margin: 0 !important; " +
                    "      padding: 0 !important; " +
                    "      display: flex !important; " +
                    "      flex-direction: column !important; " +
                    "    } " +
                    "    /* Garante que o container dos botões distribua espaço igualmente */ " +
                    "    .flex.flex-col, .flex.flex-row, #root > div:last-child { " +
                    "      display: flex !important; " +
                    "      gap: 10px !important; " +
                    "    } " +
                    "    /* Padroniza todos os botões de ação para terem o mesmo tamanho */ " +
                    "    button { " +
                    "      flex: 1 1 0% !important; " +
                    "      min-height: 80px !important; " +
                    "      margin: 5px !important; " +
                    "      display: flex !important; " +
                    "      align-items: center !important; " +
                    "      justify-content: center !important; " +
                    "      font-size: 1.25rem !important; " +
                    "    } " +
                    "    /* Ajuste para o box principal de chamada não empurrar os botões */ " +
                    "    #root > div:first-child, .main-content { " +
                    "      flex: 2 !important; " +
                    "      overflow: hidden !important; " +
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
