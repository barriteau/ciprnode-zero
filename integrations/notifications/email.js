/**
 * @file integrations/notifications/email.js
 * @description Email notification provider using raw SMTP with STARTTLS.
 * Zero external dependencies — uses Deno.connectTls() and Deno.startTls().
 *
 * Exports:
 *   send(subject, body, smtpConfig) → Promise<boolean>
 *
 * smtpConfig shape:
 *   { smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, smtp_to }
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Reads a single SMTP response line (may be multi-line with continuation codes).
 * @param {Deno.TcpConn|Deno.TlsConn} conn
 * @returns {Promise<{code: number, text: string}>}
 */
const readResponse = async (conn) => {
  let full = '';
  while (true) {
    const buf = new Uint8Array(4096);
    const n = await conn.read(buf);
    if (n === null) throw new Error('SMTP connection closed by server');
    full += decoder.decode(buf.subarray(0, n));
    const lines = full.split('\r\n').filter((l) => l.length > 0);
    if (lines.length === 0) continue;
    const lastLine = lines[lines.length - 1];
    if (/^\d{3} /.test(lastLine)) break;
  }
  const lines = full.trim().split('\r\n');
  const last = lines[lines.length - 1];
  const code = parseInt(last.substring(0, 3), 10);
  return { code, text: last };
};

/**
 * Sends a command and reads the response.
 * @param {Deno.TcpConn|Deno.TlsConn} conn
 * @param {string} cmd
 * @returns {Promise<{code: number, text: string}>}
 */
const command = async (conn, cmd) => {
  await conn.write(encoder.encode(cmd + '\r\n'));
  return await readResponse(conn);
};

/**
 * Sends an email via SMTP with STARTTLS.
 * @param {string} subject - Email subject line.
 * @param {string} body - Plain text email body.
 * @param {Object} smtpConfig - SMTP connection parameters.
 * @param {string} smtpConfig.smtp_host
 * @param {number} smtpConfig.smtp_port
 * @param {string} smtpConfig.smtp_user
 * @param {string} smtpConfig.smtp_pass
 * @param {string} smtpConfig.smtp_from
 * @param {string} smtpConfig.smtp_to
 * @returns {Promise<boolean>} True if the email was accepted by the server.
 */
export const send = async (subject, body, smtpConfig) => {
  const { smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, smtp_to } = smtpConfig;

  if (!smtp_host || !smtp_port || !smtp_user || !smtp_pass || !smtp_from || !smtp_to) {
    return false;
  }

  let conn;
  try {
    conn = await Deno.connect({ hostname: smtp_host, port: smtp_port, transport: 'tcp' });

    let res = await readResponse(conn);
    if (res.code !== 220) throw new Error(`Unexpected greeting: ${res.code} ${res.text}`);

    res = await command(conn, `EHLO ciprnode`);
    if (res.code !== 250) throw new Error(`EHLO failed: ${res.code} ${res.text}`);

    res = await command(conn, 'STARTTLS');
    if (res.code !== 220) throw new Error(`STARTTLS rejected: ${res.code} ${res.text}`);

    conn = await Deno.startTls(conn, { hostname: smtp_host });

    res = await command(conn, `EHLO ciprnode`);
    if (res.code !== 250) throw new Error(`EHLO (TLS) failed: ${res.code} ${res.text}`);

    res = await command(conn, 'AUTH LOGIN');
    if (res.code !== 334) throw new Error(`AUTH LOGIN rejected: ${res.code} ${res.text}`);

    res = await command(conn, btoa(smtp_user));
    if (res.code !== 334) throw new Error(`Username rejected: ${res.code} ${res.text}`);

    res = await command(conn, btoa(smtp_pass));
    if (res.code !== 235) throw new Error(`Password rejected: ${res.code} ${res.text}`);

    res = await command(conn, `MAIL FROM:<${smtp_from}>`);
    if (res.code !== 250) throw new Error(`MAIL FROM rejected: ${res.code} ${res.text}`);

    res = await command(conn, `RCPT TO:<${smtp_to}>`);
    if (res.code !== 250 && res.code !== 251) throw new Error(`RCPT TO rejected: ${res.code} ${res.text}`);

    res = await command(conn, 'DATA');
    if (res.code !== 354) throw new Error(`DATA rejected: ${res.code} ${res.text}`);

    const date = new Date().toUTCString();
    const message = [
      `From: ${smtp_from}`,
      `To: ${smtp_to}`,
      `Subject: ${subject}`,
      `Date: ${date}`,
      `X-Ciprnode: https://cipr.info`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      body,
      '.',
      '',
    ].join('\r\n');

    await conn.write(encoder.encode(message));
    res = await readResponse(conn);
    if (res.code !== 250) throw new Error(`Message rejected: ${res.code} ${res.text}`);

    await command(conn, 'QUIT');
    return true;
  } catch (e) {
    console.error(`[email] SMTP send failed: ${e.message}`);
    return false;
  } finally {
    try { conn?.close(); } catch { /* ignore */ }
  }
};
