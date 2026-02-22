/**
 * @file src/core/validator.js
 * @description Validates the Ciprnode configuration against the specification.
 */

import { logKeyValueTable } from './logger.js';

/**
 * Validates the CiprNodeConfig object.
 * Stops the process if validation fails.
 * @param {import('./config.js').CiprNodeConfig} config
 */
export function validateCiprConfig(config, exitOnFail = true) {
  let isValid = true;
  const errors = [];
  // Store validation results for a summary table
  const validations = {};

  // console.log(`Entries Validation...`);

  // Helper to log result
  function check(label, value, condition, errorMessage) {
    // Truncate for display if needed
    // let displayValue = value;
    if (typeof value === 'string' && value.length > 50) {
      displayValue = value.substring(0, 47) + '...';
    }

    validations[label] = condition ? '[OK] Valid' : '[ERR] Invalid';

    if (!condition) {
      console.warn(`${label}: Invalid`);
      console.warn(`  -> ${errorMessage}`);
      errors.push(`${label}: ${errorMessage}`);
      isValid = false;
    }
  }

  // 1. Validate ZA (Zone Apex)
  // Regex: Simple hostname validation (Spec allows unicode, but basic structure is dot separated)
  // Spec: /^[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?$/u
  const zaRegex =
    /^[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?$/u;
  check(
    'ZA (Zone Apex)',
    config.za,
    zaRegex.test(config.za),
    `Must be a valid zone apex (SLD.TLD). Current Value: "${config.za}"`,
  );

  // 2. Validate Title
  // Max 64, No Newlines
  const titleRegex = /^[^\r\n\u2028\u2029]{1,64}$/u;
  check(
    'Title',
    config.title,
    titleRegex.test(config.title),
    `Must be 1-64 chars, no newlines. Current Length: ${config.title.length}`,
  );

  // 3. Validate Description
  // Max 256, No Newlines
  const descRegex = /^[^\r\n\u2028\u2029]{1,256}$/u;
  check(
    'Description',
    config.description,
    descRegex.test(config.description),
    `Must be 1-256 chars, no newlines. Current Length: ${config.description.length}`,
  );

  // 4. Validate Keywords
  // Max 512, No Newlines
  const kwRegex = /^[^\r\n\u2028\u2029]{1,512}$/u;
  check(
    'Keywords',
    config.keywords,
    kwRegex.test(config.keywords),
    `Must be 1-512 chars, no newlines. Current Length: ${config.keywords.length}`,
  );

  // 5. Validate OL
  // 0, 1, 2, 3
  const validOl = [0, 1, 2, 3];
  check(
    'Offensiveness Level',
    config.ol,
    validOl.includes(config.ol),
    `Must be 0, 1, 2, or 3. Current Value: ${config.ol}`,
  );

  // 6. Coordinate Consistency (Latitude & Longitude)
  // Must be both present (and valid) or both null/absent.
  const hasLat = config.latitude !== null && config.latitude !== undefined;
  const hasLon = config.longitude !== null && config.longitude !== undefined;

  const coordsConsistent = (hasLat && hasLon) || (!hasLat && !hasLon);

  check(
    'Coordinate Consistency',
    `Lat: ${config.latitude}, Lon: ${config.longitude}`,
    coordsConsistent,
    `Both Latitude and Longitude must be provided, or both must be empty.`,
  );

  // 7. Validate Coordinate Values (if present)
  if (hasLat && hasLon) {
    // Latitude: Integer, +/- 900,000,000
    const isIntLat = Number.isInteger(config.latitude);
    const validLatRange = Math.abs(config.latitude) <= 900000000;
    check(
      'Latitude Value',
      config.latitude,
      isIntLat && validLatRange,
      `Must be integer between -900000000 and 900000000 (A valid WGS 84 value multiplied by 10000000). Current Value: ${config.latitude}`,
    );

    // Longitude: Integer, +/- 1,800,000,000
    const isIntLon = Number.isInteger(config.longitude);
    const validLonRange = Math.abs(config.longitude) <= 1800000000;
    check(
      'Longitude Value',
      config.longitude,
      isIntLon && validLonRange,
      `Must be integer between -1800000000 and 1800000000 (A valid WGS 84 value multiplied by 10000000). Current Value: ${config.longitude}`,
    );
  } else {
    // Log that we are skipping coords if they are empty (and consistent)
    if (coordsConsistent) {
      validations['Coordinates'] = 'Skipped (None provided)';
    }
  }

  // 8. Validate Propagation Time (Must be >= 1000ms)
  check(
    'Expected Propagation Time',
    config.expected_propagation_time,
    Number.isInteger(config.expected_propagation_time) && config.expected_propagation_time >= 1000,
    `Must be an integer >= 1000ms. Current Value: ${config.expected_propagation_time}`,
  );

  if (isValid) {
    logKeyValueTable(validations);
    console.log(`[OK] All checks passed\n`);
  } else {
    logKeyValueTable(validations);
    console.error(`[ERR] Verification Failed\n`);
    if (exitOnFail) {
      console.log('Please fix the errors in ciprnode.toml and start again.');
      errors.forEach((e) => console.log(`  - ${e}`));
      Deno.exit(1);
    } else {
      return false;
    }
  }
  return true;
}
