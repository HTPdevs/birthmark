package expo.modules.clocksnapshot

import android.os.SystemClock
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.TimeZone

// Reads the device wall clock and elapsedRealtime, which keeps counting while the
// device sleeps. Kept synchronous because it runs at the very start of every
// capture press handler.
class ClockSnapshotModule : Module() {
  // Settings.Global.BOOT_COUNT increments on every boot (API 24+), so it identifies
  // whether persisted elapsedRealtime anchors are comparable after a relaunch.
  private val bootId: String? by lazy {
    try {
      val resolver = appContext.reactContext?.contentResolver ?: return@lazy null
      "android-boot-" + Settings.Global.getInt(resolver, Settings.Global.BOOT_COUNT)
    } catch (e: Exception) {
      null
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ClockSnapshot")

    Function("read") {
      val continuousMs = SystemClock.elapsedRealtimeNanos() / 1_000_000L
      val wallMs = System.currentTimeMillis()
      val tz = TimeZone.getDefault()
      mapOf(
        "wallEpochMs" to wallMs.toDouble(),
        "continuousMs" to continuousMs.toDouble(),
        "timezoneId" to tz.id,
        "utcOffsetMinutes" to tz.getOffset(wallMs) / 60_000,
        "bootId" to bootId,
        "quality" to "native"
      )
    }

    // Android backups are disabled app-wide via android:allowBackup="false".
    Function("excludeFromBackup") { _: String ->
      true
    }
  }
}
