import { readFileSync } from 'fs';
import { join } from 'path';

import type { QueueStatus } from '@/storage/writeQueue';
import { saveStatusView } from '@/ui/saveStatusView';
import { TOUCH } from '@/ui/theme';

describe('save status slot', () => {
  it('shows Not saved + Retry when a write failed', () => {
    expect(saveStatusView({ failed: true, pending: 1 })).toBe('failed');
  });

  it('a failed write wins over queued writes, so it is never hidden', () => {
    for (const pending of [0, 1, 2, 50]) {
      expect(saveStatusView({ failed: true, pending })).toBe('failed');
    }
  });

  it('shows Saving while any write is queued', () => {
    for (const pending of [1, 2, 50]) {
      expect(saveStatusView({ failed: false, pending })).toBe('saving');
    }
  });

  it('shows the History button only when the queue is empty and healthy', () => {
    expect(saveStatusView({ failed: false, pending: 0 })).toBe('history');
  });

  it('never frees the slot before every write has committed', () => {
    for (const failed of [true, false]) {
      for (const pending of [0, 1, 3]) {
        if (failed || pending > 0) expect(saveStatusView({ failed, pending })).not.toBe('history');
      }
    }
  });

  it('accepts the full QueueStatus the screens pass', () => {
    const idle: QueueStatus = { failed: false, pending: 0, lastError: null };
    const stuck: QueueStatus = { failed: true, pending: 1, lastError: 'disk full' };
    expect(saveStatusView(idle)).toBe('history');
    expect(saveStatusView(stuck)).toBe('failed');
  });
});

// Node env cannot render React Native, so these read the component source to
// pin the wiring the pure function above does not cover.
describe('SaveStatus component wiring', () => {
  const source = readFileSync(join(__dirname, '..', 'src', 'components', 'SaveStatus.tsx'), 'utf8');

  it('picks its state with saveStatusView', () => {
    expect(source).toMatch(/saveStatusView\(queue\)/);
  });

  it('History opens /history with the agreed accessibility copy', () => {
    expect(source).toContain(`router.push('/history')`);
    expect(source).toContain('label="History"');
    expect(source).toContain('accessibilityHint="Opens finished sessions"');
  });

  it('History uses the shared Button, so it is a full touch target', () => {
    // Button applies minHeight TOUCH and accessibilityRole="button".
    expect(TOUCH).toBeGreaterThanOrEqual(44);
    expect(source).toMatch(/<Button\s/);
  });

  it('no longer claims "All saved"', () => {
    expect(source).not.toContain('All saved');
  });
});
