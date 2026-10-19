import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { RegistryClient } from '../src/services/registry-client.js';

const originalFetch = globalThis.fetch;
const entry = (name: string, version = '1.0.0', status = 'active') => ({
  server: { name, description: name, version },
  _meta: { 'io.modelcontextprotocol.registry/official': { status } },
});
const page = (servers: ReturnType<typeof entry>[], nextCursor?: string) =>
  new Response(JSON.stringify({ servers, metadata: { nextCursor } }));

afterEach(() => { globalThis.fetch = originalFetch; jest.restoreAllMocks(); });

describe('Official registry catalog', () => {
  it('searches all pages and encodes opaque cursors', async () => {
    const fetchMock = jest.fn<typeof fetch>()
      .mockResolvedValueOnce(page([entry('example/first')], 'next/+page?'))
      .mockResolvedValueOnce(page([entry('example/needle')]));
    globalThis.fetch = fetchMock;
    const client = new RegistryClient();
    expect((await client.search('needle')).map(s => s.server.name)).toEqual(['example/needle']);
    const first = new URL(String(fetchMock.mock.calls[0][0]));
    expect(first.pathname).toBe('/v0.1/servers');
    expect(first.searchParams.get('version')).toBe('latest');
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get('cursor')).toBe('next/+page?');
    await client.search('first');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('applies incremental updates and tombstones, retaining deprecated status', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const fetchMock = jest.fn<typeof fetch>()
      .mockResolvedValueOnce(page([entry('example/remove'), entry('example/update')]))
      .mockResolvedValueOnce(page([
        entry('example/remove', '1.0.0', 'deleted'),
        entry('example/update', '2.0.0'),
        entry('example/old', '1.0.0', 'deprecated'),
      ]));
    globalThis.fetch = fetchMock;
    const client = new RegistryClient();
    await client.search('');
    now.mockReturnValue(31 * 60 * 1000);
    const result = await client.search('');
    expect(result.map(s => s.server.name).sort()).toEqual(['example/old', 'example/update']);
    expect(result.find(s => s.server.name === 'example/update')?.server.version).toBe('2.0.0');
    expect(result.find(s => s.server.name === 'example/old')?._meta?.['io.modelcontextprotocol.registry/official']?.status).toBe('deprecated');
    const request = new URL(String(fetchMock.mock.calls[1][0]));
    expect(request.searchParams.has('updated_since')).toBe(true);
    expect(request.searchParams.get('include_deleted')).toBe('true');
  });

  it('does not publish partial refreshes or advance the sync checkpoint after failure', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const fetchMock = jest.fn<typeof fetch>()
      .mockResolvedValueOnce(page([entry('example/original')]))
      .mockResolvedValueOnce(page([entry('example/partial')], 'page2'))
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValueOnce(page([entry('example/recovered')]));
    globalThis.fetch = fetchMock;
    const client = new RegistryClient();
    await client.search('');
    now.mockReturnValue(31 * 60 * 1000);
    expect((await client.search('')).map(s => s.server.name)).toEqual(['example/original']);
    expect((await client.search('')).map(s => s.server.name).sort()).toEqual(['example/original', 'example/recovered']);
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get('updated_since'))
      .toBe(new URL(String(fetchMock.mock.calls[3][0])).searchParams.get('updated_since'));
  });

  it('rejects looping cursors instead of caching an incomplete catalog', async () => {
    const fetchMock = jest.fn<typeof fetch>()
      .mockImplementation(async () => page([entry('example/first')], 'same'));
    globalThis.fetch = fetchMock;
    await expect(new RegistryClient().search('')).rejects.toThrow('repeated a pagination cursor');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses the versioned detail endpoint and clears catalog state on cache reset', async () => {
    const server = entry('io.example/server');
    const fetchMock = jest.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(server)))
      .mockResolvedValueOnce(page([server]))
      .mockResolvedValueOnce(page([]));
    globalThis.fetch = fetchMock;
    const client = new RegistryClient();
    expect(await client.getServer(server.server.name)).toEqual(server);
    expect(fetchMock.mock.calls[0][0]).toBe('https://registry.modelcontextprotocol.io/v0.1/servers/io.example%2Fserver/versions/latest');
    await client.search('');
    client.clearCache();
    expect(await client.search('')).toEqual([]);
    expect(new URL(String(fetchMock.mock.calls[2][0])).searchParams.has('updated_since')).toBe(false);
  });
});
