import { LoggerService } from '@ai-platform/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { extname, join } from 'path';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { DocumentNotes, DocumentService, DocumentStatus } from './document.service';

type UploadDocumentBody = {
  title?: string;
  titleBase64?: string;
};

@Controller('documents')
export class DocumentController {
  constructor(
    private readonly documentService: DocumentService,
    private readonly knowledgeService: KnowledgeService,
    private readonly logger: LoggerService,
  ) {}

  @Get('notes')
  async getDocumentNotes(): Promise<DocumentNotes[]> {
    return this.documentService.getDocumentationNotes();
  }

  @Get(':id/status')
  async getDocumentStatus(
    @Param('id') id: string,
  ): Promise<{ documentId: string; status: DocumentStatus; chunksCount: number }> {
    // Throws NotFoundException (→ 404) when the document id does not exist.
    return this.documentService.getDocumentStatus(id);
  }

  @Post('reindex')
  @HttpCode(HttpStatus.OK)
  async reindexDocuments(): Promise<{ documents: number; chunks: number; failed: number }> {
    this.logger.log('Reindex request received', 'DocumentController');
    const result = await this.documentService.reindexAll();
    this.logger.log(
      `Reindex complete: documents=${result.documents}, chunks=${result.chunks}, failed=${result.failed}`,
      'DocumentController',
    );
    return result;
  }

  @Post('upload')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: UploadDocumentBody,
  ): Promise<{ documentId: string; status: DocumentStatus }> {
    if (!file) {
      this.logger.warn('Upload rejected: file missing', 'DocumentController');
      throw new BadRequestException('File is required');
    }

    const extension = extname(file.originalname).toLowerCase();
    if (extension !== '.txt' && extension !== '.md') {
      this.logger.warn(`Upload rejected: unsupported extension ${extension}`, 'DocumentController');
      throw new BadRequestException('Only .txt and .md files are supported');
    }

    // Persist the upload to a stable temp file the background indexer can read
    // after the response is sent. mkdtemp uses a unique dir per upload, so it is
    // NOT removed in a `finally` (that would race the detached index job); the
    // background task cleans up its own directory when indexing settles.
    const tempDirectory = await mkdtemp(join(tmpdir(), 'ai-document-'));
    const tempFilePath = join(tempDirectory, `upload${extension}`);

    await writeFile(tempFilePath, file.buffer);
    const title =
      (body.titleBase64
        ? Buffer.from(body.titleBase64, 'base64').toString('utf8')
        : body.title?.trim()) || file.originalname;
    this.logger.log(
      `Upload started: file="${file.originalname}", title="${title}"`,
      'DocumentController',
    );

    // Fast path: validate + store the Document row (status='pending'). This does
    // NOT chunk / embed, so it returns in well under a second.
    const { documentId, status } = await this.documentService.registerDocument(tempFilePath, title);
    this.logger.log(
      `Upload accepted: documentId=${documentId}, status=${status}`,
      'DocumentController',
    );

    // Schedule the heavy indexing AFTER the response is sent. The request handler
    // MUST NOT await this — returning 202 then indexing synchronously in the same
    // await chain would defeat the async contract.
    void this.documentService
      .scheduleIndexing(documentId)
      .then(() => this.knowledgeService.generateDocNotes(documentId))
      .catch((error: unknown) => {
        this.logger.error(
          error instanceof Error ? error.message : String(error),
          error instanceof Error ? error.stack : undefined,
          'DocumentController',
        );
      })
      .finally(() => {
        void rm(tempDirectory, { recursive: true, force: true });
      });

    return { documentId, status };
  }
}
