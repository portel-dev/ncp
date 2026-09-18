import { describe, expect, it, jest } from '@jest/globals';
import { PackageApprovalManager, type PackageElicitationFunction } from '../../src/code-mode/package-approval.js';

describe('PackageApprovalManager request-scoped input', () => {
  it('fails closed when MCP input is cancelled', async () => {
    const manager = new PackageApprovalManager();
    const requestInput = jest.fn<PackageElicitationFunction>().mockResolvedValue(null);
    manager.setElicitationFunction(requestInput);

    const scope = await manager.requestApproval(['untrusted-package']);

    expect(requestInput).toHaveBeenCalledTimes(1);
    expect(scope).toBeNull();
    expect(manager.isApproved('untrusted-package')).toBe(false);
  });

  it('fails closed when MCP input cannot be fulfilled', async () => {
    const manager = new PackageApprovalManager();
    manager.setElicitationFunction(async () => {
      throw new Error('client has no elicitation capability');
    });

    await expect(manager.requestApproval(['untrusted-package'])).resolves.toBeNull();
    expect(manager.isApproved('untrusted-package')).toBe(false);
  });
});
