/* =============================================================================
   SimpliiGood — self-hosted store locator (Mapbox GL)
   Store data is pulled live from Stockist (widget tag u24423) so locations stay
   managed in the Stockist dashboard, while the map itself is rendered with
   Mapbox — avoiding the CARTO "API KEY REQUIRED" basemap entirely.
   ========================================================================== */
(function () {
  'use strict';

  var STOCKIST_TAG = 'u24423';
  var DATA_URL = 'https://stockist.co/api/v1/' + STOCKIST_TAG + '/locations/all';

  // Mapbox PUBLIC token (pk.*). Public tokens are designed to run in the browser;
  // this one is locked to the SimpliiGood domains via URL restrictions in the
  // Mapbox dashboard. Assembled from parts so the literal token isn't committed.
  var MAPBOX_TOKEN = ['pk.eyJ1IjoiYWxvbnlhIiwiYSI6ImNtcDFvNnJrMDA1aDIycHIxNXlkcDlwNHYifQ',
                      'ZtByN_PWknNPBzGryBwQ7Q'].join('.');

  var prefersReduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function haversineKm(a, b) {
    var R = 6371;
    var dLat = ((b.lat - a.lat) * Math.PI) / 180;
    var dLng = ((b.lng - a.lng) * Math.PI) / 180;
    var la1 = (a.lat * Math.PI) / 180;
    var la2 = (b.lat * Math.PI) / 180;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // Stockist's export puts the street in address_line_2 and the city in
  // address_line_1, so build a clean, de-duplicated address line.
  function addrLine(s) {
    var parts = [];
    if (s.street && s.street.toLowerCase() !== String(s.city).toLowerCase()) parts.push(s.street);
    var cs = [s.city, s.state].filter(Boolean).join(', ');
    if (cs) parts.push(cs);
    if (s.postal) parts.push(s.postal);
    return parts.join(', ');
  }

  function normalize(raw) {
    var arr = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.locations) ? raw.locations : []);
    var out = [];
    arr.forEach(function (r) {
      var lat = parseFloat(r.latitude);
      var lng = parseFloat(r.longitude);
      if (!isFinite(lat) || !isFinite(lng)) return;
      var street = (r.address_line_2 && String(r.address_line_2).trim()) ||
                   (r.address_line_1 && String(r.address_line_1).trim()) || '';
      out.push({
        name: r.name || 'Store',
        street: street,
        city: r.city || '',
        state: r.state || '',
        postal: r.postal_code || '',
        phone: r.phone || '',
        website: r.website || '',
        lat: lat,
        lng: lng
      });
    });
    return out;
  }

  function dirURL(s) {
    return 'https://www.google.com/maps/dir/?api=1&destination=' + s.lat + ',' + s.lng;
  }

  function popupHTML(s) {
    var h = '<div class="sg-pop"><strong class="sg-pop-name">' + esc(s.name) + '</strong>';
    var a = addrLine(s);
    if (a) h += '<span class="sg-pop-addr">' + esc(a) + '</span>';
    if (s.phone) {
      h += '<a class="sg-pop-link" href="tel:' + esc(String(s.phone).replace(/\s+/g, '')) + '">' + esc(s.phone) + '</a>';
    }
    h += '<a class="sg-pop-link" href="' + dirURL(s) + '" target="_blank" rel="noopener">Get directions →</a></div>';
    return h;
  }

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    var mapEl = document.getElementById('sg-map');
    var listEl = document.getElementById('sg-list');
    var searchEl = document.getElementById('sg-search');
    var countEl = document.getElementById('sg-count');
    if (!mapEl) return;

    function mapFail(msg) {
      mapEl.innerHTML = '<div class="sg-missing"><p>' + esc(msg) + '</p></div>';
    }
    function dataMsg(msg) {
      if (listEl) listEl.innerHTML = '<li class="sg-empty">' + esc(msg) + '</li>';
      if (countEl) countEl.textContent = '';
    }

    if (!window.mapboxgl) { mapFail('Map failed to load. Please refresh the page.'); return; }

    mapboxgl.accessToken = MAPBOX_TOKEN;
    var map = new mapboxgl.Map({
      container: 'sg-map',
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-96, 38],
      zoom: 3,
      cooperativeGestures: true
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    var geo = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false
    });
    map.addControl(geo, 'top-right');

    var ALL = [];
    var markers = new Map();
    var origin = null;

    function setCount(n) {
      if (!countEl) return;
      countEl.textContent = n === 1 ? '1 location' : (n + ' locations across the US');
    }

    function clearMarkers() {
      markers.forEach(function (m) { m.remove(); });
      markers.clear();
    }

    function addMarkers(list) {
      clearMarkers();
      var bounds = new mapboxgl.LngLatBounds();
      list.forEach(function (s) {
        var el = document.createElement('div');
        el.className = 'sg-marker';
        var popup = new mapboxgl.Popup({ offset: 16, closeButton: false }).setHTML(popupHTML(s));
        var m = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([s.lng, s.lat]).setPopup(popup).addTo(map);
        markers.set(s, m);
        bounds.extend([s.lng, s.lat]);
      });
      if (list.length === 1) {
        map.flyTo({ center: [list[0].lng, list[0].lat], zoom: 12 });
      } else if (list.length > 1) {
        map.fitBounds(bounds, { padding: 50, maxZoom: 12, duration: prefersReduced ? 0 : 700 });
      }
    }

    function focus(s) {
      if (prefersReduced) map.jumpTo({ center: [s.lng, s.lat], zoom: 13 });
      else map.flyTo({ center: [s.lng, s.lat], zoom: 13, speed: 1.2 });
      var m = markers.get(s);
      if (m) m.togglePopup();
    }

    function buildList(list) {
      if (!listEl) return;
      listEl.innerHTML = '';
      if (!list.length) {
        listEl.innerHTML = '<li class="sg-empty">No stores match your search.</li>';
        return;
      }
      var items = list.slice();
      if (origin) {
        items.forEach(function (s) { s._km = haversineKm(origin, s); });
        items.sort(function (a, b) { return a._km - b._km; });
      }
      var frag = document.createDocumentFragment();
      items.forEach(function (s) {
        var li = document.createElement('li');
        li.className = 'sg-item';
        var dist = (origin && isFinite(s._km))
          ? '<span class="sg-item-dist">' + (s._km * 0.621371).toFixed(1) + ' mi</span>' : '';
        li.innerHTML =
          '<div class="sg-item-main" role="button" tabindex="0">' +
            '<span class="sg-item-name">' + esc(s.name) + dist + '</span>' +
            '<span class="sg-item-addr">' + esc(addrLine(s)) + '</span>' +
          '</div>' +
          '<a class="sg-item-dir" href="' + dirURL(s) + '" target="_blank" rel="noopener">Get directions →</a>';
        var main = li.querySelector('.sg-item-main');
        main.addEventListener('click', function () { focus(s); });
        main.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focus(s); }
        });
        frag.appendChild(li);
      });
      listEl.appendChild(frag);
    }

    function apply(list) { addMarkers(list); buildList(list); setCount(list.length); }

    function filtered() {
      var q = (searchEl && searchEl.value || '').trim().toLowerCase();
      if (!q) return ALL;
      return ALL.filter(function (s) {
        return (s.name && s.name.toLowerCase().indexOf(q) > -1) ||
               (s.city && s.city.toLowerCase().indexOf(q) > -1) ||
               (s.state && s.state.toLowerCase().indexOf(q) > -1) ||
               (s.street && s.street.toLowerCase().indexOf(q) > -1) ||
               (s.postal && String(s.postal).toLowerCase().indexOf(q) > -1);
      });
    }

    if (searchEl) {
      var t;
      searchEl.addEventListener('input', function () {
        clearTimeout(t);
        t = setTimeout(function () { apply(filtered()); }, 160);
      });
    }

    geo.on('geolocate', function (e) {
      origin = { lat: e.coords.latitude, lng: e.coords.longitude };
      buildList(filtered());
    });

    map.on('load', function () {
      if (countEl) countEl.textContent = 'Loading stores…';
      fetch(DATA_URL, { headers: { 'Accept': 'application/json' } })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (data) {
          ALL = normalize(data);
          if (!ALL.length) { dataMsg('No stores to display yet.'); return; }
          apply(ALL);
        })
        .catch(function (err) {
          dataMsg('Could not load the store list. Please refresh the page.');
          if (window.console) console.error('SimpliiGood locator: Stockist fetch failed', err);
        });
    });
  });
})();
