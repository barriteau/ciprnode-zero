/**
 * Ciprface Client-Side Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  initSearchForm();
  initFilters();
  initLanguageSwitcher();
  initPwaInstall();
  initReverseGeocoding();
  initLanguageAutocomplete();
  initFtsValidation();
  initSearchHelp();
  initServiceWorker();
  initResindexCheck();
});

document.addEventListener('htmx:load', (_evt) => {
  initReverseGeocoding();
});

// Manage HTMX async requests globally
document.addEventListener('htmx:configRequest', (evt) => {
  // Insert Accept-Language
  evt.detail.headers['Accept-Language'] = document.documentElement.lang;

  // Handle custom HTTP methods explicitly declared via data-cipr-method attributes
  const customMethod = evt.detail.elt.getAttribute('data-cipr-method');
  if (customMethod) {
    const isIosSafari = /iP(ad|hone|od).+Version\/[\d\.]+.*Safari/i.test(navigator.userAgent);

    // Apple WebKit Workaround: iOS Safari drops request body on custom HTTP methods like QUERY.
    // By keeping the HTMX base request as a POST, we avoid data loss, and override the method via headers.
    if (isIosSafari && customMethod.toUpperCase() === 'QUERY') {
      evt.detail.verb = 'post';
      evt.detail.headers['X-HTTP-Method-Override'] = customMethod.toUpperCase();
    } else {
      evt.detail.verb = customMethod.toLowerCase();
    }
  }
});

const initAutocomplete = () => {
  const input = document.getElementById('location-search');
  if (!input) return;

  const resultsContainer = document.getElementById('autocomplete-results');
  const latInput = document.querySelector('input[name="geo_latitude"]');
  const lonInput = document.querySelector('input[name="geo_longitude"]');

  let debounceTimer;

  input.addEventListener('input', (e) => {
    const query = e.target.value;
    clearTimeout(debounceTimer);

    // Clear coords if user clears input
    if (query.length === 0) {
      latInput.value = '';
      lonInput.value = '';
    }

    if (query.length < 3) {
      resultsContainer.innerHTML = '';
      resultsContainer.classList.add('hidden');
      return;
    }

    debounceTimer = setTimeout(() => {
      fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`)
        .then((res) => res.json())
        .then((data) => {
          resultsContainer.innerHTML = '';
          if (data.features && data.features.length > 0) {
            resultsContainer.classList.remove('hidden');
            data.features.forEach((feature) => {
              const div = document.createElement('div');
              div.className = 'autocomplete-item';

              const props = feature.properties;
              let label = props.name || '';
              if (props.city && props.city !== props.name) label += `, ${props.city}`;
              if (props.state) label += `, ${props.state}`;
              if (props.country) label += `, ${props.country}`;

              div.textContent = label;

              div.addEventListener('click', () => {
                input.value = div.textContent;
                // Photon returns [lon, lat]
                latInput.value = feature.geometry.coordinates[1];
                lonInput.value = feature.geometry.coordinates[0];
                const radiusInput = document.getElementById('geo_radius');
                if (radiusInput && !radiusInput.value) {
                  radiusInput.value = '50';
                }
                resultsContainer.classList.add('hidden');
              });
              resultsContainer.appendChild(div);
            });
          } else {
            resultsContainer.classList.add('hidden');
          }
        })
        .catch((err) => console.error('Geocoding error:', err));
    }, 300);
  });

  // Hide on click outside
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !resultsContainer.contains(e.target)) {
      resultsContainer.classList.add('hidden');
    }
  });
};

const initLanguageAutocomplete = () => {
  const input = document.getElementById('language-search');
  if (!input) return;

  const resultsContainer = document.getElementById('language-autocomplete-results');
  const langInput = document.querySelector('input[name="primary_lang"]');
  const resetBtn = document.getElementById('language-reset-btn');

  let debounceTimer;

  // Show reset button if there's already a value
  if (langInput && langInput.value) {
    if (resetBtn) resetBtn.classList.remove('hidden');
  }

  input.addEventListener('input', (e) => {
    const query = e.target.value;
    clearTimeout(debounceTimer);

    if (query.length === 0) {
      langInput.value = '';
      if (resetBtn) resetBtn.classList.add('hidden');
      resultsContainer.classList.add('hidden');
      return;
    }

    if (resetBtn) resetBtn.classList.remove('hidden');

    debounceTimer = setTimeout(() => {
      fetch(`/languages/?q=${encodeURIComponent(query)}`)
        .then((res) => res.json())
        .then((data) => {
          resultsContainer.innerHTML = '';
          if (data && data.length > 0) {
            resultsContainer.classList.remove('hidden');
            data.forEach((lang) => {
              const div = document.createElement('div');
              div.className = 'autocomplete-item';
              // Display format: English - Español (es)
              div.textContent = `${lang.lang_name_en} - ${lang.lang_name} (${lang.lang_code})`;

              div.addEventListener('click', () => {
                input.value = div.textContent;
                langInput.value = lang.lang_code;
                resultsContainer.classList.add('hidden');
              });
              resultsContainer.appendChild(div);
            });
          } else {
            resultsContainer.classList.add('hidden');
          }
        })
        .catch((err) => console.error('Language fetch error:', err));
    }, 200);
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      input.value = '';
      langInput.value = '';
      resetBtn.classList.add('hidden');
      resultsContainer.classList.add('hidden');
    });
  }

  // Hide on click outside
  document.addEventListener('click', (e) => {
    if (
      !input.contains(e.target) && !resultsContainer.contains(e.target) &&
      (!resetBtn || !resetBtn.contains(e.target))
    ) {
      resultsContainer.classList.add('hidden');
    }
  });
};

const initSearchForm = () => {
  initAutocomplete();
};

const initFilters = () => {
  const olAny = document.getElementById('ol-any');
  const olInputs = document.querySelectorAll('.ol-input');

  if (olAny) {
    if (!olAny.dataset.listenerAttached) {
      olAny.addEventListener('change', (e) => {
        if (e.target.checked) {
          olInputs.forEach((input) => input.checked = false);
        }
      });
      olAny.dataset.listenerAttached = 'true';
    }
  }

  olInputs.forEach((input) => {
    if (!input.dataset.listenerAttached) {
      input.addEventListener('change', () => {
        if (input.checked && olAny) {
          olAny.checked = false;
        }

        // Check if all OL inputs are selected
        const allChecked = Array.from(olInputs).every((i) => i.checked);
        if (allChecked) {
          olInputs.forEach((i) => i.checked = false);
          if (olAny) {
            olAny.checked = true;
          }
        }
      });
      input.dataset.listenerAttached = 'true';
    }
  });

  const resetBtn = document.getElementById('reset-filters-btn');
  if (resetBtn && !resetBtn.dataset.listenerAttached) {
    resetBtn.addEventListener('click', () => {
      const form = resetBtn.closest('form');
      const filters = document.getElementById('search-filters');
      if (filters && form) {
        filters.querySelectorAll('input:not([type=checkbox]), select').forEach((i) => i.value = '');
        filters.querySelectorAll('input[type=checkbox]').forEach((i) => i.checked = false);
        if (olAny) olAny.checked = true;
        const unit = document.getElementById('geo_unit');
        if (unit) unit.value = 'km';
        htmx.trigger(form, 'submit');
      }
    });
    resetBtn.dataset.listenerAttached = 'true';
  }
};

const initLanguageSwitcher = () => {
  const switchers = document.querySelectorAll('#lang-switcher');
  switchers.forEach((switcher) => {
    if (!switcher.dataset.listenerAttached) {
      switcher.addEventListener('change', (e) => {
        document.cookie = 'cipr_lang=' + e.target.value + '; path=/; max-age=31536000';
        globalThis.location.reload();
      });
      switcher.dataset.listenerAttached = 'true';
    }
  });
};

const initPwaInstall = () => {
  let deferredPrompt;
  const installBtn = document.getElementById('pwa-install-btn');
  if (!installBtn) return;

  // 1. Check if app is already installed natively. If yes, bail out entirely.
  const isStandalone = globalThis.matchMedia('(display-mode: standalone)').matches ||
    navigator.standalone;
  if (isStandalone) {
    installBtn.classList.add('hidden');
    return;
  }

  // 2. Identify browser environment
  const ua = navigator.userAgent;
  const isIos = /iP(ad|hone|od)/.test(ua);
  const isFirefox = /Firefox/.test(ua);

  // 3. Bind the Chromium native install prompt event listener
  if (!globalThis.pwaListenerAttached) {
    globalThis.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      installBtn.classList.remove('hidden');
    });
    globalThis.pwaListenerAttached = true;
  }

  // 4. Force unhide the button for non-Chromium browsers (Safari, Firefox)
  if (isIos || isFirefox) {
    installBtn.classList.remove('hidden');
  }

  // 5. Click Handler
  if (!installBtn.dataset.listenerAttached) {
    installBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        // Native Chromium prompt
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          installBtn.classList.add('hidden');
        }
        deferredPrompt = null;
      } else if (isIos) {
        // iOS Safari manual instructions
        alert(installBtn.getAttribute('data-ios-msg'));
      } else {
        // Generic fallback instruction for Firefox/Desktop non-chromium
        alert(installBtn.getAttribute('data-fallback-msg'));
      }
    });
    installBtn.dataset.listenerAttached = 'true';
  }
};

const initSearchHelp = () => {
  const details = document.getElementById('search-help');
  if (!details) return;

  document.addEventListener('click', (e) => {
    if (!details.contains(e.target)) {
      details.removeAttribute('open');
    }
  });
};

const initFtsValidation = () => {
  const input = document.getElementById('q');
  if (!input) return;

  const validate = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return true;

    // --- Phrase search: quotes must be balanced ---
    const quoteCount = (trimmed.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) return false;

    // Strip quoted phrases so their contents don't confuse further checks.
    let stripped = trimmed.replace(/"[^"]*"/g, 'PHRASE');

    // --- NEAR() syntax validation ---
    // Valid:   NEAR(term1 term2)  or  NEAR(term1 term2, 10)
    // Invalid: NEAR()  NEAR(, 10)  NEAR(term,)  unterminated NEAR(
    const nearRegex = /NEAR\s*\(([^)]*)\)/gi;
    let nearMatch;
    while ((nearMatch = nearRegex.exec(stripped)) !== null) {
      const inner = nearMatch[1].trim();
      // Must have at least 2 whitespace-separated terms optionally followed by ", number"
      if (!/^\w[\w\s]*\w(\s*,\s*\d+)?$/.test(inner)) return false;
    }
    // Unterminated NEAR( — opening paren with no matching close
    if (/NEAR\s*\([^)]*$/i.test(stripped)) return false;
    // Strip valid NEAR() for downstream checks
    stripped = stripped.replace(/NEAR\s*\([^)]*\)/gi, 'NEAR_OK');

    // --- Column filter syntax validation ---
    // Valid:   colname : term    {col1 col2} : term
    // Invalid: : term  (no column)  colname : (no term)  { } : term (empty braces)
    // A column filter that has nothing after the ':' is invalid
    if (/:\s*$/.test(stripped)) return false;
    // A multi-column filter with empty braces is invalid
    if (/\{\s*\}\s*:/.test(stripped)) return false;
    // A bare ':' with no column name before it is invalid
    if (/(?<!\w)\s*:/.test(stripped) && !/\}\s*:/.test(stripped)) return false;
    // Strip valid column filters so they don't interfere with paren checks
    stripped = stripped.replace(/\{[^}]+\}\s*:/g, '');
    stripped = stripped.replace(/\w+\s*:/g, '');

    // --- Prefix search: '*' only valid at END of a word token ---
    if (/\*[^\s)]/.test(stripped)) return false; // *word or wo*rd
    if (/(?<!\w)\*/.test(stripped)) return false; // leading star

    // --- Initial token: '^' only valid at START of a term ---
    if (/\w\^/.test(stripped)) return false; // trailing or mid-word caret
    if (/\^\s/.test(stripped)) return false; // lone ^ followed by space

    // --- Balanced parentheses ---
    let depth = 0;
    for (const ch of stripped) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (depth < 0) return false;
    }
    if (depth !== 0) return false;

    // --- Hanging binary operators at the very start or end ---
    if (/^(AND|OR)\b/i.test(stripped)) return false;
    if (/\b(AND|OR|NOT)$/i.test(stripped)) return false;

    // --- Consecutive binary operators (e.g. "AND OR") ---
    if (/\b(AND|OR|NOT)\s+(AND|OR)\b/i.test(stripped)) return false;

    return true;
  };

  input.addEventListener('input', () => {
    input.classList.toggle('fts-invalid', !validate(input.value));
  });
};

const initReverseGeocoding = () => {
  const elements = document.querySelectorAll('.reverse-geocode:not([data-geocoded])');
  if (elements.length === 0) return;

  let delay = 0;
  elements.forEach((el) => {
    el.dataset.geocoded = 'true';
    const lat = el.dataset.lat;
    const lon = el.dataset.lon;
    const prefix = el.dataset.prefix || 'Near';

    if (lat && lon) {
      setTimeout(() => {
        fetchCached(`https://photon.komoot.io/reverse?lon=${lon}&lat=${lat}`, 240000)
          .then((data) => {
            if (data && data.features && data.features.length > 0) {
              const props = data.features[0].properties;
              // Extract administrative geography, explicitly avoiding point-of-interest 'name' fields
              const parts = [];
              const city = props.city || props.town || props.village || props.county || '';
              if (city) parts.push(city);
              if (props.state && props.state !== city) parts.push(props.state);
              if (props.countrycode) parts.push(props.countrycode.toUpperCase());

              const label = parts.join(', ');
              if (label) {
                el.innerHTML = ` • ${prefix} ${label}`;
              }
            }
          })
          .catch((err) => console.error('Reverse Geocoding error:', err));
      }, delay);
      delay += 1100; // Respect 1 request/second API rate limit
    }
  });
};

/**
 * Generic cached wrapper for `fetch` using `sessionStorage`.
 * @param {string} url - The URL to fetch
 * @param {number} ttlMs - Time to live in milliseconds (e.g. 240000 for 4 mins)
 * @returns {Promise<any>} JSON payload or null
 */
const fetchCached = async (url, ttlMs = 240000) => {
  const cacheKey = `cipr_cache_${url}`;
  const cachedItemStr = sessionStorage.getItem(cacheKey);

  if (cachedItemStr) {
    try {
      const cachedItem = JSON.parse(cachedItemStr);
      if (Date.now() < cachedItem.expiry) {
        return cachedItem.data;
      }
    } catch (_e) {
      sessionStorage.removeItem(cacheKey);
    }
  }

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    const item = {
      data: data,
      expiry: Date.now() + ttlMs,
    };

    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(item));
    } catch (e) {
      console.warn('sessionStorage full, skipping cache write.');
    }

    return data;
  } catch (e) {
    console.error(`Failed to fetch ${url}`, e);
    return null;
  }
};

/**
 * Pings `HEAD /ri/` on startup and caches the result for 4 minutes using SessionStorage.
 */
const initResindexCheck = async () => {
  const cacheKey = 'cipr_ri_available';
  const cachedItemStr = sessionStorage.getItem(cacheKey);
  let isAvailable = false;

  if (cachedItemStr) {
    try {
      const cachedItem = JSON.parse(cachedItemStr);
      if (Date.now() < cachedItem.expiry) {
        isAvailable = cachedItem.data;
        toggleResindexUI(isAvailable);
        return;
      }
    } catch (_e) {
      sessionStorage.removeItem(cacheKey);
    }
  }

  try {
    const response = await fetch('/ri/', { method: 'HEAD' });
    isAvailable = response.ok; // 200 OK means it has providers. 501 means it doesn't.

    sessionStorage.setItem(
      cacheKey,
      JSON.stringify({
        data: isAvailable,
        expiry: Date.now() + 240000, // 4 minutes
      }),
    );
  } catch (e) {
    isAvailable = false;
  }

  toggleResindexUI(isAvailable);
};

const toggleResindexUI = (isAvailable) => {
  const riElements = document.querySelectorAll('[data-requires-ri="true"]');
  riElements.forEach((el) => {
    if (isAvailable) {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });
};

const initServiceWorker = () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New update available
            const toast = document.getElementById('pwa-update-toast');
            if (toast) {
              toast.classList.remove('hidden');
              const reloadBtn = document.getElementById('pwa-reload-btn');
              if (reloadBtn) {
                reloadBtn.addEventListener('click', () => {
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                });
              }
            }
          }
        });
      });
    }).catch((err) => console.error('SW Registration failed', err));

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        globalThis.location.reload();
      }
    });
  }
};
