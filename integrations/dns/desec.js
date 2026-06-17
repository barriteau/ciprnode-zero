/**
 * @file src/integrations/dns/desec.js
 * @description Integration with deSEC.io API for updating DNS records.
 */

import { msg } from '../../src/core/utils.js';

/**
 * @typedef {import('../../src/core/config.js').CiprNodeConfig} CiprNodeConfig
 */

/**
 * Updates the _cipr TXT record on deSEC.io.
 * @param {CiprNodeConfig} config
 * @param {string} hash - The calculated ciprHash to set.
 * @returns {Promise<boolean>} True if updated/created, false if error or no change needed.
 */
export const updateRecord = async (config, expectedHash) => {
  const token = config.dns_provider.api_token;
  const domain = config.dns_provider.zone_id || config.za;

  if (!token) {
    msg('[deSEC] Missing API Token (CIPR_DNS_API_TOKEN)', 'KO');
    return false;
  }

  const quotedHash = `"${expectedHash}"`;
  const recordName = '_cipr';
  const type = 'TXT';
  const ttl = 60;

  const baseUrl = config.dns_provider.api_url || 'https://desec.io/api/v1';
  const url = `${baseUrl}/domains/${domain}/rrsets/${recordName}/${type}/`;

  msg(`[deSEC] Checking/Updating record for ${recordName}.${domain}...`);

  try {
    const payload = {
      subname: recordName,
      type: type,
      ttl: ttl,
      records: [quotedHash],
    };

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      msg(`[deSEC] Record updated successfully.`, 'OK');
      return true;
    }

    const errText = await res.text();
    msg(`[deSEC] Update failed: ${res.status} ${res.statusText}`, 'KO');
    if (config.debug) {
      msg(`[deSEC] Response: ${errText.substring(0, 200)}`);
    }
    return false;
  } catch (error) {
    msg(`[deSEC] Error updating record: ${error.message}`, 'KO');
    return false;
  }
};
