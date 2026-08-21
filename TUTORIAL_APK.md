# Guia para Criar o APK do Operador

A interface dedicada em `src/operador/ControleTouch.tsx` possui **3 botões de ação** sempre visíveis: **Chamar Próximo**, **Repetir** e **Devolver**. O layout se adapta estruturalmente a tablets em orientação vertical e horizontal.

> [!WARNING]
> O APK do operador não exige login. Instale-o somente em dispositivos controlados e conecte-o exclusivamente a uma rede local confiável; as rotas de operação não devem ser publicadas na internet.

---

### 1. Instalar o Capacitor
O Capacitor transforma seu app web em um app nativo.
```powershell
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "ChamaAi Operador" com.chamaai.app --web-dir dist
```

### 2. Gerar o Build do Web
```powershell
npm run build:operador
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
npm run android:operador:sync
npx cap open android
```

Para gerar diretamente o APK de homologação pela linha de comando:

```powershell
npm run android:operador:apk
```

### 7. Gerar o APK no Android Studio
1. No Android Studio, aguarde o Gradle terminar de carregar.
2. Vá no menu: **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
3. O Android Studio vai gerar o arquivo `.apk`. Clique no balão que aparecerá no canto inferior direito ("locate") para encontrar o arquivo.

---

### Funcionalidades no APK:
- **Chamar Próximo**: Puxa a próxima senha da fila
- **Repetir**: Re-emite o chamado da senha atual no telão
- **Devolver à Fila**: Devolve a senha atual de volta à fila de espera (amarelo)
- **Contador da fila**: Exibe o total atualizado de pessoas aguardando
- **Configuração de IP**: Disponível na primeira abertura e pelo botão de configurações
- **Tela sempre ligada**: O flavor operador aplica `FLAG_KEEP_SCREEN_ON`
- **Layout Tablet**: Os três botões mantêm dimensões iguais em retrato e paisagem
- **Reconexão automática**: Enquanto o servidor estiver offline, o APK verifica `/health` a cada 3 segundos e também tenta imediatamente ao tocar ou voltar ao aplicativo
- **Ação pendente**: Uma única ação feita offline fica aguardando em memória e é revalidada antes da execução automática quando o servidor retornar
