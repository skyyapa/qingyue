package io.github.skyyapa.qingyue;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * content URI 真实文件信息插件。
 * 文件管理器「用轻阅打开」的 URI 可能是 opaque id（content://12345），
 * Filesystem 拿不到文件名与 MIME——这里走 ContentResolver 查
 * OpenableColumns.DISPLAY_NAME / MIME_TYPE 并读出内容（base64）。
 */
@CapacitorPlugin(name = "IntentFile")
public class IntentFilePlugin extends Plugin {
  private static final String EVENT_SHARE_FILE = "shareFile";
  private Uri pendingShareUri;

  @Override
  public void load() {
    super.load();
    pendingShareUri = extractShareUri(getActivity().getIntent());
  }

  @Override
  protected void handleOnNewIntent(Intent intent) {
    super.handleOnNewIntent(intent);
    Uri uri = extractShareUri(intent);
    if (uri == null) return;
    pendingShareUri = uri;
    JSObject event = new JSObject();
    event.put("uri", uri.toString());
    notifyListeners(EVENT_SHARE_FILE, event, true);
  }

  /** 冷启动分享：JS 初始化后主动读取；热启动分享：handleOnNewIntent 推事件。 */
  @PluginMethod
  public void getPendingShare(PluginCall call) {
    JSObject ret = new JSObject();
    ret.put("uri", pendingShareUri == null ? null : pendingShareUri.toString());
    pendingShareUri = null;
    call.resolve(ret);
  }

  private Uri extractShareUri(Intent intent) {
    if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return null;
    Object stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
    return stream instanceof Uri ? (Uri) stream : null;
  }

  @PluginMethod
  public void read(PluginCall call) {
    String uriStr = call.getString("uri");
    if (uriStr == null) {
      call.reject("uri required");
      return;
    }
    Uri uri = Uri.parse(uriStr);
    String name = null;
    String mime = getContext().getContentResolver().getType(uri);
    try (Cursor cursor = getContext().getContentResolver().query(uri, null, null, null, null)) {
      if (cursor != null && cursor.moveToFirst()) {
        int nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
        if (nameIdx >= 0) name = cursor.getString(nameIdx);
        if (mime == null) {
          int mimeIdx = cursor.getColumnIndex("mime_type");
          if (mimeIdx >= 0) mime = cursor.getString(mimeIdx);
        }
      }
    } catch (Exception ignored) {
      // DISPLAY_NAME 查不到不致命，JS 侧有 URI 尾段/扩展名兜底
    }
    try (InputStream in = getContext().getContentResolver().openInputStream(uri);
        ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      byte[] buf = new byte[8192];
      int n;
      while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
      JSObject ret = new JSObject();
      ret.put("name", name);
      ret.put("mime", mime);
      ret.put("data", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
      call.resolve(ret);
    } catch (Exception e) {
      call.reject("read failed: " + e.getMessage(), e);
    }
  }
}
