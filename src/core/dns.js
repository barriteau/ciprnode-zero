/**
 * @file src/core/dns.js
 * @description Internal DNS client for Ciprnode.
 * Uses RFC 8484 (DNS over HTTPS) Binary Wire Format.
 * Implements Triple Validation (Consensus) logic.
 */

import { encodeBase64Url } from '@std/encoding/base64url';

/**
 * Verifies if the Ciprnode has a valid DNS entry.
 * @param {import('./config.js').CiprNodeConfig} config
 * @param {string} za
 * @param {string} expectedHash
 * @returns {Promise<boolean>} True if verified, False otherwise.
 */
export async function verifyCiprHash(config, za, expectedHash) {
  const dnsConfig = config.dns;
  if (!dnsConfig || !dnsConfig.doh || dnsConfig.doh.length < 3) {
    console.warn(
      `[CRITICAL] DNS configuration missing or insufficient DoH servers (minimum 3 required). Verification Failed.`,
    );
    return false;
  }

  const maxRetries = 8;
  const dohList = dnsConfig.doh;
  const do53List = dnsConfig.do53 || [];

  if (do53List.length === 0) {
    console.warn(
      `No Do53 servers configured. Starting in pure DoH mode (dependent on OS DNS/SNI).`,
    );
  }

  for (let i = 0; i < maxRetries; i++) {
    // Pick 3 distinct random DoH servers
    const idx1 = Math.floor(Math.random() * dohList.length);
    let idx2 = Math.floor(Math.random() * dohList.length);
    while (idx2 === idx1) {
      idx2 = Math.floor(Math.random() * dohList.length);
    }
    let idx3 = Math.floor(Math.random() * dohList.length);
    while (idx3 === idx1 || idx3 === idx2) {
      idx3 = Math.floor(Math.random() * dohList.length);
    }

    const url1 = dohList[idx1];
    const url2 = dohList[idx2];
    const url3 = dohList[idx3];

    // Pick 1 Do53 server to bootstrap this attempt
    // If list is empty, ip will be null and logic handles it
    const do53Ip = do53List.length > 0
      ? do53List[Math.floor(Math.random() * do53List.length)]
      : null;

    console.log(`Attempt ${i + 1}/${maxRetries} Starting...`);
    if (do53Ip) {
      console.log(`Selected Do53 resolver: ${do53Ip}`);
    } else {
      console.log(`No Do53 servers available. Using OS DNS.`);
    }

    console.log(`Validating via:
  1. ${new URL(url1).hostname}
  2. ${new URL(url2).hostname}
  3. ${new URL(url3).hostname}`);

    try {
      const txt1 = await queryDoHTxt(url1, `_cipr.${za}`, do53Ip);
      const txt2 = await queryDoHTxt(url2, `_cipr.${za}`, do53Ip);
      const txt3 = await queryDoHTxt(url3, `_cipr.${za}`, do53Ip);

      console.log(`Found in them:
  1: ${txt1}
  2: ${txt2}
  3: ${txt3}`);

      // Strip quotes if present (some resolvers/providers return raw quoted string)
      const cleanTxt1 = txt1 ? txt1.replace(/^"|"$/g, '') : '';
      const cleanTxt2 = txt2 ? txt2.replace(/^"|"$/g, '') : '';
      const cleanTxt3 = txt3 ? txt3.replace(/^"|"$/g, '') : '';

      if (cleanTxt1 !== expectedHash) {
        console.warn(
          `Validation Failed on Server 1 (${
            new URL(url1).hostname
          })\nFound:    ${cleanTxt1}\nExpected: ${expectedHash}`,
        );
        throw new Error('Server 1 Mismatch');
      }

      if (cleanTxt2 !== expectedHash) {
        console.warn(
          `Validation Failed on Server 2 (${
            new URL(url2).hostname
          })\nFound:    ${cleanTxt2}\nExpected: ${expectedHash}`,
        );
        throw new Error('Server 2 Mismatch');
      }

      if (cleanTxt3 !== expectedHash) {
        console.warn(
          `Validation Failed on Server 3 (${
            new URL(url3).hostname
          })\nFound:    ${cleanTxt3}\nExpected: ${expectedHash}`,
        );
        throw new Error('Server 3 Mismatch');
      }

      // All 3 Matched
      console.log(`Triple Validation Successful`);
      console.log(`The hash ${expectedHash} was found in all servers.`);
      return true;
    } catch (error) {
      console.log(`Attempt ${i + 1} failed: ${error.message}\nTrying again...`);
      // Continue to next retry
    }
  }

  console.warn(`DNS Verification failed after ${maxRetries} attempts.`);
  return false;
}

/**
 * Queries TXT record using RFC 8484 DNS over HTTPS (Wire Format).
 * Attempts to bootstrap via direct IP connection (Do53 resolution) first using Secure TLS SNI.
 * Falls back to standard fetch (OS resolution) if SNI/Handshake fails.
 */
async function queryDoHTxt(dohUrlStr, name, bootstrapIp) {
  const packet = encodeDnsQuery(name, 16); // 16 = TXT
  const base64Query = encodeBase64Url(packet);
  const originalUrl = new URL(dohUrlStr);
  const hostname = originalUrl.hostname;
  let resBody = null;
  let usedMethod = 'Standard (OS DNS)';

  // Timeout Logic
  const TIMEOUT_MS = 5000;

  try {
    if (!bootstrapIp) throw new Error('No bootstrap IP provided');

    // 1. Resolve DoH Hostname IP using Bootstrap DNS (Bypass OS DNS)
    const resolvedIps = await Deno.resolveDns(hostname, 'A', {
      nameServer: { ipAddr: bootstrapIp, port: 53 },
    });

    if (resolvedIps && resolvedIps.length > 0) {
      const dohIp = resolvedIps[0];

      // 2. Custom Secure TLS Connection (IP Connection + Hostname SNI)
      // This is the "Secure Manual Resolution" pattern replaces previous "verifyCert: false" hack.

      // A. TCP Connect to IP with Timeout
      const conn = await Promise.race([
        Deno.connect({ hostname: dohIp, port: 443 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TCP Timeout')), TIMEOUT_MS)),
      ]);

      // B. TLS Handshake with SNI (Implicitly verifies Cert against 'hostname')
      const tlsConn = await Deno.startTls(conn, { hostname: hostname });

      try {
        // C. Send minimal HTTP/1.1 Request
        const path = `${originalUrl.pathname}?dns=${base64Query}`;
        const request =
          `GET ${path} HTTP/1.1\r\nHost: ${hostname}\r\nAccept: application/dns-message\r\nConnection: close\r\n\r\n`;
        const encoder = new TextEncoder();
        await tlsConn.write(encoder.encode(request));

        // D. Read Response
        const reader = tlsConn.readable.getReader();
        const chunks = [];
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }

        // E. Parse HTTP Response (Very basic parser)
        const combined = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
        let offset = 0;
        for (const c of chunks) {
          combined.set(c, offset);
          offset += c.length;
        }

        // Find Double CRLF (Header End)
        // \r\n\r\n = 13, 10, 13, 10
        let bodyStart = -1;
        for (let i = 0; i < combined.length - 3; i++) {
          if (
            combined[i] === 13 && combined[i + 1] === 10 && combined[i + 2] === 13 &&
            combined[i + 3] === 10
          ) {
            bodyStart = i + 4;
            break;
          }
        }

        if (bodyStart !== -1) {
          // Extract body (Response should be binary DNS message)
          // Check Status Code in Header
          const headerStr = decoder.decode(combined.slice(0, bodyStart));
          if (headerStr.startsWith('HTTP/1.1 200') || headerStr.startsWith('HTTP/1.0 200')) {
            resBody = combined.slice(bodyStart);
            usedMethod = `Bootstrap[${dohIp}] via ${bootstrapIp} (Secure TLS)`;
          } else {
            throw new Error(`HTTP Error in Manual Request: ${headerStr.split('\r\n')[0]}`);
          }
        } else {
          throw new Error('Invalid HTTP Response (No Body)');
        }
      } finally {
        try {
          tlsConn.close();
        } catch {}
      }
    } else {
      throw new Error('No IP resolved');
    }
  } catch (_e) {
    // 3. Fallback: Standard Fetch (OS DNS)
    // Add Timeout Signal
    const stdUrl = new URL(dohUrlStr);
    stdUrl.searchParams.set('dns', base64Query);

    try {
      const res = await fetch(stdUrl, {
        headers: { 'Accept': 'application/dns-message' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) throw new Error(`Status ${res.status}`);
      resBody = await res.arrayBuffer();
      resBody = new Uint8Array(resBody);
      usedMethod = 'Standard (OS DNS/SNI)';
    } catch (fetchErr) {
      throw new Error(`DoH request failed (${usedMethod}): ${fetchErr.message}`);
    }
  }

  if (!resBody) {
    throw new Error(`DoH request returned no body (${usedMethod})`);
  }

  const txts = parseDnsResponse(resBody);

  if (txts.length > 0) {
    return txts[0];
  }
  return null;
}

// --- DNS Wire Format Helpers ---

function encodeDnsQuery(name, type) {
  const parts = name.split('.').filter((p) => p.length);
  let len = 12; // Header
  for (const p of parts) len += 1 + p.length;
  len += 5; // 0x00 + Type(2) + Class(2)

  const buf = new Uint8Array(len);
  const view = new DataView(buf.buffer);

  // ID (random)
  view.setUint16(0, Math.floor(Math.random() * 65535));
  // Flags (Standard Query, Recursion Desired) = 0x0100
  view.setUint16(2, 0x0100);
  // QDCOUNT = 1
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
  view.setUint16(offset, 1); // IN

  return buf;
}

function parseDnsResponse(buf) {
  const view = new DataView(buf.buffer);
  const flags = view.getUint16(2);
  const rcode = flags & 0x000F;
  const qdCount = view.getUint16(4);
  const anCount = view.getUint16(6);

  if (rcode !== 0) return [];

  let offset = 12;

  // Skip Questions
  for (let i = 0; i < qdCount; i++) {
    offset = skipName(buf, offset);
    offset += 4; // Type + Class
  }

  const results = [];

  // Read Answers
  for (let i = 0; i < anCount; i++) {
    offset = skipName(buf, offset);

    const type = view.getUint16(offset);
    offset += 2;
    const _cls = view.getUint16(offset); // class
    offset += 2;
    const _ttl = view.getUint32(offset); // ttl
    offset += 4;
    const rdLength = view.getUint16(offset);
    offset += 2;

    if (type === 16) { // TXT
      const end = offset + rdLength;
      let txt = '';
      let pos = offset;
      const decoder = new TextDecoder();

      while (pos < end) {
        const len = buf[pos];
        pos++;
        if (pos + len > end) break; // Safety
        txt += decoder.decode(buf.slice(pos, pos + len));
        pos += len;
      }
      results.push(txt);
    }

    offset += rdLength;
  }

  return results;
}

function skipName(buf, offset) {
  while (true) {
    if (offset >= buf.byteLength) return offset; // Safety
    const len = buf[offset];
    if (len === 0) {
      return offset + 1;
    }
    if ((len & 0xC0) === 0xC0) {
      return offset + 2;
    }
    offset += 1 + len;
  }
}
