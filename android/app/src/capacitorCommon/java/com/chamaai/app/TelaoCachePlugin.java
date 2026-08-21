package com.chamaai.app;

import android.net.Uri;
import android.webkit.WebView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "TelaoCache")
public class TelaoCachePlugin extends Plugin {
    private static final String CACHE_DIRECTORY = "telao-assets";
    private static final long MIN_FREE_BYTES = 512L * 1024L * 1024L;
    private static final int CONNECT_TIMEOUT_MILLIS = 15_000;
    private static final int READ_TIMEOUT_MILLIS = 60_000;
    private static final int BUFFER_SIZE = 64 * 1024;

    private final ExecutorService ioExecutor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void clearLegacy(PluginCall call) {
        ioExecutor.execute(() -> {
            try {
                deleteRecursively(cacheRoot());
                if (!cacheRoot().mkdirs() && !cacheRoot().isDirectory()) {
                    throw new IOException("Não foi possível criar o diretório de cache.");
                }

                getActivity().runOnUiThread(() -> {
                    WebView webView = getBridge() == null ? null : getBridge().getWebView();
                    if (webView != null) {
                        webView.clearCache(true);
                    }
                    call.resolve();
                });
            } catch (Exception error) {
                call.reject("Falha ao limpar o cache legado: " + safeMessage(error), error);
            }
        });
    }

    @PluginMethod
    public void sync(PluginCall call) {
        String baseUrl = call.getString("baseUrl");
        JSObject manifest = call.getObject("manifest");
        if (baseUrl == null || baseUrl.trim().isEmpty() || manifest == null) {
            call.reject("baseUrl e manifest são obrigatórios.");
            return;
        }

        ioExecutor.execute(() -> {
            try {
                call.resolve(syncInternal(baseUrl, manifest));
            } catch (Exception error) {
                call.reject("Falha ao sincronizar assets: " + safeMessage(error), error);
            }
        });
    }

    @PluginMethod
    public void evict(PluginCall call) {
        String sha256 = call.getString("sha256");
        if (sha256 == null || !sha256.toLowerCase(Locale.ROOT).matches("[0-9a-f]{64}")) {
            call.reject("sha256 inválido.");
            return;
        }

        String normalizedHash = sha256.toLowerCase(Locale.ROOT);
        ioExecutor.execute(() -> {
            try {
                File[] files = cacheRoot().listFiles();
                if (files != null) {
                    for (File file : files) {
                        if (file.getName().startsWith(normalizedHash)) {
                            deleteRecursively(file);
                        }
                    }
                }
                call.resolve();
            } catch (Exception error) {
                call.reject("Falha ao remover asset do cache: " + safeMessage(error), error);
            }
        });
    }

    private JSObject syncInternal(String baseUrl, JSObject manifest) throws Exception {
        long maxCacheBytes = manifest.optLong("maxCacheBytes", -1L);
        JSONArray rawAssets = manifest.optJSONArray("assets");
        if (maxCacheBytes < 0L || rawAssets == null) {
            throw new IllegalArgumentException("Manifesto inválido: maxCacheBytes e assets são obrigatórios.");
        }

        File root = cacheRoot();
        if (!root.mkdirs() && !root.isDirectory()) {
            throw new IOException("Não foi possível criar o diretório de cache.");
        }
        removePartialDownloads(root);

        List<Asset> assets = parseAssets(rawAssets);
        assets.sort(Comparator.comparingInt((Asset asset) -> asset.priority).reversed());

        JSObject resolved = new JSObject();
        JSONArray errors = new JSONArray();
        Set<String> desiredFiles = new HashSet<>();
        Set<String> accountedFiles = new HashSet<>();
        long reservedBytes = 0L;
        int streamedWithoutCache = 0;

        for (Asset asset : assets) {
            String remoteUrl;
            try {
                remoteUrl = versionedUrl(baseUrl, asset.url, asset.version);
            } catch (Exception error) {
                errors.put(asset.id + ": URL inválida (" + safeMessage(error) + ")");
                streamedWithoutCache++;
                continue;
            }
            resolved.put(asset.url, remoteUrl);

            String fileName = cacheFileName(asset);
            long additionalBytes = accountedFiles.contains(fileName) ? 0L : asset.sizeBytes;
            if (asset.sizeBytes < 0L || asset.sizeBytes > maxCacheBytes
                || reservedBytes > maxCacheBytes - additionalBytes) {
                streamedWithoutCache++;
                continue;
            }

            File destination = new File(root, fileName);
            desiredFiles.add(fileName);
            accountedFiles.add(fileName);
            reservedBytes += additionalBytes;

            try {
                if (!isValid(destination, asset.sizeBytes, asset.sha256)) {
                    deleteIfExists(destination);
                    if (root.getUsableSpace() < MIN_FREE_BYTES + asset.sizeBytes) {
                        streamedWithoutCache++;
                        errors.put(asset.id + ": download ignorado; menos de 512 MiB livres");
                        continue;
                    }
                    downloadVerified(remoteUrl, destination, asset.sizeBytes, asset.sha256);
                }
                resolved.put(asset.url, Uri.fromFile(destination).toString());
            } catch (Exception error) {
                deleteIfExists(destination);
                streamedWithoutCache++;
                errors.put(asset.id + ": " + safeMessage(error));
            }
        }

        deleteStaleFiles(root, desiredFiles);
        CacheStats stats = calculateStats(root);

        JSObject result = new JSObject();
        result.put("resolved", resolved);
        result.put("usedBytes", stats.bytes);
        result.put("maxBytes", maxCacheBytes);
        result.put("entries", stats.entries);
        result.put("streamedWithoutCache", streamedWithoutCache);
        result.put("errors", errors);
        result.put("lastSync", Instant.now().toString());
        return result;
    }

    private List<Asset> parseAssets(JSONArray rawAssets) {
        List<Asset> assets = new ArrayList<>();
        for (int index = 0; index < rawAssets.length(); index++) {
            JSONObject raw = rawAssets.optJSONObject(index);
            if (raw == null) {
                continue;
            }
            String id = raw.optString("id", "asset-" + index);
            String url = raw.optString("url", "");
            String version = raw.optString("version", "");
            String sha256 = raw.optString("sha256", "").toLowerCase(Locale.ROOT);
            long sizeBytes = raw.optLong("sizeBytes", -1L);
            int priority = raw.optInt("priority", 0);
            if (url.trim().isEmpty() || version.trim().isEmpty() || !sha256.matches("[0-9a-f]{64}") || sizeBytes < 0L) {
                continue;
            }
            assets.add(new Asset(id, url, version, sizeBytes, sha256, priority));
        }
        return assets;
    }

    private void downloadVerified(String remoteUrl, File destination, long expectedSize, String expectedHash)
        throws Exception {
        File partial = new File(destination.getParentFile(), destination.getName() + ".part");
        deleteIfExists(partial);

        HttpURLConnection connection = (HttpURLConnection) new URL(remoteUrl).openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MILLIS);
        connection.setReadTimeout(READ_TIMEOUT_MILLIS);
        connection.setUseCaches(false);
        connection.setRequestProperty("Cache-Control", "no-cache, no-store");
        connection.setInstanceFollowRedirects(true);

        try {
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new IOException("HTTP " + status);
            }
            long declaredLength = connection.getContentLengthLong();
            if (declaredLength >= 0L && declaredLength != expectedSize) {
                throw new IOException("tamanho HTTP divergente");
            }

            MessageDigest digest = sha256Digest();
            long written = 0L;
            try (
                InputStream input = new BufferedInputStream(connection.getInputStream());
                FileOutputStream output = new FileOutputStream(partial)
            ) {
                byte[] buffer = new byte[BUFFER_SIZE];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    written += count;
                    if (written > expectedSize) {
                        throw new IOException("download excedeu o tamanho esperado");
                    }
                    digest.update(buffer, 0, count);
                    output.write(buffer, 0, count);
                }
                output.getFD().sync();
            }

            if (written != expectedSize) {
                throw new IOException("tamanho divergente: esperado " + expectedSize + ", recebido " + written);
            }
            String actualHash = hex(digest.digest());
            if (!actualHash.equals(expectedHash)) {
                throw new IOException("SHA-256 divergente");
            }
            atomicReplace(partial, destination);
        } finally {
            connection.disconnect();
            if (partial.exists()) {
                deleteIfExists(partial);
            }
        }
    }

    private boolean isValid(File file, long expectedSize, String expectedHash) throws Exception {
        if (!file.isFile() || file.length() != expectedSize) {
            return false;
        }
        MessageDigest digest = sha256Digest();
        try (InputStream input = new BufferedInputStream(new FileInputStream(file))) {
            byte[] buffer = new byte[BUFFER_SIZE];
            int count;
            while ((count = input.read(buffer)) != -1) {
                digest.update(buffer, 0, count);
            }
        }
        return hex(digest.digest()).equals(expectedHash);
    }

    private static String versionedUrl(String baseUrl, String assetUrl, String version)
        throws URISyntaxException {
        String normalizedBase = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
        URI resolved = new URI(normalizedBase).resolve(assetUrl);
        return Uri.parse(resolved.toASCIIString())
            .buildUpon()
            .appendQueryParameter("asset_v", version)
            .build()
            .toString();
    }

    private static String cacheFileName(Asset asset) {
        String extension = "";
        try {
            String path = new URI(asset.url).getPath();
            int slash = path.lastIndexOf('/');
            int dot = path.lastIndexOf('.');
            if (dot > slash && path.length() - dot <= 11) {
                String candidate = path.substring(dot).toLowerCase(Locale.ROOT);
                if (candidate.matches("\\.[a-z0-9]{1,10}")) {
                    extension = candidate;
                }
            }
        } catch (Exception ignored) {
            // The content hash remains a safe, unique filename even without an extension.
        }
        return asset.sha256 + extension;
    }

    private static void atomicReplace(File source, File destination) throws IOException {
        try {
            Files.move(
                source.toPath(),
                destination.toPath(),
                StandardCopyOption.ATOMIC_MOVE,
                StandardCopyOption.REPLACE_EXISTING
            );
        } catch (AtomicMoveNotSupportedException unsupported) {
            Files.move(source.toPath(), destination.toPath(), StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private static void deleteStaleFiles(File root, Set<String> desiredFiles) throws IOException {
        File[] files = root.listFiles();
        if (files == null) {
            return;
        }
        for (File file : files) {
            if (file.isDirectory() || file.getName().endsWith(".part") || !desiredFiles.contains(file.getName())) {
                deleteRecursively(file);
            }
        }
    }

    private static void removePartialDownloads(File root) throws IOException {
        File[] files = root.listFiles();
        if (files == null) {
            return;
        }
        for (File file : files) {
            if (file.getName().endsWith(".part")) {
                deleteRecursively(file);
            }
        }
    }

    private static CacheStats calculateStats(File root) {
        long bytes = 0L;
        int entries = 0;
        File[] files = root.listFiles();
        if (files != null) {
            for (File file : files) {
                if (file.isFile() && !file.getName().endsWith(".part")) {
                    bytes += file.length();
                    entries++;
                }
            }
        }
        return new CacheStats(bytes, entries);
    }

    private File cacheRoot() {
        return new File(getContext().getCacheDir(), CACHE_DIRECTORY);
    }

    private static MessageDigest sha256Digest() throws NoSuchAlgorithmException {
        return MessageDigest.getInstance("SHA-256");
    }

    private static String hex(byte[] bytes) {
        StringBuilder value = new StringBuilder(bytes.length * 2);
        for (byte item : bytes) {
            value.append(String.format(Locale.ROOT, "%02x", item & 0xff));
        }
        return value.toString();
    }

    private static void deleteIfExists(File file) throws IOException {
        if (file.exists() && !file.delete()) {
            throw new IOException("Não foi possível excluir " + file.getName());
        }
    }

    private static void deleteRecursively(File file) throws IOException {
        if (!file.exists()) {
            return;
        }
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursively(child);
                }
            }
        }
        deleteIfExists(file);
    }

    private static String safeMessage(Throwable error) {
        String message = error.getMessage();
        return message == null || message.trim().isEmpty() ? error.getClass().getSimpleName() : message;
    }

    @Override
    protected void handleOnDestroy() {
        ioExecutor.shutdownNow();
        super.handleOnDestroy();
    }

    private static final class Asset {
        final String id;
        final String url;
        final String version;
        final long sizeBytes;
        final String sha256;
        final int priority;

        Asset(String id, String url, String version, long sizeBytes, String sha256, int priority) {
            this.id = id;
            this.url = url;
            this.version = version;
            this.sizeBytes = sizeBytes;
            this.sha256 = sha256;
            this.priority = priority;
        }
    }

    private static final class CacheStats {
        final long bytes;
        final int entries;

        CacheStats(long bytes, int entries) {
            this.bytes = bytes;
            this.entries = entries;
        }
    }
}
