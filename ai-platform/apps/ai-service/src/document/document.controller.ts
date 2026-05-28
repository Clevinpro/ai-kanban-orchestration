import { LoggerService } from '@ai-platform/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { extname, join } from 'path';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { DocumentNotes, DocumentService } from './document.service';

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
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: UploadDocumentBody,
  ): Promise<{ documentId: string; chunksCount: number }> {
    if (!file) {
      this.logger.warn('Upload rejected: file missing', 'DocumentController');
      throw new BadRequestException('File is required');
    }

    const extension = extname(file.originalname).toLowerCase();
    if (extension !== '.txt' && extension !== '.md') {
      this.logger.warn(`Upload rejected: unsupported extension ${extension}`, 'DocumentController');
      throw new BadRequestException('Only .txt and .md files are supported');
    }

    const tempDirectory = await mkdtemp(join(tmpdir(), 'ai-document-'));
    const tempFilePath = join(tempDirectory, `upload${extension}`);

    try {
      await writeFile(tempFilePath, file.buffer);
      const title =
        (body.titleBase64
          ? Buffer.from(body.titleBase64, 'base64').toString('utf8')
          : body.title?.trim()) || file.originalname;
      this.logger.log(
        `Upload started: file="${file.originalname}", title="${title}"`,
        'DocumentController',
      );
      const result = await this.documentService.uploadDocument(tempFilePath, title);
      this.logger.log(
        `Upload finished: documentId=${result.documentId}, chunks=${result.chunksCount}`,
        'DocumentController',
      );

      void this.knowledgeService.generateDocNotes(result.documentId).catch((error: unknown) => {
        this.logger.error(
          error instanceof Error ? error.message : String(error),
          error instanceof Error ? error.stack : undefined,
          'DocumentController',
        );
      });

      return { documentId: result.documentId, chunksCount: result.chunksCount };
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  }
}
