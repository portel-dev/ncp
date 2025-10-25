/**
 * Tests for OAuth Device Flow
 * Tests stdin cleanup and resource leak prevention
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { DeviceFlowAuthenticator } from '../src/auth/oauth-device-flow.js';
import type { DeviceAuthResponse, TokenResponse, OAuthConfig } from '../src/auth/oauth-device-flow.js';

// Mock fetch globally
global.fetch = jest.fn() as any;

// Mock logger to reduce noise
jest.mock('../src/utils/logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('OAuth Device Flow', () => {
  let authenticator: DeviceFlowAuthenticator;
  let mockConfig: OAuthConfig;
  let originalStdin: any;
  let mockStdin: any;

  beforeEach(() => {
    mockConfig = {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      deviceAuthUrl: 'https://oauth.example.com/device',
      tokenUrl: 'https://oauth.example.com/token',
      scopes: ['read', 'write']
    };

    authenticator = new DeviceFlowAuthenticator(mockConfig);

    // Mock stdin
    originalStdin = process.stdin;
    mockStdin = {
      isTTY: true,
      isRaw: false,
      setRawMode: jest.fn(),
      resume: jest.fn(),
      pause: jest.fn(),
      setEncoding: jest.fn(),
      on: jest.fn(),
      removeListener: jest.fn()
    };

    // Override process.stdin
    Object.defineProperty(process, 'stdin', {
      value: mockStdin,
      writable: true,
      configurable: true
    });

    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original stdin
    Object.defineProperty(process, 'stdin', {
      value: originalStdin,
      writable: true,
      configurable: true
    });
    jest.clearAllMocks();
  });

  describe('stdin resource cleanup', () => {
    it('should clean up stdin listeners on successful auth', async () => {
      const mockDeviceAuth: DeviceAuthResponse = {
        device_code: 'device_code_123',
        user_code: 'USER-CODE',
        verification_uri: 'https://example.com/device',
        expires_in: 600,
        interval: 5
      };

      const mockToken: TokenResponse = {
        access_token: 'access_token_123',
        refresh_token: 'refresh_token_123',
        expires_in: 3600,
        token_type: 'Bearer'
      };

      // Mock device code request
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockDeviceAuth)
        })
      );

      // Mock token polling - return pending once, then success
      (global.fetch as jest.Mock)
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ error: 'authorization_pending' })
          })
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockToken)
          })
        );

      const result = await authenticator.authenticate();

      expect(result).toEqual(mockToken);

      // Verify stdin cleanup happened
      expect(mockStdin.removeListener).toHaveBeenCalledWith('data', expect.any(Function));
      expect(mockStdin.setRawMode).toHaveBeenCalledWith(false);
      expect(mockStdin.pause).toHaveBeenCalled();
    }, 15000);

    it('should clean up stdin listeners on error', async () => {
      const mockDeviceAuth: DeviceAuthResponse = {
        device_code: 'device_code_123',
        user_code: 'USER-CODE',
        verification_uri: 'https://example.com/device',
        expires_in: 600,
        interval: 5
      };

      // Mock device code request
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockDeviceAuth)
        })
      );

      // Mock token polling - return access_denied error
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              error: 'access_denied',
              error_description: 'User denied authorization'
            })
        })
      );

      await expect(authenticator.authenticate()).rejects.toThrow('Authorization denied by user');

      // Verify stdin cleanup happened even on error
      expect(mockStdin.removeListener).toHaveBeenCalledWith('data', expect.any(Function));
      expect(mockStdin.setRawMode).toHaveBeenCalledWith(false);
      expect(mockStdin.pause).toHaveBeenCalled();
    }, 15000);

    it('should clean up stdin listeners on timeout', async () => {
      const mockDeviceAuth: DeviceAuthResponse = {
        device_code: 'device_code_123',
        user_code: 'USER-CODE',
        verification_uri: 'https://example.com/device',
        expires_in: 1, // 1 second timeout
        interval: 1
      };

      // Mock device code request
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockDeviceAuth)
        })
      );

      // Mock token polling - always return pending
      (global.fetch as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ error: 'authorization_pending' })
        })
      );

      await expect(authenticator.authenticate()).rejects.toThrow('Authentication timed out');

      // Verify stdin cleanup happened even on timeout
      expect(mockStdin.removeListener).toHaveBeenCalledWith('data', expect.any(Function));
      expect(mockStdin.setRawMode).toHaveBeenCalledWith(false);
      expect(mockStdin.pause).toHaveBeenCalled();
    }, 15000);

    it('should handle stdin setup errors gracefully', async () => {
      // Make setRawMode throw an error
      mockStdin.setRawMode.mockImplementation(() => {
        throw new Error('setRawMode failed');
      });

      const mockDeviceAuth: DeviceAuthResponse = {
        device_code: 'device_code_123',
        user_code: 'USER-CODE',
        verification_uri: 'https://example.com/device',
        expires_in: 600,
        interval: 5
      };

      // Mock device code request
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockDeviceAuth)
        })
      );

      // Should throw during stdin setup, but cleanup should still attempt
      await expect(authenticator.authenticate()).rejects.toThrow('setRawMode failed');

      // Listener should not be attached if setup failed
      // So removeListener should not be called
      expect(mockStdin.removeListener).not.toHaveBeenCalled();
    }, 15000);

    it('should not attempt stdin cleanup if not TTY', async () => {
      // Set isTTY to false
      mockStdin.isTTY = false;

      const mockDeviceAuth: DeviceAuthResponse = {
        device_code: 'device_code_123',
        user_code: 'USER-CODE',
        verification_uri: 'https://example.com/device',
        expires_in: 600,
        interval: 5
      };

      const mockToken: TokenResponse = {
        access_token: 'access_token_123',
        expires_in: 3600,
        token_type: 'Bearer'
      };

      // Mock device code request
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockDeviceAuth)
        })
      );

      // Mock immediate token success
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockToken)
        })
      );

      const result = await authenticator.authenticate();

      expect(result).toEqual(mockToken);

      // setRawMode should not be called for non-TTY
      expect(mockStdin.setRawMode).not.toHaveBeenCalled();

      // But listener should still be set up and cleaned up
      expect(mockStdin.on).toHaveBeenCalledWith('data', expect.any(Function));
      expect(mockStdin.removeListener).toHaveBeenCalledWith('data', expect.any(Function));
    }, 15000);

    it('should handle cleanup errors gracefully', async () => {
      const mockDeviceAuth: DeviceAuthResponse = {
        device_code: 'device_code_123',
        user_code: 'USER-CODE',
        verification_uri: 'https://example.com/device',
        expires_in: 600,
        interval: 5
      };

      const mockToken: TokenResponse = {
        access_token: 'access_token_123',
        expires_in: 3600,
        token_type: 'Bearer'
      };

      // Make cleanup throw an error
      mockStdin.setRawMode.mockImplementation((mode: boolean) => {
        if (mode === false) {
          throw new Error('Cleanup failed');
        }
      });

      // Mock device code request
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockDeviceAuth)
        })
      );

      // Mock immediate success
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockToken)
        })
      );

      // Should not throw even if cleanup fails
      const result = await authenticator.authenticate();
      expect(result).toEqual(mockToken);
    }, 15000);
  });

  describe('user cancellation', () => {
    it('should handle Ctrl+C cancellation', async () => {
      const mockDeviceAuth: DeviceAuthResponse = {
        device_code: 'device_code_123',
        user_code: 'USER-CODE',
        verification_uri: 'https://example.com/device',
        expires_in: 600,
        interval: 5
      };

      let onDataCallback: ((data: string) => void) | null = null;

      // Capture the data listener
      mockStdin.on.mockImplementation((event: string, callback: (data: string) => void) => {
        if (event === 'data') {
          onDataCallback = callback;
        }
      });

      // Mock device code request
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockDeviceAuth)
        })
      );

      // Mock token polling - return pending
      (global.fetch as jest.Mock).mockImplementation(() => {
        // Simulate Ctrl+C after first poll
        if (onDataCallback) {
          setTimeout(() => onDataCallback!('\u0003'), 100);
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ error: 'authorization_pending' })
        });
      });

      await expect(authenticator.authenticate()).rejects.toThrow('Authentication cancelled by user');

      // Verify cleanup happened
      expect(mockStdin.removeListener).toHaveBeenCalled();
    }, 15000);
  });

  describe('OAuth error handling', () => {
    it('should handle expired_token error', async () => {
      const mockDeviceAuth: DeviceAuthResponse = {
        device_code: 'device_code_123',
        user_code: 'USER-CODE',
        verification_uri: 'https://example.com/device',
        expires_in: 600,
        interval: 5
      };

      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockDeviceAuth)
        })
      );

      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              error: 'expired_token'
            })
        })
      );

      await expect(authenticator.authenticate()).rejects.toThrow('Authorization code expired');
    }, 15000);

    it('should handle slow_down error', async () => {
      const mockDeviceAuth: DeviceAuthResponse = {
        device_code: 'device_code_123',
        user_code: 'USER-CODE',
        verification_uri: 'https://example.com/device',
        expires_in: 600,
        interval: 5
      };

      const mockToken: TokenResponse = {
        access_token: 'access_token_123',
        expires_in: 3600,
        token_type: 'Bearer'
      };

      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockDeviceAuth)
        })
      );

      // Return slow_down, then success
      (global.fetch as jest.Mock)
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ error: 'slow_down' })
          })
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockToken)
          })
        );

      const result = await authenticator.authenticate();
      expect(result).toEqual(mockToken);
    }, 20000);
  });
});
