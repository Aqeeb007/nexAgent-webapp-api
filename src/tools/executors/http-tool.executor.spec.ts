import { HttpToolExecutor } from './http-tool.executor';

describe('HttpToolExecutor', () => {
  let executor: HttpToolExecutor;

  const httpTool = {
    url: 'https://example.com/weather',
    method: 'GET' as const,
  };

  beforeEach(() => {
    executor = new HttpToolExecutor();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('appends args as query params for GET and returns a parsed JSON body', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ temp: 72 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock);

    const result = await executor.execute(httpTool, { city: 'NYC' });

    const [calledUrl] = fetchMock.mock.calls[0] as [URL];
    expect(calledUrl.toString()).toBe('https://example.com/weather?city=NYC');
    expect(result).toEqual({
      ok: true,
      status: 200,
      body: { temp: 72 },
      truncated: false,
    });
  });

  it('JSON-stringifies object-valued args instead of using [object Object]', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response('{}', { status: 200 }));
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock);

    await executor.execute(httpTool, { filter: { active: true } });

    const [calledUrl] = fetchMock.mock.calls[0] as [URL];
    expect(calledUrl.searchParams.get('filter')).toBe(
      JSON.stringify({ active: true }),
    );
  });

  it('sends args as a JSON body for POST', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response('{"ok":true}', { status: 201 }));
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock);

    const postTool = {
      url: 'https://example.com/orders',
      method: 'POST' as const,
    };

    const result = await executor.execute(postTool, { item: 'widget' });

    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ item: 'widget' }));
    expect(result.ok).toBe(true);
    expect(result.status).toBe(201);
  });

  it('returns an ok:false shape (never throws) for a non-2xx response', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        new Response('Not Found', { status: 404, statusText: 'Not Found' }),
      );
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock);

    const result = await executor.execute(httpTool, {});

    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
    expect(result.body).toBe('Not Found');
  });

  it('returns status 0 (never throws) on a network failure', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('fetch failed'));

    const result = await executor.execute(httpTool, {});

    expect(result).toEqual({
      ok: false,
      status: 0,
      body: { error: 'fetch failed' },
    });
  });

  it('truncates a response body larger than the byte cap', async () => {
    const bigChunk = 'a'.repeat(1024);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 300; i++) {
          controller.enqueue(new TextEncoder().encode(bigChunk));
        }
        controller.close();
      },
    });
    const response = new Response(stream, { status: 200 });
    jest.spyOn(global, 'fetch').mockResolvedValue(response);

    const result = await executor.execute(httpTool, {});

    expect(result.truncated).toBe(true);
    expect(result.ok).toBe(true);
  });
});
