import {describe, expect, it} from 'vitest';
import {validateProviderBaseUrl} from './providerUrlPolicy';

describe('provider URL SSRF policy', () => {
  it('accepts a public HTTPS provider and normalizes trailing slashes', () => {
    expect(validateProviderBaseUrl(
      'https://api.openai.com/v1///',
      ['104.18.7.192', '2606:4700::6812:6c0'],
    )).toBe('https://api.openai.com/v1');
  });

  it.each([
    ['http://example.com/v1', ['93.184.216.34']],
    ['https://localhost/v1', ['127.0.0.1']],
    ['https://service.local/v1', ['93.184.216.34']],
    ['https://127.0.0.1/v1', ['127.0.0.1']],
    ['https://10.0.0.1/v1', ['10.0.0.1']],
    ['https://169.254.169.254/latest', ['169.254.169.254']],
    ['https://[::1]/v1', ['::1']],
    ['https://example.com:8443/v1', ['93.184.216.34']],
    ['https://user:pass@example.com/v1', ['93.184.216.34']],
    ['https://example.com/v1?x=1', ['93.184.216.34']],
    ['https://example.com/v1', ['93.184.216.34', '192.168.1.2']],
  ])('rejects unsafe destination %s', (url, addresses) => {
    expect(() => validateProviderBaseUrl(url, addresses))
      .toThrow(/không an toàn|HTTPS/i);
  });
});
