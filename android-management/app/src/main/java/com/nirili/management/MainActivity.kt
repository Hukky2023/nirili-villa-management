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
import androidx.compose.ui.unit.dp

private val modules = listOf("Dashboard", "Room Bookings", "Guest Management", "Excursion Schedules", "Restaurant POS", "Airport Transfers", "Bills & Payments", "Reports", "Notifications")

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                var selected by remember { mutableStateOf("Dashboard") }
                Scaffold(topBar = { Surface(shadowElevation = 2.dp) {
                    Text("Nirili Villa Management", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(20.dp))
                } }) { padding ->
                    Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp)) {
                        Text(selected, style = MaterialTheme.typography.headlineSmall)
                        Spacer(Modifier.height(12.dp))
                        Text("Native development preview. Live hotel data and actions remain disabled until secure mobile authentication and API integration are verified.")
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
