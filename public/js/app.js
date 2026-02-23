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
});

document.addEventListener('htmx:load', (_evt) => {
  initReverseGeocoding();
});

// Insert Accept-Language on all HTMX async requests
document.addEventListener('htmx:configRequest', (evt) => {
  evt.detail.headers['Accept-Language'] = document.documentElement.lang;
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

  // We only want to attach this global listener once
  if (!globalThis.pwaListenerAttached) {
    globalThis.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      installBtn.classList.remove('hidden');
    });
    globalThis.pwaListenerAttached = true;
  }

  if (!installBtn.dataset.listenerAttached) {
    installBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          installBtn.classList.add('hidden');
        }
        deferredPrompt = null;
      }
    });
    installBtn.dataset.listenerAttached = 'true';
  }
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
        fetch(`https://photon.komoot.io/reverse?lon=${lon}&lat=${lat}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.features && data.features.length > 0) {
              const props = data.features[0].properties;
              // Extract administrative geography, explicitly avoiding point-of-interest 'name' fields
              const parts = [];
              const city = props.city || props.town || props.village || props.county || '';
              if (city) parts.push(city);
              if (props.state && props.state !== city) parts.push(props.state);
              if (props.countrycode) parts.push(props.countrycode.toUpperCase());

              const label = parts.join(', ');
              if (label) {
                el.innerHTML = ` &bull; ${prefix} ${label}`;
              }
            }
          })
          .catch((err) => console.error('Reverse Geocoding error:', err));
      }, delay);
      delay += 1100; // Respect 1 request/second API rate limit
    }
  });
};
