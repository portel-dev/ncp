export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: [
    '**/?(*.)+(spec|test).[tj]s'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    'micromcp-installation.test.ts' // macOS-specific, requires pbcopy and makes network requests
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: './tsconfig.test.json'
    }]
  },
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts'
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 20,
      functions: 35,
      lines: 29,
      statements: 29
    }
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  extensionsToTreatAsEsm: ['.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(clipboardy)/)'
  ],
  moduleNameMapper: {
    '@xenova/transformers': '<rootDir>/tests/__mocks__/transformers.js',
    '^chalk$': '<rootDir>/tests/__mocks__/chalk.js',
    '^clipboardy$': '<rootDir>/tests/__mocks__/clipboardy.js',
    '^.*\\/utils\\/updater\\.js$': '<rootDir>/tests/__mocks__/updater.js',
    '^.*\\/cache\\/csv-cache\\.js$': '<rootDir>/tests/__mocks__/csv-cache.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  // '^.*/utils/version\\.js$': '<rootDir>/tests/__mocks__/version.ts'
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 15000,
  verbose: true,
  forceExit: true,
  detectOpenHandles: false,
  workerIdleMemoryLimit: '512MB',
  maxWorkers: 1
};