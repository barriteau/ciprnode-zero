/**
 * @file src/integrations/dns/desec.js
 * @description Integration with deSEC.io API for updating DNS records.
 */

/**
 * @typedef {import('../../src/core/config.js').CiprNodeConfig} CiprNodeConfig
 */

/**
 * Updates the _cipr TXT record on deSEC.io.
 * @param {CiprNodeConfig} config
 * @param {string} hash - The calculated ciprHash to set.
 * @returns {Promise<boolean>} True if updated/created, false if error or no change needed.
 */
export const updateRecord = async (config, _expectedHash) => {
  const token = config.dns_provider.api_token;
  // If zone_id is not provided, we might try to infer it from config.za
  // deSEC uses the domain name as the identifier in the URL.
  const domain = config.dns_provider.zone_id || config.za;

  if (!token) {
    console.error('[deSEC] Missing API Token (CIPR_DNS_API_TOKEN)');
    return false;
  }

  // Ensure hash is quoted for TXT record
  const quotedHash = `"${hash}"`;
  const recordName = '_cipr';
  const type = 'TXT';
  const ttl = 60;

  const baseUrl = config.dns_provider.api_url || 'https://desec.io/api/v1';
  const url = `${baseUrl}/domains/${domain}/rrsets/${recordName}/${type}/`;

  console.log(`[deSEC] Checking/Updating record for ${recordName}.${domain}...`);

  try {
    // 1. Get existing record to compare?
    // deSEC allows PUT to overwrite/create.
    // To minimize API calls, we could just PUT.
    // However, the main loop calls this only on mismatch, so we can assume we need to update.
    // Spec: https://desec.readthedocs.io/en/latest/dns/rrsets.html#creating-modifying-an-rrset

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
      console.log(`[deSEC] Record updated successfully.`);
      return true;
    } else {
      const errText = await res.text();
      console.error(`[deSEC] Update failed: ${res.status} ${res.statusText}`);
      console.error(`Response: ${errText}`);
      return false;
    }
  } catch (error) {
    console.error(`[deSEC] Error updating record:`, error);
    return false;
  }
};
