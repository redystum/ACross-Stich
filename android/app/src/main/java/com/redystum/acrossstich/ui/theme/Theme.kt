package com.redystum.acrossstich.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColorScheme = darkColorScheme(
    primary = Neutral100,
    secondary = Neutral400,
    tertiary = Neutral700,
    background = Neutral900,
    surface = Neutral800,
    onPrimary = Neutral900,
    onSecondary = Neutral900,
    onTertiary = Neutral100,
    onBackground = Neutral100,
    onSurface = Neutral100,
)

private val LightColorScheme = lightColorScheme(
    primary = Neutral800,
    secondary = Neutral700,
    tertiary = Neutral400,
    background = Color(0xFFF4F4F5),
    surface = NeutralWhite,
    onPrimary = NeutralWhite,
    onSecondary = NeutralWhite,
    onTertiary = NeutralWhite,
    onBackground = Neutral800,
    onSurface = Neutral800,
)

@Composable
fun ACrossStichTheme(
    darkTheme: Boolean = true, // Default to neutral dark aesthetic
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}