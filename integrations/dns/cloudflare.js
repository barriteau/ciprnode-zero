/**
 * @file src/integrations/dns/cloudflare.js
 * @description Cloudflare DNS Provider integration for automated updates.
 */

import { msg } from '../../src/core/utils.js';
import { logKeyValueTable } from '../../src/core/logger.js';

const CF_API_URL = 'https://api.cloudflare.com/client/v4';

/**
 * @typedef {import('../../src/core/config.js').CiprNodeConfig} CiprNodeConfig
 */

/**
 * Updates the _cipr TXT record on Cloudflare.
 * @param {CiprNodeConfig} config
 * @param {string} expectedHash
 * @returns {Promise<boolean>} True if updated successfully.
 */
export const updateRecord = async (config, expectedHash) => {
  const { api_token, zone_id } = config.dns_provider;

  if (!api_token) {
    msg('[CLOUDFLARE] API Token missing.', 'KO');
    return false;
  }

  const cleanToken = api_token.trim();

  const cfRequest = async (endpoint, method = 'GET', body = null) => {
    const url = `${CF_API_URL}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${cleanToken}`,
    };

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    const json = await res.json();

    if (!res.ok || !json.success) {
      const errors = json.errors ? json.errors.map((e) => e.message).join(', ') : 'Unknown error';
      throw new Error(`Cloudflare API Error: ${errors}`);
    }
    return json.result;
  };

  msg('[CLOUDFLARE] Integration');
  try {
    msg('Connecting to API...');

    let targetZoneId = zone_id;

    if (!targetZoneId) {
      msg('Auto-detecting Zone ID...');

      let zones = await cfRequest(`/zones?name=${config.za}`);

      if (!zones || zones.length === 0) {
        const parts = config.za.split('.');
        if (parts.length > 2) {
          const storedDomain = parts.slice(-2).join('.');
          zones = await cfRequest(`/zones?name=${storedDomain}`);
        }
      }

      if (!zones || zones.length === 0) {
        throw new Error(
          `Could not find Cloudflare Zone for ${config.za}. Please specify zone_id in config.`,
        );
      }

      targetZoneId = zones[0].id;
      if (config.debug) {
        msg(`[OK] Found Zone ID: ${targetZoneId.substring(0, 8)}... (${zones[0].name})`);
      }
    } else {
      if (config.debug) msg(`Using configured Zone ID: ${targetZoneId.substring(0, 8)}...`);
    }

    const searchName = `_cipr.${config.za}`;
    const quotedHash = `"${expectedHash}"`;

    msg(`Searching for: ${searchName}`);
    const records = await cfRequest(
      `/zones/${targetZoneId}/dns_records?type=TXT&name=${searchName}`,
    );

    if (records && records.length > 0) {
      const record = records[0];
      if (record.content === quotedHash) {
        msg(`[OK] Record is already up to date.`);
        return true;
      }

      msg(`Updating existing record (ID: ${record.id})...`);

      const oldValue = record.content;

      await cfRequest(`/zones/${targetZoneId}/dns_records/${record.id}`, 'PUT', {
        type: 'TXT',
        name: searchName,
        content: quotedHash,
        ttl: 60,
      });
      msg(`[OK] Record Updated Successfully`);

      logKeyValueTable({
        'Action': 'Update',
        'Old Value': oldValue.substring(0, 15) + '...',
        'New Value': quotedHash.substring(0, 15) + '...',
      });
    } else {
      msg('Creating new TXT record...');
      await cfRequest(`/zones/${targetZoneId}/dns_records`, 'POST', {
        type: 'TXT',
        name: searchName,
        content: quotedHash,
        ttl: 60,
      });
      msg(`[OK] Record Created Successfully`);
    }

    return true;
  } catch (error) {
    msg(`[CLOUDFLARE] Update Failed: ${error.message}`, 'KO');
    return false;
  }
};
