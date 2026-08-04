import {isIP} from 'node:net';

function ipv4Number(address: string) {
  const parts = address.split('.').map(Number);
  if (
    parts.length !== 4
    || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null;
  }
  return parts.reduce((value, part) => value * 256 + part, 0) >>> 0;
}

function inIpv4Cidr(address: number, base: string, prefix: number) {
  const baseNumber = ipv4Number(base);
  if (baseNumber === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (address & mask) === (baseNumber & mask);
}

function mappedIpv4(address: string) {
  const lower = address.toLowerCase();
  const match = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (match) return match[1];

  const hexMatch = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hexMatch) return null;
  const high = Number.parseInt(hexMatch[1], 16);
  const low = Number.parseInt(hexMatch[2], 16);
  return [
    high >>> 8,
    high & 255,
    low >>> 8,
    low & 255,
  ].join('.');
}

function isPublicIpv4(address: string) {
  const value = ipv4Number(address);
  if (value === null) return false;
  return ![
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
  ].some(([base, prefix]) => inIpv4Cidr(
    value,
    base as string,
    prefix as number,
  ));
}

function isPublicIpv6(address: string) {
  const normalized = address.toLowerCase().split('%')[0];
  const mapped = mappedIpv4(normalized);
  if (mapped) return isPublicIpv4(mapped);

  return normalized !== '::'
    && normalized !== '::1'
    && !/^f[cd][0-9a-f]{2}:/.test(normalized)
    && !/^fe[89ab][0-9a-f]:/.test(normalized)
    && !/^ff[0-9a-f]{2}:/.test(normalized)
    && !/^2001:db8(?:[:]|$)/.test(normalized);
}

function isPublicAddress(address: string) {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version === 6) return isPublicIpv6(address);
  return false;
}

export function validateProviderBaseUrl(
  value: string,
  resolvedAddresses: string[],
) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Base URL không an toàn.');
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (url.protocol !== 'https:') {
    throw new Error('Base URL phải dùng HTTPS.');
  }
  if (
    url.username
    || url.password
    || url.search
    || url.hash
    || (url.port && url.port !== '443')
    || hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
    || resolvedAddresses.length === 0
    || resolvedAddresses.some((address) => !isPublicAddress(address))
  ) {
    throw new Error('Base URL không an toàn.');
  }

  return url.toString().replace(/\/+$/, '');
}
