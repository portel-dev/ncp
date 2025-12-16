/**
 * Windows Runtime Resolution Tests
 * 
 * Tests that verify runtime command resolution on Windows
 */

import { getRuntimeForExtension } from '../src/utils/runtime-detector.js';

describe('Windows Runtime Resolution', () => {
  const originalPlatform = process.platform;

  afterAll(() => {
    // Restore original platform
    Object.defineProperty(process, 'platform', {
      value: originalPlatform
    });
  });

  describe('on Windows', () => {
    beforeEach(() => {
      // Mock Windows platform
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true
      });
    });

    it('should resolve npx command', () => {
      const resolved = getRuntimeForExtension('npx');
      
      // Should resolve to either npx.cmd, npx.exe, or a full path
      expect(resolved).toBeTruthy();
      expect(typeof resolved).toBe('string');
      
      // Should not return the original 'npx' if resolution worked
      // (unless npx is already in PATH as-is, which is rare on Windows)
      if (resolved !== 'npx') {
        expect(resolved.toLowerCase()).toMatch(/npx/);
      }
    });

    it('should resolve node command', () => {
      const resolved = getRuntimeForExtension('node');
      
      expect(resolved).toBeTruthy();
      expect(typeof resolved).toBe('string');
      
      // Should contain 'node'
      expect(resolved.toLowerCase()).toMatch(/node/);
    });

    it('should handle commands with extensions', () => {
      const resolved = getRuntimeForExtension('npx.cmd');
      
      expect(resolved).toBeTruthy();
      expect(typeof resolved).toBe('string');
    });

    it('should handle unknown commands gracefully', () => {
      const resolved = getRuntimeForExtension('nonexistent-command-xyz');
      
      // Should return the original command if not found
      expect(resolved).toBe('nonexistent-command-xyz');
    });

    it('should handle python/python3', () => {
      const resolved = getRuntimeForExtension('python');
      
      expect(resolved).toBeTruthy();
      expect(typeof resolved).toBe('string');
    });
  });

  describe('on non-Windows', () => {
    beforeEach(() => {
      // Mock Unix platform
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true
      });
    });

    it('should return npx as-is on Unix', () => {
      const resolved = getRuntimeForExtension('npx');
      
      // On Unix, npx doesn't need special resolution
      expect(resolved).toMatch(/npx/);
    });

    it('should return node as-is or resolved path on Unix', () => {
      const resolved = getRuntimeForExtension('node');
      
      expect(resolved).toBeTruthy();
      expect(resolved.toLowerCase()).toMatch(/node/);
    });
  });
});
