import { join } from 'path';
import { jest } from '@jest/globals';

describe('version', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    it('prefers global version', () => {
        // Setup mock files
        const projectDir = process.cwd();
        const globalDir = '/usr/local/lib/node_modules/@portel/ncp';
        const utilsDir = join(globalDir, 'dist', 'utils');

        // Setup mocks
        const mockFiles: { [key: string]: string } = {
            [join(globalDir, 'package.json')]: JSON.stringify({
                name: '@portel/ncp',
                version: '1.4.3'
            })
        };

        jest.mock('fs', () => ({
            existsSync: jest.fn().mockImplementation((path: unknown) => {
                const exists = Object.prototype.hasOwnProperty.call(mockFiles, String(path));
                console.log('Debug: existsSync:', String(path), exists);
                return exists;
            }),
            readFileSync: jest.fn().mockImplementation((path: unknown) => {
                const filePath = String(path);
                console.log('Debug: readFileSync:', filePath);
                if (!mockFiles[filePath]) {
                    throw new Error(`Mock file not found: ${filePath}`);
                }
                return Buffer.from(mockFiles[filePath]);
            }),
            realpathSync: jest.fn().mockImplementation((path: unknown) => {
                console.log('Debug: realpathSync:', String(path));
                return globalDir;
            })
        }));

        // Load and run tests
        jest.isolateModules(() => {
            // Mock globals inside isolated module
            (global as any).__dirname = utilsDir;
            console.log('Debug: Setting __dirname to:', utilsDir);

            const { getPackageInfo } = require('../src/utils/version');
            console.log('Debug: Getting package info');
            const result = getPackageInfo();
            console.log('Debug: Got version:', result.version);
            expect(result.version).toBe('1.4.3');
        });
    });

    it('falls back to local version', () => {
        // Setup mock files
        const localDir = process.cwd();
        const mockFiles: { [key: string]: string } = {
            [join(localDir, 'package.json')]: JSON.stringify({
                name: '@portel/ncp',
                version: '1.5.0'
            })
        };

        jest.mock('fs', () => ({
            existsSync: jest.fn().mockImplementation((path: unknown) => {
                const exists = Object.prototype.hasOwnProperty.call(mockFiles, String(path));
                console.log('Debug: existsSync:', String(path), exists);
                return exists;
            }),
            readFileSync: jest.fn().mockImplementation((path: unknown) => {
                const filePath = String(path);
                console.log('Debug: readFileSync:', filePath);
                if (!mockFiles[filePath]) {
                    throw new Error(`Mock file not found: ${filePath}`);
                }
                return Buffer.from(mockFiles[filePath]);
            }),
            realpathSync: jest.fn().mockImplementation((path: unknown) => {
                console.log('Debug: realpathSync:', String(path));
                return String(path);
            })
        }));

        jest.isolateModules(() => {
            // Don't set __dirname to simulate local install
            delete (global as any).__dirname;
            console.log('Debug: __dirname cleared');

            // Load and run tests
            const { getPackageInfo } = require('../src/utils/version');
            console.log('Debug: Getting package info');
            const result = getPackageInfo();
            console.log('Debug: Got version:', result.version);
            expect(result.version).toBe('1.5.0');
        });
    });
});
