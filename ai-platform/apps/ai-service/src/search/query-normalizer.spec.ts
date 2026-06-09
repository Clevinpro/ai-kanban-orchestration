import { QueryNormalizer } from './query-normalizer';

// ---------------------------------------------------------------------------
// normalize
// ---------------------------------------------------------------------------

describe('QueryNormalizer.normalize', () => {
  it('strips angle brackets and preserves case for semantic; keeps them for lexical', () => {
    const result = QueryNormalizer.normalize('<FAQ>');
    expect(result).toEqual({ semantic: 'FAQ', lexical: '<FAQ>' });
  });

  it('trims surrounding whitespace and preserves case in both semantic and lexical', () => {
    const result = QueryNormalizer.normalize('  тег FAQ  ');
    expect(result).toEqual({ semantic: 'тег FAQ', lexical: 'тег FAQ' });
  });

  it('collapses multiple interior spaces in semantic', () => {
    const result = QueryNormalizer.normalize('foo   bar');
    expect(result.semantic).toBe('foo bar');
    expect(result.lexical).toBe('foo   bar');
  });

  it('returns empty strings for empty input', () => {
    const result = QueryNormalizer.normalize('');
    expect(result).toEqual({ semantic: '', lexical: '' });
  });
});

// ---------------------------------------------------------------------------
// isTagQuery
// ---------------------------------------------------------------------------

describe('QueryNormalizer.isTagQuery', () => {
  it('returns true for lowercase tag <faq>', () => {
    expect(QueryNormalizer.isTagQuery('<faq>')).toBe(true);
  });

  it('returns true for uppercase tag <FAQ>', () => {
    expect(QueryNormalizer.isTagQuery('<FAQ>')).toBe(true);
  });

  it('returns true for hyphenated tag <faq-item>', () => {
    expect(QueryNormalizer.isTagQuery('<faq-item>')).toBe(true);
  });

  it('returns false for closing tag </faq>', () => {
    expect(QueryNormalizer.isTagQuery('</faq>')).toBe(false);
  });

  it('returns false when tag is preceded by text', () => {
    expect(QueryNormalizer.isTagQuery('тег <faq>')).toBe(false);
  });

  it('returns false when tag is followed by extra text', () => {
    expect(QueryNormalizer.isTagQuery('<faq>extra')).toBe(false);
  });

  it('returns false for plain word without angle brackets', () => {
    expect(QueryNormalizer.isTagQuery('faq')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(QueryNormalizer.isTagQuery('')).toBe(false);
  });
});
