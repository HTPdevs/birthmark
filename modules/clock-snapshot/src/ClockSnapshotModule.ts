import { NativeModule, requireOptionalNativeModule } from 'expo';

export type NativeClockSnapshot = {
  wallEpochMs: number;
  continuousMs: number;
  timezoneId: string;
  utcOffsetMinutes: number;
  bootId: string | null;
  quality: 'native';
};

declare class ClockSnapshotModule extends NativeModule<{}> {
  read(): NativeClockSnapshot;
  excludeFromBackup(path: string): boolean;
}

// Optional so Expo Go, web, and tests load the JS fallback instead of crashing.
export default requireOptionalNativeModule<ClockSnapshotModule>('ClockSnapshot');
