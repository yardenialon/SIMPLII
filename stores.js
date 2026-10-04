/* =============================================================================
   SimpliiGood — self-hosted store locator (Mapbox GL)
   Shared by store-locator.html and simpliigreen.html (#stores).

   TO GO LIVE YOU FILL IN TWO THINGS BELOW:
     1) SIMPLII_MAPBOX_TOKEN — your Mapbox *public* access token (pk.****).
        Create a free one at https://account.mapbox.com/access-tokens/
     2) SIMPLII_STORES       — your real store list (replace the samples).
                               Each store needs lat/lng. Get coordinates by
                               right-clicking the spot in Google Maps → the
                               first number is lat, the second is lng.

   Everything else is automatic: markers, search, the synced list,
   "use my location", fit-to-bounds, and reduced-motion handling.
   ========================================================================== */

/* 1) ---- Mapbox public token -------------------------------------------- */
const SIMPLII_MAPBOX_TOKEN = 'pk.eyJ1IjoiYWxvbnlhIiwiYSI6ImNtcDFvNnJrMDA1aDIycHIxNXlkcDlwNHYifQ.ZtByN_PWknNPBzGryBwQ7Q';

/* 2) ---- Store list (REPLACE THESE SAMPLES WITH REAL STORES) ------------- */
/*    name    : shop/partner name
 *    address : street line shown in the list + popup
 *    city    : used by search and the list
 *    lat,lng : REQUIRED coordinates (decimal degrees)
 *    url     : optional link (website / Google Maps)
 *    phone   : optional phone number
 */
const SIMPLII_STORES = [
  // ↓↓↓ SAMPLE DATA — delete and add your own ↓↓↓
  {
    name: 'Sample Market — Tel Aviv',
    address: 'Rothschild Blvd 1',
    city: 'Tel Aviv',
    lat: 32.0631,
    lng: 34.7708,
    url: '',
    phone: '',
  },
  {
    name: 'Sample Grocer — Jerusalem',
    address: 'Jaffa St 10',
    city: 'Jerusalem',
    lat: 31.7857,
    lng: 35.2144,
    url: '',
    phone: '',
  },
  {
    name: 'Sample Health Store — Haifa',
    address: 'HaNassi Ave 20',
    city: 'Haifa',
    lat: 32.8156,
    lng: 34.9892,
    url: '',
    phone: '',
  },
  // ↑↑↑ SAMPLE DATA — delete and add your own ↑↑↑
];

/* ---- Implementation (no need to edit below this line) ------------------- */
(function () {
  'use strict';

  const BRAND = { pin: '#154048', pinAccent: '#31B278' };
  const hasToken =
    typeof SIMPLII_MAPBOX_TOKEN === 'string' &&
    SIMPLII_MAPBOX_TOKEN.startsWith('pk.');
  const prefersReduced =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[c];
    });
  }

  function haversineKm(a, b) {
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const la1 = (a.lat * Math.PI) / 180;
    const la2 = (b.lat * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function popupHTML(s) {
    const parts = [];
    parts.push('<strong class="sg-pop-name">' + esc(s.name) + '</strong>');
    const line = [s.address, s.city].filter(Boolean).map(esc).join(', ');
    if (line) parts.push('<span class="sg-pop-addr">' + line + '</span>');
    if (s.phone)
      parts.push(
        '<a class="sg-pop-link" href="tel:' +
          esc(s.phone.replace(/\s+/g, '')) +
          '">' +
          esc(s.phone) +
          '</a>'
      );
    if (s.url)
      parts.push(
        '<a class="sg-pop-link" href="' +
          esc(s.url) +
          '" target="_blank" rel="noopener">Directions →</a>'
      );
    return '<div class="sg-pop">' + parts.join('') + '</div>';
  }

  function renderFallback(container, listEl) {
    if (container) {
      container.innerHTML =
        '<div class="sg-map-missing">' +
        '<p><strong>Map isn’t configured yet.</strong></p>' +
        (hasToken
          ? '<p>No stores to show. Add locations in <code>stores.js</code>.</p>'
          : '<p>Add your Mapbox public token in <code>stores.js</code> ' +
            '(<code>SIMPLII_MAPBOX_TOKEN</code>) to enable the map.</p>') +
        '</div>';
    }
    // The list still renders so visitors can see stockists regardless.
    if (listEl) buildList(listEl, SIMPLII_STORES, null, null);
  }

  function buildList(listEl, stores, onPick, origin) {
    if (!listEl) return;
    if (!stores.length) {
      listEl.innerHTML =
        '<li class="sg-empty">No stores match your search.</li>';
      return;
    }
    let items = stores.slice();
    if (origin) {
      items.forEach(function (s) {
        s._km = haversineKm(origin, s);
      });
      items.sort(function (a, b) {
        return a._km - b._km;
      });
    }
    listEl.innerHTML = '';
    items.forEach(function (s) {
      const li = document.createElement('li');
      const dist =
        s._km != null
          ? '<span class="sg-item-dist">' + s._km.toFixed(1) + ' km</span>'
          : '';
      li.className = 'sg-item';
      li.innerHTML =
        '<button type="button" class="sg-item-btn">' +
        '<span class="sg-item-name">' +
        esc(s.name) +
        dist +
        '</span>' +
        '<span class="sg-item-addr">' +
        esc([s.address, s.city].filter(Boolean).join(', ')) +
        '</span>' +
        '</button>';
      if (onPick) {
        li.querySelector('.sg-item-btn').addEventListener('click', function () {
          onPick(s);
        });
      }
      listEl.appendChild(li);
    });
  }

  function init(opts) {
    const container = document.getElementById(opts.container);
    const listEl = opts.list ? document.getElementById(opts.list) : null;
    const searchEl = opts.search ? document.getElementById(opts.search) : null;
    if (!container) return;

    const stores = SIMPLII_STORES.filter(
      function (s) {
        return typeof s.lat === 'number' && typeof s.lng === 'number';
      }
    );

    if (!hasToken || !window.mapboxgl || !stores.length) {
      renderFallback(container, listEl);
      return;
    }

    mapboxgl.accessToken = SIMPLII_MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: opts.container,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: opts.center || [stores[0].lng, stores[0].lat],
      zoom: opts.zoom || 6,
      cooperativeGestures: true,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    const geo = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
      showUserHeading: false,
    });
    map.addControl(geo, 'top-right');

    const markers = new Map(); // store -> mapboxgl.Marker

    function flyTo(s) {
      const opt = { center: [s.lng, s.lat], zoom: 13 };
      if (prefersReduced) map.jumpTo(opt);
      else map.flyTo(Object.assign({ speed: 1.2 }, opt));
      const m = markers.get(s);
      if (m) m.togglePopup();
    }

    function addMarkers(list) {
      markers.forEach(function (m) {
        m.remove();
      });
      markers.clear();
      const bounds = new mapboxgl.LngLatBounds();
      list.forEach(function (s) {
        const popup = new mapboxgl.Popup({ offset: 24, closeButton: false }).setHTML(
          popupHTML(s)
        );
        const marker = new mapboxgl.Marker({ color: BRAND.pin })
          .setLngLat([s.lng, s.lat])
          .setPopup(popup)
          .addTo(map);
        markers.set(s, marker);
        bounds.extend([s.lng, s.lat]);
      });
      if (list.length === 1) {
        map.setCenter([list[0].lng, list[0].lat]);
        map.setZoom(13);
      } else if (list.length > 1) {
        map.fitBounds(bounds, { padding: 60, duration: prefersReduced ? 0 : 800 });
      }
    }

    function apply(list, origin) {
      addMarkers(list);
      buildList(listEl, list, flyTo, origin);
    }

    map.on('load', function () {
      apply(stores, null);
    });

    // Search by name / city / address.
    if (searchEl) {
      let t;
      searchEl.addEventListener('input', function () {
        clearTimeout(t);
        t = setTimeout(function () {
          const q = searchEl.value.trim().toLowerCase();
          if (!q) {
            apply(stores, null);
            return;
          }
          const filtered = stores.filter(function (s) {
            return (
              (s.name || '').toLowerCase().indexOf(q) > -1 ||
              (s.city || '').toLowerCase().indexOf(q) > -1 ||
              (s.address || '').toLowerCase().indexOf(q) > -1
            );
          });
          apply(filtered, null);
        }, 180);
      });
    }

    // Sort list by distance when the visitor shares their location.
    geo.on('geolocate', function (e) {
      const origin = { lat: e.coords.latitude, lng: e.coords.longitude };
      buildList(listEl, stores, flyTo, origin);
    });
  }

  window.SimpliiStoreLocator = { init: init };
})();
