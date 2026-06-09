import {
  BadGatewayException,
  BadRequestException,
  Controller,
  Get,
  GatewayTimeoutException,
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
const DEFAULT_UPLOAD_PROXY_TIMEOUT_MS = 30_000;
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
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async proxyUploadDocument(
    @UploadedFile() file: UploadedMulterFile | undefined,
  ): Promise<{ documentId: string; status: string }> {
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

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.getUploadProxyTimeoutMs());

    let response: Response;
    try {
      response = await fetch(`${this.getAiServiceBaseUrl()}/api/documents/upload`, {
        method: 'POST',
        body: formData,
        signal: abortController.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.error('AI service upload request timed out');
        throw new GatewayTimeoutException('AI service upload request timed out');
      }

      this.logger.error(
        `AI service upload request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BadGatewayException('AI service upload request failed');
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      this.logger.error(`AI service returned ${response.status}: ${errorBody}`);
      throw new BadGatewayException('AI service upload request failed');
    }

    return (await response.json()) as { documentId: string; status: string };
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

  private getUploadProxyTimeoutMs(): number {
    const timeoutMs = Number(process.env.UPLOAD_PROXY_TIMEOUT_MS);
    return Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : DEFAULT_UPLOAD_PROXY_TIMEOUT_MS;
  }

  private getExtension(filename: string): string {
    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex === -1) {
      return '';
    }

    return filename.slice(lastDotIndex).toLowerCase();
  }
}
