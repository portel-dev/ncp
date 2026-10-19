import { describe, expect, it } from '@jest/globals';
import { DefaultTransportFactory } from '../../src/orchestrator/services/transport-factory.js';

describe('DefaultTransportFactory Windows PATH handling', () => {
  it('preserves a Windows Path value when augmenting system paths', () => {
    const factory = new DefaultTransportFactory();
    const env = {
      Path: 'C:\\hostedtoolcache\\windows\\node\\24.21.0\\x64;C:\\Windows\\System32',
      SYSTEMROOT: 'C:\\Windows',
    };

    (factory as any).setupEnvironment('local_fixture', env, 'win32');

    expect(Object.keys(env).filter(key => key.toLowerCase() === 'path')).toEqual(['Path']);
    expect(env.Path).toContain('C:\\hostedtoolcache\\windows\\node\\24.21.0\\x64');
    expect(env.Path).toContain('C:\\Windows\\System32');
  });

  it('collapses differently cased PATH duplicates using the last merged value', () => {
    const factory = new DefaultTransportFactory();
    const env = {
      Path: 'C:\\old-node-path',
      PATH: 'C:\\configured-node-path;C:\\Windows\\System32',
    };

    (factory as any).setupEnvironment('local_fixture', env, 'win32');

    expect(Object.keys(env).filter(key => key.toLowerCase() === 'path')).toEqual(['PATH']);
    expect(env.PATH).toContain('C:\\configured-node-path');
    expect(env.PATH).not.toContain('C:\\old-node-path');
  });
});
