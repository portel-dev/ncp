/**
 * Mock for isolated-vm native module
 *
 * This mock is used when running Jest tests because the native module
 * doesn't work well with Jest's ESM module resolution.
 *
 * The actual isolated-vm functionality is tested via integration tests
 * or by running the code manually.
 */

class MockIsolate {
  constructor(options = {}) {
    // Throw to simulate isolated-vm not being available
    // This causes isAvailable() to return false
    throw new Error('isolated-vm mock - not available in Jest');
  }

  async createContext() {
    return new MockContext();
  }

  async compileScript(code, options = {}) {
    return new MockScript(code);
  }

  getHeapStatisticsSync() {
    return {
      total_heap_size: 1000000,
      used_heap_size: 500000,
      externally_allocated_size: 0,
    };
  }

  dispose() {
    this._disposed = true;
  }
}

class MockContext {
  constructor() {
    this.global = new MockReference({});
  }

  async evalClosure(code, args = [], options = {}) {
    // Simplified mock - just returns undefined
    return undefined;
  }
}

class MockReference {
  constructor(value) {
    this._value = value;
  }

  async set(key, value) {
    this._value[key] = value;
  }

  async get(key) {
    return new MockReference(this._value[key]);
  }

  derefInto() {
    return this._value;
  }

  async copy() {
    return this._value;
  }
}

class MockScript {
  constructor(code) {
    this._code = code;
  }

  async run(context, options = {}) {
    // This is a mock - return a simple value
    // Real isolated-vm would execute the code
    return { mockResult: true };
  }
}

class MockCallback {
  constructor(fn) {
    this._fn = fn;
  }

  apply(receiver, args, options = {}) {
    return this._fn.apply(receiver, args);
  }
}

export default {
  Isolate: MockIsolate,
  Context: MockContext,
  Reference: MockReference,
  Script: MockScript,
  Callback: MockCallback,
};

export {
  MockIsolate as Isolate,
  MockContext as Context,
  MockReference as Reference,
  MockScript as Script,
  MockCallback as Callback,
};
