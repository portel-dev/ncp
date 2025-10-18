export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: [
    '**/?(*.)+(spec|test).[tj]s'
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'ESNext',
        target: 'ES2022',
        moduleResolution: 'bundler'
      }
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
      branches: 60,
      functions: 80,
      lines: 75,
      statements: 75
    }
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  extensionsToTreatAsEsm: ['.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(clipboardy)/)'
  ],
  moduleNameMapper: {
    '@xenova/transformers': '<rootDir>/test/__mocks__/transformers.js',
    '^chalk$': '<rootDir>/test/__mocks__/chalk.js',
    '^clipboardy$': '<rootDir>/test/__mocks__/clipboardy.js',
    '^.*\\/utils\\/updater\\.js$': '<rootDir>/test/__mocks__/updater.js',
    '^.*\\/cache\\/csv-cache\\.js$': '<rootDir>/test/__mocks__/csv-cache.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  // '^.*/utils/version\\.js$': '<rootDir>/test/__mocks__/version.ts'
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  testTimeout: 15000,
  verbose: true,
  forceExit: true,
  detectOpenHandles: false,
  workerIdleMemoryLimit: '512MB',
  maxWorkers: 1
};