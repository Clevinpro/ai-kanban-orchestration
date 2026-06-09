import { BadGatewayException, BadRequestException, GatewayTimeoutException } from '@nestjs/common';
import { DocumentsController } from './documents.controller';

type UploadedMulterFile = {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
};

const buildFile = (originalname = 'note.txt'): UploadedMulterFile => ({
  originalname,
  buffer: Buffer.from('hello world', 'utf8'),
  mimetype: 'text/plain',
});

describe('DocumentsController (upload proxy)', () => {
  let controller: DocumentsController;
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    controller = new DocumentsController();

    process.env.NODE_ENV = 'development';
    process.env.AI_SERVICE_PORT = '4001';
    delete process.env.UPLOAD_PROXY_TIMEOUT_MS;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('rejects a missing file with 400', async () => {
    await expect(controller.proxyUploadDocument(undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an unsupported extension with 400', async () => {
    await expect(controller.proxyUploadDocument(buildFile('image.png'))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('relays the async { documentId, status } body on a successful 202 (AC-15)', async () => {
    const body = { documentId: 'doc-1', status: 'pending' };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => body,
    }) as unknown as typeof fetch;

    await expect(controller.proxyUploadDocument(buildFile())).resolves.toEqual(body);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('passes an AbortController signal and configured timeout to fetch (AC-13)', async () => {
    process.env.UPLOAD_PROXY_TIMEOUT_MS = '1234';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ documentId: 'doc-2', status: 'pending' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    await controller.proxyUploadDocument(buildFile());

    const init = fetchMock.mock.calls[0][1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1234);
  });

  it('maps a fetch AbortError to 504 GatewayTimeout (AC-14)', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortError) as unknown as typeof fetch;

    await expect(controller.proxyUploadDocument(buildFile())).rejects.toBeInstanceOf(
      GatewayTimeoutException,
    );
  });

  it('maps a generic fetch failure to 502 BadGateway (AC-14)', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    await expect(controller.proxyUploadDocument(buildFile())).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('maps a non-2xx downstream response to 502 BadGateway (AC-14)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom',
    }) as unknown as typeof fetch;

    await expect(controller.proxyUploadDocument(buildFile())).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('clears the timeout after a successful response', async () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ documentId: 'doc-3', status: 'pending' }),
    }) as unknown as typeof fetch;

    await controller.proxyUploadDocument(buildFile());

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
