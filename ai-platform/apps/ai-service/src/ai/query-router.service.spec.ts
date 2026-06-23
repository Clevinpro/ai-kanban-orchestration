import type { CapabilityDetectorService } from './capability-detector.service';
import { isStructuredQuery, isTechnicalQuery, QueryRouterService } from './query-router.service';

describe('isStructuredQuery', () => {
  it('matches single tag-shaped queries', () => {
    expect(isStructuredQuery('<faq>')).toBe(true);
    expect(isStructuredQuery('<FAQ>')).toBe(true);
  });

  it('matches tag count and list intents', () => {
    expect(isStructuredQuery('count tags')).toBe(true);
    expect(isStructuredQuery('how many tags')).toBe(true);
    expect(isStructuredQuery('list all tags')).toBe(true);
    expect(isStructuredQuery('list all')).toBe(true);
    expect(isStructuredQuery('count')).toBe(true);
    expect(isStructuredQuery('list')).toBe(true);
  });

  it('does not match technical queries that share count/list phrasing', () => {
    expect(isStructuredQuery('how many endpoints')).toBe(false);
    expect(isStructuredQuery('list all endpoints')).toBe(false);
    expect(isStructuredQuery('list endpoints')).toBe(false);
  });

  it('does not match general questions', () => {
    expect(isStructuredQuery('what can I do here?')).toBe(false);
    expect(isStructuredQuery('how does the API work?')).toBe(false);
    expect(isStructuredQuery('explain the system architecture')).toBe(false);
  });
});

describe('isTechnicalQuery', () => {
  it('matches API and technical documentation intent', () => {
    expect(isTechnicalQuery('how does the API work?')).toBe(true);
    expect(isTechnicalQuery('what endpoints are available?')).toBe(true);
    expect(isTechnicalQuery('show me the OpenAPI spec')).toBe(true);
    expect(isTechnicalQuery('how do I authenticate with JWT?')).toBe(true);
  });

  it('does not match capability or structured queries', () => {
    expect(isTechnicalQuery('what can I do here?')).toBe(false);
    expect(isTechnicalQuery('count tags')).toBe(false);
  });
});

describe('QueryRouterService', () => {
  let capabilityDetector: jest.Mocked<Pick<CapabilityDetectorService, 'isCapabilityQuery'>>;
  let router: QueryRouterService;

  beforeEach(() => {
    capabilityDetector = {
      isCapabilityQuery: jest.fn().mockResolvedValue(false),
    };
    router = new QueryRouterService(capabilityDetector as unknown as CapabilityDetectorService);
  });

  it('classifies structured queries without calling the capability detector', async () => {
    await expect(router.classify('count tags')).resolves.toBe('structured');
    await expect(router.classify('list all tags')).resolves.toBe('structured');
    await expect(router.classify('list all')).resolves.toBe('structured');
    await expect(router.classify('<faq>')).resolves.toBe('structured');

    expect(capabilityDetector.isCapabilityQuery).not.toHaveBeenCalled();
  });

  it('classifies meta queries via CapabilityDetectorService', async () => {
    capabilityDetector.isCapabilityQuery.mockResolvedValueOnce(true);

    await expect(router.classify('what can I do here?')).resolves.toBe('meta');
    expect(capabilityDetector.isCapabilityQuery).toHaveBeenCalledWith('what can I do here?');
  });

  it('classifies technical queries', async () => {
    await expect(router.classify('how does the API work?')).resolves.toBe('technical');
    await expect(router.classify('what endpoints are available?')).resolves.toBe('technical');
    await expect(router.classify('how many endpoints')).resolves.toBe('technical');
    await expect(router.classify('list all endpoints')).resolves.toBe('technical');
  });

  it('falls through to complex for general questions', async () => {
    await expect(router.classify('explain the system architecture')).resolves.toBe('complex');
    await expect(router.classify('summarize yesterday meeting notes')).resolves.toBe('complex');
  });

  it('prefers structured over meta when both could match', async () => {
    capabilityDetector.isCapabilityQuery.mockResolvedValueOnce(true);

    await expect(router.classify('count tags')).resolves.toBe('structured');
    expect(capabilityDetector.isCapabilityQuery).not.toHaveBeenCalled();
  });

  it('prefers meta over technical when capability detector matches', async () => {
    capabilityDetector.isCapabilityQuery.mockResolvedValueOnce(true);

    await expect(router.classify('what features does the API expose?')).resolves.toBe('meta');
    expect(capabilityDetector.isCapabilityQuery).toHaveBeenCalledWith(
      'what features does the API expose?',
    );
  });
});
