/**
 * @file src/integrations/dns/cloudflare.js
 * @description Cloudflare DNS Provider integration for automated updates.
 */



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
  // Cloudflare usually expects the record name to be relative or absolute.
  // Generally using the FQDN is safest.

  if (!api_token) {
    console.error(`[ERROR] Cloudflare API Token missing.`);
    return false;
  }

  const cleanToken = api_token.trim();
  console.log(
    `[CLOUDFLARE] Token: ${cleanToken.substring(0, 4)}... (Length: ${cleanToken.length})`,
  );

  /**
   * Helper for fetch
   */
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

  console.log(`[CLOUDFLARE] Integration`);
  try {
    console.log('Connecting to API...');

    // 1. Resolve Zone ID
    let targetZoneId = zone_id;

    if (!targetZoneId) {
      console.log('Auto-detecting Zone ID...');
      // Need to find the zone matching the za.
      // If za is sub.domain.com, the zone might be domain.com.
      // Cloudflare "List Zones" endpoint filters by name. exact match?
      // Try searching for the za first.

      // Strategy: Search for za. If empty, try stripping subdomains?
      // Better: Cloudflare API allows finding the zone containing a hostname? No.
      // We assume za is the zone or the domain is the zone.

      // Heuristic 1: Exact Match (for Apex domains)
      let zones = await cfRequest(`/zones?name=${config.za}`);

      if (!zones || zones.length === 0) {
        // Heuristic 2: Try parent domain (e.g. if za is cipr.barriteau.net, zone is barriteau.net)
        const parts = config.za.split('.');
        if (parts.length > 2) {
          const storedDomain = parts.slice(-2).join('.'); // barriteau.net
          zones = await cfRequest(`/zones?name=${storedDomain}`);
        }
      }

      if (!zones || zones.length === 0) {
        throw new Error(
          `Could not find Cloudflare Zone for ${config.za}. Please specify zone_id in config.`,
        );
      }

      targetZoneId = zones[0].id;
      console.log(`[OK] Found Zone ID: ${targetZoneId} (${zones[0].name})`);
    } else {
      console.log(`Using configured Zone ID: ${targetZoneId}`);
    }

    // 2. Search for existing Record
    // Name must be exact match query
    // API filters by 'name' which is the FQDN.
    const searchName = `_cipr.${config.za}`;
    const quotedHash = `"${expectedHash}"`;

    console.log(`Searching for: ${searchName}`);
    const records = await cfRequest(
      `/zones/${targetZoneId}/dns_records?type=TXT&name=${searchName}`,
    );

    if (records && records.length > 0) {
      // Update Existing
      const record = records[0];
      if (record.content === quotedHash) {
        console.log(`[OK] Record is already up to date.`);
        // console.groupEnd();
        return true;
      }

      console.log(`Updating existing record (ID: ${record.id})...`);

      const oldValue = record.content;

      await cfRequest(`/zones/${targetZoneId}/dns_records/${record.id}`, 'PUT', {
        type: 'TXT',
        name: searchName,
        content: quotedHash,
        ttl: 60, // Short TTL for fast propagation
      });
      console.log(`[OK] Record Updated Successfully`);

      // Console Table for Change
      logKeyValueTable({
        'Action': 'Update',
        'Old Value': oldValue.substring(0, 15) + '...',
        'New Value': quotedHash.substring(0, 15) + '...',
      });
    } else {
      // Create New
      console.log('Creating new TXT record...');
      await cfRequest(`/zones/${targetZoneId}/dns_records`, 'POST', {
        type: 'TXT',
        name: searchName,
        content: quotedHash,
        ttl: 60,
      });
      console.log(`[OK] Record Created Successfully`);
    }

    // console.groupEnd();
    return true;
  } catch (error) {
    console.error(`[ERROR] Cloudflare Update Failed: ${error.message}`);
    // console.groupEnd();
    return false;
  }
};
