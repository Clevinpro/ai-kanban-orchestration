/// <reference types="multer" />
import { BadRequestException, HttpStatus } from '@nestjs/common';
import { DocumentController } from './document.controller';
import type { DocumentService } from './document.service';
import type { KnowledgeService } from '../knowledge/knowledge.service';

jest.mock('fs/promises', () => ({
  mkdtemp: jest.fn(),
  writeFile: jest.fn(),
  rm: jest.fn(),
}));
const fsMock = jest.requireMock('fs/promises') as {
  mkdtemp: jest.Mock;
  writeFile: jest.Mock;
  rm: jest.Mock;
};

type UploadBody = { title?: string; titleBase64?: string };

// Only the fields the controller reads (`originalname`, `buffer`) matter; the
// rest of `Express.Multer.File` is filled via a cast so the structural stand-in
// satisfies the controller's parameter type.
const buildFile = (originalname = 'note.md'): Express.Multer.File =>
  ({
    originalname,
    buffer: Buffer.from('# Heading\n\nbody', 'utf8'),
    mimetype: 'text/markdown',
  }) as Express.Multer.File;

describe('DocumentController (async upload)', () => {
  let documentService: {
    registerDocument: jest.Mock;
    scheduleIndexing: jest.Mock;
  };
  let knowledgeService: { generateDocNotes: jest.Mock };
  let logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock };
  let controller: DocumentController;

  beforeEach(() => {
    fsMock.mkdtemp.mockResolvedValue('/tmp/ai-document-xyz');
    fsMock.writeFile.mockResolvedValue(undefined);
    fsMock.rm.mockResolvedValue(undefined);

    documentService = {
      registerDocument: jest.fn().mockResolvedValue({
        documentId: 'doc-1',
        status: 'pending',
      }),
      scheduleIndexing: jest.fn(),
    };
    knowledgeService = { generateDocNotes: jest.fn().mockResolvedValue(undefined) };
    logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

    controller = new DocumentController(
      documentService as unknown as DocumentService,
      knowledgeService as unknown as KnowledgeService,
      logger as never,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('AC-18: the upload handler responds 202 before background indexing settles', async () => {
    // A scheduleIndexing promise that we control: it stays pending until released,
    // so we can prove the controller responds WITHOUT awaiting it.
    let releaseIndexing: () => void = () => undefined;
    let indexingSettled = false;
    const indexingPromise = new Promise<void>((resolve) => {
      releaseIndexing = () => {
        indexingSettled = true;
        resolve();
      };
    });
    documentService.scheduleIndexing.mockReturnValue(indexingPromise);

    const result = await controller.uploadDocument(buildFile(), {} as UploadBody);

    // The response is the async contract shape and is produced while indexing is
    // still pending — the handler did not await the background job.
    expect(result).toEqual({ documentId: 'doc-1', status: 'pending' });
    expect(indexingSettled).toBe(false);
    expect(documentService.scheduleIndexing).toHaveBeenCalledWith('doc-1');

    // Release the background job so the detached promise chain can settle.
    releaseIndexing();
    await indexingPromise;
  });

  it('AC-18: the handler decorator maps the success path to 202 Accepted', () => {
    // The @HttpCode(ACCEPTED) decorator records 202 on the route handler metadata.
    const code = Reflect.getMetadata('__httpCode__', controller.uploadDocument);
    expect(code).toBe(HttpStatus.ACCEPTED);
  });

  it('AC-18: schedules background indexing for the registered id (off the request path)', async () => {
    documentService.scheduleIndexing.mockResolvedValue(undefined);

    await controller.uploadDocument(buildFile(), {} as UploadBody);

    expect(documentService.registerDocument).toHaveBeenCalledTimes(1);
    expect(documentService.scheduleIndexing).toHaveBeenCalledWith('doc-1');
  });

  it('rejects a missing file with 400 and never registers/schedules', async () => {
    await expect(controller.uploadDocument(undefined, {} as UploadBody)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(documentService.registerDocument).not.toHaveBeenCalled();
    expect(documentService.scheduleIndexing).not.toHaveBeenCalled();
  });

  it('rejects an unsupported extension with 400', async () => {
    await expect(
      controller.uploadDocument(buildFile('image.png'), {} as UploadBody),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(documentService.registerDocument).not.toHaveBeenCalled();
  });

  it('forwards a base64-decoded title to registerDocument', async () => {
    documentService.scheduleIndexing.mockResolvedValue(undefined);
    const titleBase64 = Buffer.from('Мій документ', 'utf8').toString('base64');

    await controller.uploadDocument(buildFile(), { titleBase64 } as UploadBody);

    expect(documentService.registerDocument).toHaveBeenCalledWith(
      expect.any(String),
      'Мій документ',
    );
  });

  describe('getDocumentStatus', () => {
    it('AC-18: delegates to the service and relays its status shape', async () => {
      const statusService = {
        getDocumentStatus: jest
          .fn()
          .mockResolvedValue({ documentId: 'doc-1', status: 'ready', chunksCount: 4 }),
      };
      const statusController = new DocumentController(
        statusService as unknown as DocumentService,
        knowledgeService as unknown as KnowledgeService,
        logger as never,
      );

      await expect(statusController.getDocumentStatus('doc-1')).resolves.toEqual({
        documentId: 'doc-1',
        status: 'ready',
        chunksCount: 4,
      });
      expect(statusService.getDocumentStatus).toHaveBeenCalledWith('doc-1');
    });

    it('AC-18: propagates the service NotFound (→ 404) for an unknown id', async () => {
      const notFound = new Error('not found');
      const statusService = {
        getDocumentStatus: jest.fn().mockRejectedValue(notFound),
      };
      const statusController = new DocumentController(
        statusService as unknown as DocumentService,
        knowledgeService as unknown as KnowledgeService,
        logger as never,
      );

      await expect(statusController.getDocumentStatus('missing')).rejects.toBe(notFound);
    });
  });
});
