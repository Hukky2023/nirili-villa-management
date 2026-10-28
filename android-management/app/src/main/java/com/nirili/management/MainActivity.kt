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

private val modules = listOf(
    "Dashboard", "Room Bookings", "Guest Management", "Excursion Schedules",
    "Restaurant POS", "Airport Transfers", "Bills & Payments", "Reports", "Notifications"
)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                var username by remember { mutableStateOf("") }
                var password by remember { mutableStateOf("") }
                var showPreview by remember { mutableStateOf(false) }
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
                        if (!showPreview) {
                            Text("Staff sign in", style = MaterialTheme.typography.headlineMedium)
                            Spacer(Modifier.height(8.dp))
                            Text("Native Android development preview. The production login API is not connected yet.")
                            Spacer(Modifier.height(20.dp))
                            OutlinedTextField(value = username, onValueChange = { username = it },
                                label = { Text("Username or email") }, singleLine = true,
                                modifier = Modifier.fillMaxWidth())
                            Spacer(Modifier.height(12.dp))
                            OutlinedTextField(value = password, onValueChange = { password = it },
                                label = { Text("Password") }, visualTransformation = PasswordVisualTransformation(),
                                singleLine = true, modifier = Modifier.fillMaxWidth())
                            Spacer(Modifier.height(12.dp))
                            Button(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) {
                                Text("Sign in (integration pending)")
                            }
                            TextButton(onClick = { showPreview = true }) { Text("Explore preview without hotel data") }
                        } else {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(selected, style = MaterialTheme.typography.headlineSmall)
                                TextButton(onClick = { showPreview = false; password = "" }) { Text("Exit preview") }
                            }
                            Spacer(Modifier.height(8.dp))
                            Text("Preview only — no live data or write permissions.")
                            Spacer(Modifier.height(16.dp))
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
