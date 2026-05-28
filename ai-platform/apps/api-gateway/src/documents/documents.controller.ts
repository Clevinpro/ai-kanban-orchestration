import {
  BadGatewayException,
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';

const DEFAULT_AI_SERVICE_PORT = 4001;
type UploadedMulterFile = {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
};

type DocumentNote = {
  id: string;
  title: string;
  notes: string | null;
  createdAt: string;
  filePath: string | null;
};

@Controller('documents')
export class DocumentsController {
  private readonly logger = new Logger(DocumentsController.name);

  @Get('notes')
  @UseGuards(JwtAuthGuard)
  async proxyGetDocumentNotes(): Promise<DocumentNote[]> {
    const response = await fetch(`${this.getAiServiceBaseUrl()}/api/documents/notes`);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      this.logger.error(`AI service returned ${response.status}: ${errorBody}`);
      throw new BadGatewayException('AI service notes request failed');
    }

    return (await response.json()) as DocumentNote[];
  }

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async proxyUploadDocument(
    @UploadedFile() file: UploadedMulterFile | undefined,
  ): Promise<{ documentId: string; chunksCount: number }> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const extension = this.getExtension(file.originalname);
    if (extension !== '.txt' && extension !== '.md') {
      throw new BadRequestException('Only .txt and .md files are supported');
    }

    const formData = new FormData();
    const fileBytes = Uint8Array.from(file.buffer);
    const decodedFilename = file.originalname;
    const ext = decodedFilename.toLowerCase().endsWith('.md') ? '.md' : '.txt';
    const safeBlobName = decodedFilename === 'guide.md' ? 'guide.md' : `document${ext}`;

    formData.append(
      'file',
      new Blob([fileBytes], { type: file.mimetype || 'text/plain' }),
      safeBlobName,
    );
    formData.append('titleBase64', Buffer.from(decodedFilename, 'utf8').toString('base64'));

    const response = await fetch(`${this.getAiServiceBaseUrl()}/api/documents/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      this.logger.error(`AI service returned ${response.status}: ${errorBody}`);
      throw new BadGatewayException('AI service upload request failed');
    }

    return (await response.json()) as { documentId: string; chunksCount: number };
  }

  private getAiServiceBaseUrl(): string {
    if (process.env.NODE_ENV === 'development') {
      return `http://localhost:${process.env.AI_SERVICE_PORT ?? DEFAULT_AI_SERVICE_PORT}`;
    }

    const aiServiceUrl = process.env.AI_SERVICE_URL;
    if (!aiServiceUrl) {
      throw new BadGatewayException('AI_SERVICE_URL is not configured');
    }

    return aiServiceUrl.replace(/\/$/, '');
  }

  private getExtension(filename: string): string {
    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex === -1) {
      return '';
    }

    return filename.slice(lastDotIndex).toLowerCase();
  }
}
