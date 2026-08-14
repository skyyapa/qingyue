package io.github.skyyapa.qingyue;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(android.os.Bundle savedInstanceState) {
    registerPlugin(IntentFilePlugin.class);
    super.onCreate(savedInstanceState);
  }
}
