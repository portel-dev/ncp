import { jest } from '@jest/globals';

describe('version', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    it('returns test version when running in Jest', async () => {
        const { getPackageInfo } = await import('../src/utils/version.js');
        const result = getPackageInfo();

        // In Jest, should return test version
        expect(result.packageName).toBe('@portel/ncp');
        expect(result.version).toBe('0.0.0-test');
    });

    it('exports version and packageName constants', async () => {
        const { version, packageName } = await import('../src/utils/version.js');

        // Should export constants
        expect(packageName).toBe('@portel/ncp');
        expect(version).toBe('0.0.0-test');
    });
});
