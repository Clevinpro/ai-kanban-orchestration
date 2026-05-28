import { HttpService } from '@nestjs/axios';
import { Body, Controller, Get, Headers, HttpException, Post, Req, Res } from '@nestjs/common';
import { LoggerService } from '@ai-platform/shared';
import { AxiosError, AxiosResponse } from 'axios';
import { Request, Response } from 'express';
import { firstValueFrom } from 'rxjs';

const DEFAULT_AUTH_PROXY_TIMEOUT_MS = 10_000;
const HOP_BY_HOP_REQUEST_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

@Controller('auth')
export class AuthController {
  constructor(
    private readonly httpService: HttpService,
    private readonly logger: LoggerService,
  ) {}

  @Get('google')
  proxyGoogle(@Req() request: Request, @Res() response: Response): Promise<void> {
    return this.proxyToAuthService(request, response);
  }

  @Get('google/callback')
  proxyGoogleCallback(@Req() request: Request, @Res() response: Response): Promise<void> {
    return this.proxyToAuthService(request, response);
  }

  @Post('register')
  proxyRegister(
    @Req() request: Request,
    @Res() response: Response,
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    return this.proxyToAuthService(request, response, body, headers);
  }

  @Post('login')
  proxyLogin(
    @Req() request: Request,
    @Res() response: Response,
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    return this.proxyToAuthService(request, response, body, headers);
  }

  @Post('refresh')
  proxyRefresh(
    @Req() request: Request,
    @Res() response: Response,
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    return this.proxyToAuthService(request, response, body, headers);
  }

  @Post('logout')
  proxyLogout(
    @Req() request: Request,
    @Res() response: Response,
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    return this.proxyToAuthService(request, response, body, headers);
  }

  @Get('me')
  proxyMe(@Req() request: Request, @Res() response: Response): Promise<void> {
    return this.proxyToAuthService(request, response);
  }

  private async proxyToAuthService(
    request: Request,
    response: Response,
    body?: unknown,
    headers: Record<string, string | string[] | undefined> = request.headers,
  ): Promise<void> {
    const authServiceUrl = this.getAuthServiceUrl();
    const authProxyTimeoutMs = this.getAuthProxyTimeoutMs();
    const proxyHeaders = this.getProxyRequestHeaders(headers);

    try {
      this.logger.log('Proxy auth request started', AuthController.name, {
        method: request.method,
        path: request.originalUrl,
      });

      const proxyResponse = await firstValueFrom(
        this.httpService.request({
          method: request.method,
          url: `${authServiceUrl.replace(/\/$/, '')}${request.originalUrl}`,
          headers: proxyHeaders,
          data: body,
          maxRedirects: 0,
          responseType: 'arraybuffer',
          timeout: authProxyTimeoutMs,
          validateStatus: () => true,
        }),
      );

      this.logger.log('Proxy auth request completed', AuthController.name, {
        method: request.method,
        path: request.originalUrl,
        statusCode: proxyResponse.status,
      });

      this.forwardResponse(proxyResponse, response);
    } catch (error) {
      if (error instanceof AxiosError && error.response) {
        this.logger.warn('Proxy auth request completed with upstream error', AuthController.name, {
          method: request.method,
          path: request.originalUrl,
          statusCode: error.response.status,
        });

        this.forwardResponse(error.response, response);
        return;
      }

      if (error instanceof AxiosError) {
        const isTimeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
        const statusCode = isTimeout ? 504 : 502;

        this.logger.error('Proxy auth request failed', error.stack, AuthController.name, {
          method: request.method,
          path: request.originalUrl,
          statusCode,
          errorCode: error.code,
          errorMessage: error.message,
        });

        throw new HttpException(
          isTimeout ? 'Auth service request timed out' : 'Auth service is unavailable',
          statusCode,
        );
      }

      this.logger.error(
        'Proxy auth request failed unexpectedly',
        error instanceof Error ? error.stack : undefined,
        AuthController.name,
        {
          method: request.method,
          path: request.originalUrl,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      );

      throw error;
    }
  }

  private forwardResponse(proxyResponse: AxiosResponse, response: Response): void {
    Object.entries(proxyResponse.headers).forEach(([header, value]) => {
      if (value !== undefined) {
        response.setHeader(header, value);
      }
    });

    response.status(proxyResponse.status).send(proxyResponse.data);
  }

  private getAuthServiceUrl(): string {
    if (process.env.NODE_ENV === 'development') {
      return `http://localhost:${process.env.AUTH_SERVICE_PORT ?? 4002}`;
    }

    const authServiceUrl = process.env.AUTH_SERVICE_URL;

    if (!authServiceUrl) {
      throw new HttpException('AUTH_SERVICE_URL is not configured', 500);
    }

    return authServiceUrl;
  }

  private getAuthProxyTimeoutMs(): number {
    const timeoutMs = Number(process.env.AUTH_PROXY_TIMEOUT_MS);
    return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_AUTH_PROXY_TIMEOUT_MS;
  }

  private getProxyRequestHeaders(
    headers: Record<string, string | string[] | undefined>,
  ): Record<string, string | string[]> {
    return Object.entries(headers).reduce<Record<string, string | string[]>>(
      (proxyHeaders, [header, value]) => {
        if (value !== undefined && !HOP_BY_HOP_REQUEST_HEADERS.has(header.toLowerCase())) {
          proxyHeaders[header] = value;
        }

        return proxyHeaders;
      },
      {},
    );
  }
}
