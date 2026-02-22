/**
 * @file src/api/controllers/help.js
 * @description Controller for Help Page
 */

import { render } from '../views/renderer.js';

export const get = async (req, _db, _config) => {
  // Locale Detection (Shared logic, could be a helper but strictly keeping it simple as requested)
  // TODO: Extract this if used in 3+ places
  let locale = 'en';
  const cookieHeader = req.headers.get('cookie') || '';
  const match = cookieHeader.match(/cipr_lang=([a-z]{2})/);
  if (match) {
    locale = match[1];
  } else {
    const acceptLang = req.headers.get('accept-language');
    if (acceptLang) {
      locale = acceptLang.substring(0, 2).toLowerCase();
    }
  }

  const html = render('views/help.eta', {
    stats: { count: '?', last_insert: '?' }, // Optional stats on help page?
  }, locale);

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
};
