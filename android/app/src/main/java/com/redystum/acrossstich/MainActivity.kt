package com.redystum.acrossstich

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.redystum.acrossstich.ui.theme.ACrossStichTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(
                android.graphics.Color.TRANSPARENT
            ),
            navigationBarStyle = SystemBarStyle.dark(
                android.graphics.Color.TRANSPARENT
            )
        )

        setContent {
            ACrossStichTheme {
                AcrossStitchApp()
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun AcrossStitchApp() {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("across_stitch_prefs", Context.MODE_PRIVATE) }

    // Default to emulator localhost (10.0.2.2) or LAN IP
    var serverUrl by remember {
        mutableStateOf(
            prefs.getString("server_url", "http://10.0.2.2:3000") ?: "http://10.0.2.2:3000"
        )
    }

    var webViewInstance by remember { mutableStateOf<WebView?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var hasError by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf("") }
    var showUrlDialog by remember { mutableStateOf(false) }
    var tempUrlInput by remember { mutableStateOf(serverUrl) }

    // Handle Android system back button in WebView
    BackHandler(enabled = webViewInstance?.canGoBack() == true) {
        webViewInstance?.goBack()
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = Color(0xFF121214),
        topBar = {
            if (hasError) {
                TopAppBar(
                    title = {
                        Column {
                            Text(
                                text = "Across Stitch",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFFF4F4F5)
                            )
                            Text(
                                text = serverUrl,
                                fontSize = 11.sp,
                                fontFamily = FontFamily.Monospace,
                                color = Color(0xFFA1A1AA)
                            )
                        }
                    },
                    actions = {
                        // Settings / Server Address Button
                        TextButton(onClick = {
                            tempUrlInput = serverUrl
                            showUrlDialog = true
                        }) {
                            Text(
                                text = "Server",
                                color = Color(0xFFF4F4F5),
                                fontWeight = FontWeight.SemiBold
                            )
                        }

                        // Reload Button
                        TextButton(onClick = {
                            hasError = false
                            isLoading = true
                            webViewInstance?.loadUrl(serverUrl)
                        }) {
                            Text(
                                text = "Reload",
                                color = Color(0xFFF4F4F5)
                            )
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color(0xFF18181B)
                    )
                )
            }
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .background(Color(0xFF121214))
        ) {
            // Main Web View
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    WebView(ctx).apply {
                        layoutParams = ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                        )

                        settings.apply {
                            javaScriptEnabled = true
                            domStorageEnabled = true
                            databaseEnabled = true
                            useWideViewPort = true
                            loadWithOverviewMode = true
                            cacheMode = WebSettings.LOAD_DEFAULT
                            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                            setSupportZoom(true)
                            builtInZoomControls = false
                        }

                        webChromeClient = WebChromeClient()
                        webViewClient = object : WebViewClient() {
                            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                                super.onPageStarted(view, url, favicon)
                                isLoading = true
                                hasError = false
                            }

                            override fun onPageFinished(view: WebView?, url: String?) {
                                super.onPageFinished(view, url)
                                isLoading = false
                            }

                            override fun onReceivedError(
                                view: WebView?,
                                request: WebResourceRequest?,
                                error: WebResourceError?
                            ) {
                                super.onReceivedError(view, request, error)
                                if (request?.isForMainFrame == true) {
                                    hasError = true
                                    isLoading = false
                                    errorMessage = error?.description?.toString() ?: "Cannot connect to server"
                                }
                            }
                        }

                        loadUrl(serverUrl)
                        webViewInstance = this
                    }
                },
                update = { webView ->
                    webViewInstance = webView
                }
            )

            // Loading Overlay
            if (isLoading && !hasError) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color(0x99121214)),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(
                        color = Color(0xFFF4F4F5),
                        modifier = Modifier.size(44.dp)
                    )
                }
            }

            // Connection Error State
            if (hasError) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color(0xFF18181B))
                        .padding(24.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "Unable to Connect to Server",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFF4F4F5)
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = "Current URL: $serverUrl",
                        fontSize = 13.sp,
                        fontFamily = FontFamily.Monospace,
                        color = Color(0xFFA1A1AA)
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        text = "Ensure the Bun server is running on your computer:\n\n1. Run: bun run server.ts\n2. For Android Emulator, use: http://10.0.2.2:3000\n3. For Physical Phone, use: http://<your-pc-ip>:3000",
                        fontSize = 13.sp,
                        color = Color(0xFFD4D4D8)
                    )

                    Spacer(modifier = Modifier.height(24.dp))

                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Button(
                            onClick = {
                                tempUrlInput = serverUrl
                                showUrlDialog = true
                            },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color(0xFF27272A)
                            )
                        ) {
                            Text("Change Server URL", color = Color(0xFFF4F4F5))
                        }

                        Button(
                            onClick = {
                                hasError = false
                                isLoading = true
                                webViewInstance?.loadUrl(serverUrl)
                            },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color(0xFF3F3F46)
                            )
                        ) {
                            Text("Retry", color = Color(0xFFFFFFFF))
                        }
                    }
                }
            }
        }
    }

    // Server URL Dialog
    if (showUrlDialog) {
        AlertDialog(
            onDismissRequest = { showUrlDialog = false },
            title = {
                Text(
                    text = "Configure Server URL",
                    fontWeight = FontWeight.Bold
                )
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "Enter the server address for Across Stitch:",
                        fontSize = 13.sp,
                        color = Color(0xFF64748B)
                    )
                    OutlinedTextField(
                        value = tempUrlInput,
                        onValueChange = { tempUrlInput = it },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Text(
                        text = "Emulator default: http://10.0.2.2:3000\nWi-Fi Phone: http://<PC-LAN-IP>:3000",
                        fontSize = 11.sp,
                        color = Color(0xFF94A3B8)
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val trimmed = tempUrlInput.trim()
                        if (trimmed.isNotEmpty()) {
                            serverUrl = trimmed
                            prefs.edit().putString("server_url", trimmed).apply()
                            hasError = false
                            isLoading = true
                            webViewInstance?.loadUrl(trimmed)
                        }
                        showUrlDialog = false
                    }
                ) {
                    Text("Connect")
                }
            },
            dismissButton = {
                TextButton(onClick = { showUrlDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}