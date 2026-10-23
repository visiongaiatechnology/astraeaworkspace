import { describe, expect, it } from 'vitest';
import { createWhiteboardSecureGuestLink, WHITEBOARD_GUEST_PROVIDER_UNAVAILABLE } from '../../integrations/whiteboardGuestLink';

describe('Whiteboard guest-link provider boundary', () => {
  it('never mints a client-side URL or capability without an authenticated provider', () => {
    expect(() => createWhiteboardSecureGuestLink()).toThrow(WHITEBOARD_GUEST_PROVIDER_UNAVAILABLE);
  });
});
