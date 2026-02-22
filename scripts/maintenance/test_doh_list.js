/**
 * @file scripts/test_doh_list.js
 * @description Validates a list of DoH servers by resolving google.com
 */

import { encodeBase64Url } from 'jsr:@std/encoding@^1.0.0/base64url';

const candidates = [
  // --- Existing List ---
  'https://cloudflare-dns.com/dns-query',
  'https://dns.google/dns-query',
  'https://dns.quad9.net/dns-query',
  'https://doh.opendns.com/dns-query',
  'https://doh.cleanbrowsing.org/doh/family-filter/',
  'https://dns.adguard-dns.com/dns-query',
  'https://dns.mullvad.net/dns-query',
  'https://dns.controld.com/comss',
  'https://doh.libredns.gr/dns-query',
  'https://puredns.org/dns-query',
  'https://doh.applied-privacy.net/query',
  'https://dns.switch.ch/dns-query',
  'https://dns.digitale-gesellschaft.ch/dns-query',
  'https://dns4eu.eu/dns-query',
  'https://doh.tiarap.org/dns-query',
  'https://dns.aa.net.uk/dns-query',
  'https://doh.dns.sb/dns-query',
  'https://dns.fortiguard.com/dns-query',
  'https://doh.ffmuc.net/dns-query',
  'https://dns.nextdns.io/dns-query',
  'https://doh.360.cn/dns-query',
  'https://dns.umbrella.com/dns-query',
  'https://dns.tenta.com/dns-query',
  'https://doh.posteo.de/dns-query',
  'https://dns.easypi.pro/dns-query',
  'https://doh.linuxserver.io/dns-query',
  'https://resolver.dnscrypt.info/dns-query',
  'https://doh.mycrazydomain.com/dns-query',
  'https://dns.circl.lu/dns-query',
  'https://doh.armored.net/dns-query',
  'https://dns.cfi.re/dns-query',

  // --- New Candidates ---
  'https://dns0.eu/dns-query', // DNS0.eu (European Public DNS)
  'https://dns0.eu/zero/dns-query', // DNS0.eu Zero (Security)
  'https://doh.la.ahadns.net/dns-query', // AhaDNS Los Angeles
  'https://doh.nl.ahadns.net/dns-query', // AhaDNS Netherlands
  'https://doh.es.ahadns.net/dns-query', // AhaDNS Spain
  'https://doh-de.blahdns.com/dns-query', // BlahDNS Germany
  'https://doh-jp.blahdns.com/dns-query', // BlahDNS Japan
  'https://doh-sg.blahdns.com/dns-query', // BlahDNS Singapore
  'https://ordns.he.net/dns-query', // Hurricane Electric
  'https://public.dns.iij.jp/dns-query', // IIJ Japan
  'https://security.cloudflare-dns.com/dns-query', // Cloudflare Security
  'https://family.cloudflare-dns.com/dns-query', // Cloudflare Family
  'https://dns10.quad9.net/dns-query', // Quad9 Unsecured
  'https://base.dns.mullvad.net/dns-query', // Mullvad Base
  'https://extended.dns.mullvad.net/dns-query', // Mullvad Extended
  'https://adblock.dns.mullvad.net/dns-query', // Mullvad Adblock
  'https://private.canadianshield.cira.ca/dns-query', // CIRA Private
  'https://protected.canadianshield.cira.ca/dns-query', // CIRA Protected
  // "https://doh.xfinity.com/dns-query",            // Comcast (Consumer Only?)
  'https://fi.doh.snopyta.org/dns-query', // Snopyta
  'https://doh.pub/dns-query', // DNSPod (Tencent)
  'https://dns.alidns.com/dns-query', // AliDNS
  'https://dns.rubyfish.cn/dns-query', // Rubyfish
  'https://odvr.nic.cz/doh', // CZ.NIC ODVR
  'https://doh.pl/dns-query', // DoH.pl
  'https://doh.li/dns-query', // DoH.li
  'https://dns.seby.io/dns-query', // Seby.io
  'https://jp.tiarap.org/dns-query', // Tiarap Japan
  'https://doh.familyshield.opendns.com/dns-query', // OpenDNS Family Shield
  'https://dns.adguard.com/dns-query', // AdGuard Default
  'https://dns-family.adguard.com/dns-query', // AdGuard Family
  'https://freedns.controld.com/p0', // Control D Unfiltered
  'https://freedns.controld.com/p1', // Control D Malware
  'https://freedns.controld.com/p2', // Control D Ads+Malware
  'https://adfree.usableprivacy.net/dns-query', // Usable Privacy
  'https://anycast.uncensoreddns.org/dns-query', // UncensoredDNS Anycast
  'https://unicast.uncensoreddns.org/dns-query', // UncensoredDNS Unicast
  'https://doh.bortzmeyer.fr', // Bortzmeyer
  'https://ibksturm.synology.me/dns-query', // Private/Small? Test
  'https://dns.hostux.net/dns-query', // Hostux
  'https://dns.tuna.tsinghua.edu.cn/dns-query', // Tsinghua University
  'https://doh.mullvad.net/dns-query', // Mullvad Default (Dupe check)
  'https://doh.233py.com/dns-query', // 233py
  'https://doh.this.web.id/dns-query',
];

const testServer = async (url) => {
  try {
    const name = 'google.com';
    const packet = encodeDnsQuery(name, 1); // 1 = A Record
    const base64Query = encodeBase64Url(packet);

    // Strict 1.5s timeout for responsiveness
    // Using AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const reqUrl = new URL(url);
    reqUrl.searchParams.set('dns', base64Query);

    const start = performance.now();
    const res = await fetch(reqUrl, {
      headers: { 'Accept': 'application/dns-message' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const time = Math.round(performance.now() - start);

    if (res.ok) {
      // Basic check if data returned
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 12) {
        console.log(`[PASS] ${time}ms - ${url}`);
        return url;
      }
    }
    console.log(`[FAIL] ${res.status} - ${url}`);
    return null;
  } catch (e) {
    console.log(`[ERR ] ${e.message} - ${url}`);
    return null;
  }
};

// Helpers
const encodeDnsQuery = (name, type) => {
  const parts = name.split('.').filter((p) => p.length);
  let len = 12;
  for (const p of parts) len += 1 + p.length;
  len += 5;
  const buf = new Uint8Array(len);
  const view = new DataView(buf.buffer);
  view.setUint16(0, 1234);
  view.setUint16(2, 0x0100);
  view.setUint16(4, 1);
  let offset = 12;
  const encoder = new TextEncoder();
  for (const p of parts) {
    const bytes = encoder.encode(p);
    buf[offset] = bytes.length;
    offset++;
    buf.set(bytes, offset);
    offset += bytes.length;
  }
  buf[offset] = 0;
  offset++;
  view.setUint16(offset, type);
  offset += 2;
  view.setUint16(offset, 1);
  return buf;
};

// Main
const main = async () => {
  console.log(`Testing ${candidates.length} candidates...`);
  const passed = [];

  // Run in chunks of 10 to utilize parallelism but avoid file descriptor limits
  const chunkSize = 10;
  for (let i = 0; i < candidates.length; i += chunkSize) {
    const chunk = candidates.slice(i, i + chunkSize);
    const results = await Promise.all(chunk.map(testServer));
    passed.push(...results.filter((u) => u !== null));
  }

  console.log(`\n--- PASSED (${passed.length}) ---`);
  // Print in TOML format for easy copying
  passed.slice(0, 64).forEach((url) => {
    console.log(`  "${url}",`);
  });

  if (passed.length < 64) {
    console.warn(`\nWARNING: Only found ${passed.length} working servers!`);
  }
};

main();
