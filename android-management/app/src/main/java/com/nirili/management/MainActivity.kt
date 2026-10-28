package com.nirili.management

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

private const val API_BASE = "https://nirili-villa.nirili-management.workers.dev"
private val modules = listOf(
    "Dashboard", "Room Bookings", "Guest Management", "Excursion Schedules",
    "Restaurant POS", "Airport Transfers", "Bills & Payments", "Reports", "Notifications"
)

class MainActivity : ComponentActivity() {
    private fun login(username: String, password: String, finished: (String?, String, String) -> Unit) {
        Thread {
            var connection: HttpURLConnection? = null
            try {
                connection = (URL("$API_BASE/api/mobile/v1/auth/login").openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 10000
                    readTimeout = 10000
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("Accept", "application/json")
                }
                val payload = JSONObject().put("username", username).put("password", password).toString()
                connection.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
                val response = connection.responseCode
                val stream = if (response in 200..299) connection.inputStream else connection.errorStream
                val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
                val json = runCatching { JSONObject(text) }.getOrDefault(JSONObject())
                if (response in 200..299) {
                    val user = json.optJSONObject("user")
                    val token = json.optString("access_token")
                    if (token.isNotBlank() && user != null) {
                        runOnUiThread { finished(token, user.optString("displayName", username), "") }
                    } else {
                        runOnUiThread { finished(null, "", "Unexpected login response") }
                    }
                } else {
                    val message = json.optString("error", "Sign in failed ($response)")
                    runOnUiThread { finished(null, "", message) }
                }
            } catch (_: Exception) {
                runOnUiThread { finished(null, "", "Connection unavailable. Please try again.") }
            } finally {
                connection?.disconnect()
            }
        }.start()
    }

    private fun logout(token: String, finished: () -> Unit) {
        Thread {
            var connection: HttpURLConnection? = null
            try {
                connection = (URL("$API_BASE/api/mobile/v1/auth/logout").openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 10000
                    readTimeout = 10000
                    setRequestProperty("Authorization", "Bearer $token")
                }
                connection.responseCode
            } catch (_: Exception) { } finally {
                connection?.disconnect()
                runOnUiThread(finished)
            }
        }.start()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                var username by remember { mutableStateOf("") }
                var password by remember { mutableStateOf("") }
                var token by remember { mutableStateOf<String?>(null) }
                var displayName by remember { mutableStateOf("") }
                var busy by remember { mutableStateOf(false) }
                var error by remember { mutableStateOf("") }
                var preview by remember { mutableStateOf(false) }
                var selected by remember { mutableStateOf("Dashboard") }

                Scaffold(topBar = {
                    Surface(shadowElevation = 2.dp) {
                        Text("Nirili Villa Management", style = MaterialTheme.typography.titleLarge,
                            modifier = Modifier.padding(20.dp))
                    }
                }) { padding ->
                    Column(
                        Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())
                            .padding(20.dp)
                    ) {
                        if (token == null && !preview) {
                            Text("Staff sign in", style = MaterialTheme.typography.headlineMedium)
                            Spacer(Modifier.height(12.dp))
                            OutlinedTextField(value = username, onValueChange = { username = it },
                                label = { Text("Username or email") }, singleLine = true,
                                modifier = Modifier.fillMaxWidth())
                            Spacer(Modifier.height(12.dp))
                            OutlinedTextField(value = password, onValueChange = { password = it },
                                label = { Text("Password") }, visualTransformation = PasswordVisualTransformation(),
                                singleLine = true, modifier = Modifier.fillMaxWidth())
                            Spacer(Modifier.height(12.dp))
                            Button(
                                onClick = {
                                    busy = true
                                    error = ""
                                    login(username, password) { result, name, message ->
                                        busy = false
                                        password = ""
                                        token = result
                                        displayName = name
                                        error = message
                                    }
                                },
                                enabled = !busy && username.isNotBlank() && password.isNotBlank(),
                                modifier = Modifier.fillMaxWidth()
                            ) { Text(if (busy) "Signing in..." else "Sign in") }
                            if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error)
                            Text("Mobile login requires the development API to be enabled by the server administrator.")
                            TextButton(onClick = { preview = true }) { Text("Explore preview without hotel data") }
                        } else {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(if (preview) "Preview" else displayName, style = MaterialTheme.typography.titleLarge)
                                TextButton(onClick = {
                                    val current = token
                                    token = null
                                    preview = false
                                    password = ""
                                    if (current != null) logout(current) {}
                                }) { Text(if (preview) "Exit preview" else "Sign out") }
                            }
                            Spacer(Modifier.height(8.dp))
                            Text("Live management modules are not yet connected. No booking or payment actions are available.")
                            Spacer(Modifier.height(16.dp))
                            Text(selected, style = MaterialTheme.typography.headlineSmall)
                            modules.forEach { module ->
                                OutlinedButton(onClick = { selected = module }, modifier = Modifier.fillMaxWidth()) {
                                    Text(module)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
