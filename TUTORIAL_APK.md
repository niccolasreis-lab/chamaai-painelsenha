# Guia para Criar o APK do Operador

A interface mobile em `src/operador/MobileOperador.tsx` agora possui **3 botões de ação**: **Chamar Próximo**, **Repetir** e **Devolver à Fila**. O layout é totalmente responsivo para celulares (vertical) e tablets (Galaxy Tab A11, vertical e horizontal).

---

### 1. Instalar o Capacitor
O Capacitor transforma seu app web em um app nativo.
```powershell
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "ChamaAi Operador" com.chamaai.app --web-dir dist
```

### 2. Gerar o Build do Web
```powershell
npm run build
```

### 3. Adicionar o Android
```powershell
npx cap add android
```

### 4. Configurar Permissão de Rede Local (CRITICAL)
Como o servidor roda em um IP local (sem HTTPS), o Android bloqueia a conexão por padrão. Vamos liberar o "Cleartext traffic":
1. Abra a pasta `android\app\src\main\AndroidManifest.xml`.
2. Dentro da tag `<application>`, adicione o atributo:
   `android:usesCleartextTraffic="true"`

Exemplo:
```xml
<application
    android:allowBackup="true"
    android:icon="@mipmap/ic_launcher"
    android:label="@string/app_name"
    android:usesCleartextTraffic="true"
    ... >
```

### 5. Configurar Orientação para Tablet (Galaxy Tab A11)
Para permitir **vertical e horizontal** no tablet, edite o `AndroidManifest.xml`:
```xml
<activity
    android:name=".MainActivity"
    android:screenOrientation="unspecified"
    android:configChanges="orientation|screenSize|keyboardHidden"
    ... >
```

> [!TIP]
> O layout usa classes `md:` do Tailwind que se adaptam automaticamente para telas ≥768px (tablets). No Galaxy Tab A11 (1200x2000px), os botões ficam enormes tanto na vertical quanto na horizontal.

### 6. Sincronizar e Abrir no Android Studio
```powershell
npx cap sync
npx cap open android
```

### 7. Gerar o APK no Android Studio
1. No Android Studio, aguarde o Gradle terminar de carregar.
2. Vá no menu: **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
3. O Android Studio vai gerar o arquivo `.apk`. Clique no balão que aparecerá no canto inferior direito ("locate") para encontrar o arquivo.

---

### Funcionalidades no APK:
- **Chamar Próximo**: Puxa a próxima senha da fila (azul gigante)
- **Repetir**: Re-emite o chamado da senha atual no telão
- **Devolver à Fila**: Devolve a senha atual de volta à fila de espera (amarelo)
- **Configuração de IP**: Se o servidor não for encontrado, abre automaticamente a configuração de rede
- **Layout Tablet**: Em telas ≥768px, todos os botões, números e espaçamentos se expandem automaticamente
