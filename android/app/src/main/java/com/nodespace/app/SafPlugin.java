package com.nodespace.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.net.Uri;
import android.provider.DocumentsContract;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

@CapacitorPlugin(name = "SafPlugin")
public class SafPlugin extends Plugin {

    private Uri currentTreeUri;
    private String currentFolderName = "";
    private static final String PREFS_NAME = "saf_prefs";
    private static final String KEY_URI = "tree_uri";
    private static final String KEY_NAME = "folder_name";

    private void loadSavedUri() {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String uriStr = prefs.getString(KEY_URI, null);
        String name = prefs.getString(KEY_NAME, "");
        if (uriStr != null) {
            Uri uri = Uri.parse(uriStr);
            List<UriPermission> perms = getContext().getContentResolver().getPersistedUriPermissions();
            for (UriPermission p : perms) {
                if (p.getUri().equals(uri)) {
                    currentTreeUri = uri;
                    currentFolderName = name;
                    return;
                }
            }
        }
    }

    private void saveUri(Uri uri, String name) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
            .putString(KEY_URI, uri.toString())
            .putString(KEY_NAME, name)
            .apply();
        currentTreeUri = uri;
        currentFolderName = name;
    }

    private String extractFolderName(Uri treeUri) {
        String docId = DocumentsContract.getTreeDocumentId(treeUri);
        int colon = docId.indexOf(':');
        if (colon >= 0) {
            String path = docId.substring(colon + 1);
            int lastSlash = path.lastIndexOf('/');
            return lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
        }
        return docId;
    }

    private DocumentFile getRootDir() {
        if (currentTreeUri == null) return null;
        return DocumentFile.fromTreeUri(getContext(), currentTreeUri);
    }

    /** Open SAF directory picker */
    @PluginMethod
    public void pickDirectory(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        startActivityForResult(call, intent, "pickDirectoryResult");
    }

    @ActivityCallback
    private void pickDirectoryResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() == android.app.Activity.RESULT_OK && result.getData() != null) {
            Uri treeUri = result.getData().getData();
            if (treeUri == null) {
                call.reject("No directory selected");
                return;
            }
            // Persist permission
            int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
            try {
                getContext().getContentResolver().takePersistableUriPermission(treeUri, flags);
            } catch (Exception e) {
                call.reject("Permission persist failed: " + e.getMessage());
                return;
            }
            String name = extractFolderName(treeUri);
            saveUri(treeUri, name);
            JSObject res = new JSObject();
            res.put("path", treeUri.toString());
            res.put("name", name);
            call.resolve(res);
        } else {
            call.reject("Directory picker cancelled");
        }
    }

    /** Restore previously-picked directory */
    @PluginMethod
    public void restoreDirectory(PluginCall call) {
        loadSavedUri();
        if (currentTreeUri != null) {
            JSObject res = new JSObject();
            res.put("path", currentTreeUri.toString());
            res.put("name", currentFolderName);
            call.resolve(res);
        } else {
            call.reject("No saved directory");
        }
    }

    /** List .json files in the selected directory */
    @PluginMethod
    public void listFiles(PluginCall call) {
        DocumentFile dir = getRootDir();
        if (dir == null) {
            call.reject("No directory selected");
            return;
        }
        JSArray files = new JSArray();
        for (DocumentFile f : dir.listFiles()) {
            if (f.isFile()) {
                String name = f.getName();
                if (name != null && name.endsWith(".json")) {
                    JSObject entry = new JSObject();
                    entry.put("name", name);
                    entry.put("kind", "file");
                    entry.put("children", new JSArray());
                    files.put(entry);
                }
            }
        }
        JSObject res = new JSObject();
        res.put("files", files);
        call.resolve(res);
    }

    /** Read a file from the selected directory */
    @PluginMethod
    public void readFile(PluginCall call) {
        String fileName = call.getString("fileName");
        if (fileName == null) {
            call.reject("fileName is required");
            return;
        }
        DocumentFile dir = getRootDir();
        if (dir == null) {
            call.reject("No directory selected");
            return;
        }
        DocumentFile file = dir.findFile(fileName);
        if (file == null || !file.isFile()) {
            call.reject("File not found: " + fileName);
            return;
        }
        try (InputStream is = getContext().getContentResolver().openInputStream(file.getUri());
             BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append('\n');
            }
            JSObject res = new JSObject();
            res.put("data", sb.toString());
            call.resolve(res);
        } catch (Exception e) {
            call.reject("Read failed: " + e.getMessage());
        }
    }

    /** Write a file to the selected directory */
    @PluginMethod
    public void writeFile(PluginCall call) {
        String fileName = call.getString("fileName");
        String data = call.getString("data");
        if (fileName == null || data == null) {
            call.reject("fileName and data are required");
            return;
        }
        DocumentFile dir = getRootDir();
        if (dir == null) {
            call.reject("No directory selected");
            return;
        }
        DocumentFile existing = dir.findFile(fileName);
        if (existing != null && existing.isFile()) {
            existing.delete();
        }
        try {
            DocumentFile newFile = dir.createFile("application/json", fileName);
            if (newFile == null) {
                call.reject("Failed to create file");
                return;
            }
            try (OutputStream os = getContext().getContentResolver().openOutputStream(newFile.getUri())) {
                if (os == null) {
                    call.reject("Failed to open file for writing");
                    return;
                }
                os.write(data.getBytes(StandardCharsets.UTF_8));
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Write failed: " + e.getMessage());
        }
    }

    /** Delete a file from the selected directory */
    @PluginMethod
    public void deleteFile(PluginCall call) {
        String fileName = call.getString("fileName");
        if (fileName == null) {
            call.reject("fileName is required");
            return;
        }
        DocumentFile dir = getRootDir();
        if (dir == null) {
            call.reject("No directory selected");
            return;
        }
        DocumentFile file = dir.findFile(fileName);
        if (file != null && file.isFile() && file.delete()) {
            call.resolve();
        } else {
            call.reject("Delete failed");
        }
    }
}
