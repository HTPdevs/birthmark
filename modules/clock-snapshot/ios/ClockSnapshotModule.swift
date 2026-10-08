import Darwin
import ExpoModulesCore
import Foundation

// Reads the device wall clock and a monotonic clock that keeps counting while
// the device sleeps (mach_continuous_time). Kept synchronous and allocation-light
// because it runs at the very start of every capture press handler.
public class ClockSnapshotModule: Module {
  private static let timebase: mach_timebase_info_data_t = {
    var info = mach_timebase_info_data_t()
    mach_timebase_info(&info)
    return info
  }()

  // kern.boottime, read once per process. It identifies the current boot so a
  // relaunch can tell whether persisted continuous-clock anchors are comparable.
  // Wall-clock adjustments can shift it; a mismatch is treated as "cannot verify",
  // which falls back to the flagged recovery estimate rather than a silent error.
  private static let bootId: String? = {
    var boottime = timeval()
    var size = MemoryLayout<timeval>.stride
    var mib: [Int32] = [CTL_KERN, KERN_BOOTTIME]
    guard sysctl(&mib, 2, &boottime, &size, nil, 0) == 0, boottime.tv_sec > 0 else {
      return nil
    }
    return "ios-boot-\(boottime.tv_sec)"
  }()

  public func definition() -> ModuleDefinition {
    Name("ClockSnapshot")

    Function("read") { () -> [String: Any?] in
      let ticks = mach_continuous_time()
      let wallMs = (Date().timeIntervalSince1970 * 1000).rounded(.down)
      let tb = ClockSnapshotModule.timebase
      let nanos = Double(ticks) * Double(tb.numer) / Double(tb.denom)
      let tz = TimeZone.current
      return [
        "wallEpochMs": wallMs,
        "continuousMs": (nanos / 1_000_000).rounded(.down),
        "timezoneId": tz.identifier,
        "utcOffsetMinutes": tz.secondsFromGMT() / 60,
        "bootId": ClockSnapshotModule.bootId,
        "quality": "native",
      ]
    }

    // Marks a file or directory so iCloud/iTunes device backups skip it.
    Function("excludeFromBackup") { (path: String) -> Bool in
      let cleaned = path.hasPrefix("file://") ? String(path.dropFirst(7)) : path
      var url = URL(fileURLWithPath: cleaned.removingPercentEncoding ?? cleaned)
      guard FileManager.default.fileExists(atPath: url.path) else { return false }
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      do {
        try url.setResourceValues(values)
        return true
      } catch {
        return false
      }
    }
  }
}
