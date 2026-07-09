package com.nodespace.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("URL is required");
            return;
        }

        String fileName = call.getString("fileName", "update.apk");

        // 后台线程下载
        new Thread(() -> {
            try {
                // 下载到缓存目录（FileProvider 已配置 cache-path）
                File cacheDir = getContext().getCacheDir();
                File apkFile = new File(cacheDir, fileName);

                URL downloadUrl = new URL(url);
                HttpURLConnection conn = (HttpURLConnection) downloadUrl.openConnection();
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(30000);
                conn.setRequestProperty("Accept", "application/octet-stream");
                conn.connect();

                int fileSize = conn.getContentLength();

                try (InputStream in = new BufferedInputStream(conn.getInputStream());
                     FileOutputStream out = new FileOutputStream(apkFile)) {

                    byte[] buffer = new byte[8192];
                    int bytesRead;
                    long totalRead = 0;
                    long lastProgress = 0;

                    while ((bytesRead = in.read(buffer)) != -1) {
                        out.write(buffer, 0, bytesRead);
                        totalRead += bytesRead;

                        // 每秒通知一次进度（避免 IPC 过载）
                        long now = System.currentTimeMillis();
                        if (fileSize > 0 && now - lastProgress > 1000) {
                            final int pct = (int) (totalRead * 100 / fileSize);
                            final long readMB = totalRead / (1024 * 1024);
                            final long totalMB = fileSize / (1024 * 1024);
                            notifyProgress(call, pct, "下载中 " + readMB + "/" + totalMB + " MB");
                            lastProgress = now;
                        }
                    }
                } finally {
                    conn.disconnect();
                }

                // 下载完成 → 启动安装
                installApk(apkFile, call);

            } catch (Exception e) {
                notifyError(call, "下载失败: " + e.getMessage());
            }
        }).start();
    }

    private void installApk(File apkFile, PluginCall call) {
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW);

                Uri apkUri;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    // Android 7.0+ 必须用 FileProvider
                    String authority = getContext().getPackageName() + ".fileprovider";
                    apkUri = FileProvider.getUriForFile(getContext(), authority, apkFile);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } else {
                    apkUri = Uri.fromFile(apkFile);
                }

                intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                getContext().startActivity(intent);

                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);

            } catch (Exception e) {
                notifyError(call, "安装失败: " + e.getMessage());
            }
        });
    }

    private void notifyProgress(PluginCall call, int progress, String message) {
        new Handler(Looper.getMainLooper()).post(() -> {
            JSObject data = new JSObject();
            data.put("progress", progress);
            data.put("message", message);
            notifyListeners("downloadProgress", data);
        });
    }

    private void notifyError(PluginCall call, String message) {
        new Handler(Looper.getMainLooper()).post(() -> {
            call.reject(message);
        });
    }
}
