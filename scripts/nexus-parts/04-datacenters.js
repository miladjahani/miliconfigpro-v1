/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Cloudflare Datacenter Database — 57+ PoPs with real coordinates
   ══════════════════════════════════════════════════════════════════════════════ */
const 站點 = [
  /* ─── North America ─── */
  { id: 'IAD', name: 'Ashburn', cc: 'US', lat: 39.0438, lon: -77.4874 },
  { id: 'EWR', name: 'Newark', cc: 'US', lat: 40.6925, lon: -74.1724 },
  { id: 'ORD', name: 'Chicago', cc: 'US', lat: 41.9742, lon: -87.9073 },
  { id: 'DFW', name: 'Dallas', cc: 'US', lat: 32.8998, lon: -97.0403 },
  { id: 'LAX', name: 'Los Angeles', cc: 'US', lat: 33.9416, lon: -118.4085 },
  { id: 'SJC', name: 'San Jose', cc: 'US', lat: 37.3382, lon: -121.8863 },
  { id: 'SEA', name: 'Seattle', cc: 'US', lat: 47.6062, lon: -122.3321 },
  { id: 'MIA', name: 'Miami', cc: 'US', lat: 25.7617, lon: -80.1918 },
  { id: 'ATL', name: 'Atlanta', cc: 'US', lat: 33.749, lon: -84.388 },
  { id: 'BOS', name: 'Boston', cc: 'US', lat: 42.3601, lon: -71.0589 },
  { id: 'DEN', name: 'Denver', cc: 'US', lat: 39.7392, lon: -104.9903 },
  { id: 'PHX', name: 'Phoenix', cc: 'US', lat: 33.4484, lon: -112.074 },
  { id: 'YYZ', name: 'Toronto', cc: 'CA', lat: 43.6532, lon: -79.3832 },
  { id: 'YVR', name: 'Vancouver', cc: 'CA', lat: 49.2827, lon: -123.1207 },
  { id: 'MEX', name: 'Mexico City', cc: 'MX', lat: 19.4326, lon: -99.1332 },

  /* ─── Europe ─── */
  { id: 'LHR', name: 'London', cc: 'GB', lat: 51.5074, lon: -0.1278 },
  { id: 'CDG', name: 'Paris', cc: 'FR', lat: 48.8566, lon: 2.3522 },
  { id: 'FRA', name: 'Frankfurt', cc: 'DE', lat: 50.1109, lon: 8.6821 },
  { id: 'AMS', name: 'Amsterdam', cc: 'NL', lat: 52.3676, lon: 4.9041 },
  { id: 'WAW', name: 'Warsaw', cc: 'PL', lat: 52.2297, lon: 21.0122 },
  { id: 'MAD', name: 'Madrid', cc: 'ES', lat: 40.4168, lon: -3.7038 },
  { id: 'MXP', name: 'Milan', cc: 'IT', lat: 45.4642, lon: 9.19 },
  { id: 'ZRH', name: 'Zurich', cc: 'CH', lat: 47.3769, lon: 8.5417 },
  { id: 'VIE', name: 'Vienna', cc: 'AT', lat: 48.2082, lon: 16.3738 },
  { id: 'ARN', name: 'Stockholm', cc: 'SE', lat: 59.3293, lon: 18.0686 },
  { id: 'OSL', name: 'Oslo', cc: 'NO', lat: 59.9139, lon: 10.7522 },
  { id: 'HEL', name: 'Helsinki', cc: 'FI', lat: 60.1699, lon: 24.9384 },
  { id: 'CPH', name: 'Copenhagen', cc: 'DK', lat: 55.6761, lon: 12.5683 },
  { id: 'BUD', name: 'Budapest', cc: 'HU', lat: 47.4979, lon: 19.0402 },
  { id: 'OTP', name: 'Bucharest', cc: 'RO', lat: 44.4268, lon: 26.1025 },
  { id: 'PRG', name: 'Prague', cc: 'CZ', lat: 50.0755, lon: 14.4378 },
  { id: 'SOF', name: 'Sofia', cc: 'BG', lat: 42.6977, lon: 23.3219 },
  { id: 'BRU', name: 'Brussels', cc: 'BE', lat: 50.8503, lon: 4.3517 },
  { id: 'LIS', name: 'Lisbon', cc: 'PT', lat: 38.7223, lon: -9.1393 },
  { id: 'DUB', name: 'Dublin', cc: 'IE', lat: 53.3498, lon: -6.2603 },
  { id: 'ATH', name: 'Athens', cc: 'GR', lat: 37.9838, lon: 23.7275 },

  /* ─── Asia Pacific ─── */
  { id: 'NRT', name: 'Tokyo', cc: 'JP', lat: 35.6762, lon: 139.6503 },
  { id: 'KIX', name: 'Osaka', cc: 'JP', lat: 34.6937, lon: 135.5023 },
  { id: 'ICN', name: 'Seoul', cc: 'KR', lat: 37.5665, lon: 126.978 },
  { id: 'SIN', name: 'Singapore', cc: 'SG', lat: 1.3521, lon: 103.8198 },
  { id: 'HKG', name: 'Hong Kong', cc: 'HK', lat: 22.3193, lon: 114.1694 },
  { id: 'TPE', name: 'Taipei', cc: 'TW', lat: 25.033, lon: 121.5654 },
  { id: 'BOM', name: 'Mumbai', cc: 'IN', lat: 19.076, lon: 72.8777 },
  { id: 'DEL', name: 'Delhi', cc: 'IN', lat: 28.7041, lon: 77.1025 },
  { id: 'BLR', name: 'Bangalore', cc: 'IN', lat: 12.9716, lon: 77.5946 },
  { id: 'SYD', name: 'Sydney', cc: 'AU', lat: -33.8688, lon: 151.2093 },
  { id: 'MEL', name: 'Melbourne', cc: 'AU', lat: -37.8136, lon: 144.9631 },
  { id: 'AKL', name: 'Auckland', cc: 'NZ', lat: -36.8485, lon: 174.7633 },
  { id: 'JKT', name: 'Jakarta', cc: 'ID', lat: -6.2088, lon: 106.8456 },
  { id: 'BKK', name: 'Bangkok', cc: 'TH', lat: 13.7563, lon: 100.5018 },
  { id: 'KUL', name: 'Kuala Lumpur', cc: 'MY', lat: 3.139, lon: 101.6869 },
  { id: 'MNL', name: 'Manila', cc: 'PH', lat: 14.5995, lon: 120.9842 },

  /* ─── Middle East ─── */
  { id: 'DXB', name: 'Dubai', cc: 'AE', lat: 25.2048, lon: 55.2708 },
  { id: 'TLV', name: 'Tel Aviv', cc: 'IL', lat: 32.0853, lon: 34.7818 },
  { id: 'RUH', name: 'Riyadh', cc: 'SA', lat: 24.7136, lon: 46.6753 },

  /* ─── South America ─── */
  { id: 'GRU', name: 'São Paulo', cc: 'BR', lat: -23.5505, lon: -46.6333 },
  { id: 'SCL', name: 'Santiago', cc: 'CL', lat: -33.4489, lon: -70.6693 },
  { id: 'BOG', name: 'Bogotá', cc: 'CO', lat: 4.711, lon: -74.0721 },

  /* ─── Africa ─── */
  { id: 'JNB', name: 'Johannesburg', cc: 'ZA', lat: -26.2041, lon: 28.0473 },
  { id: 'CAI', name: 'Cairo', cc: 'EG', lat: 30.0444, lon: 31.2357 },
  { id: 'NBO', name: 'Nairobi', cc: 'KE', lat: -1.2921, lon: 36.8219 },

  /* ─── Iran (special) ─── */
  { id: 'THR', name: 'Tehran', cc: 'IR', lat: 35.6892, lon: 51.389 },
  { id: 'IFN', name: 'Isfahan', cc: 'IR', lat: 32.6546, lon: 51.668 },
  { id: 'MHD', name: 'Mashhad', cc: 'IR', lat: 36.2972, lon: 59.5956 },
];

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Region profiles — optimal settings per country zone
   ══════════════════════════════════════════════════════════════════════════════ */
function 檔案(cc) {
  cc = String(cc || 'XX').toUpperCase();
  if (cc === 'IR') {
    return {
      zone: 'IR', transports: ['ws', 'grpc'], ports: [443, 2053, 2087, 2096, 8443],
      fp: 'chrome', path: '/?ed=2560', frag: true, tls: 'yes', sni: '',
    };
  }
  if (['CN', 'RU', 'BY', 'KZ', 'UZ', 'TJ', 'TM', 'MM', 'PK', 'AF', 'SD', 'SY', 'VE'].includes(cc)) {
    return {
      zone: 'HARD', transports: ['ws'], ports: [443, 2053, 8443, 2087],
      fp: 'chrome', path: '/nexus?ed=2048', frag: false, tls: 'yes', sni: 'www.microsoft.com',
    };
  }
  return {
    zone: 'OPEN', transports: ['grpc', 'xhttp', 'ws'], ports: [443, 8443, 2053],
    fp: 'random', path: '/', frag: false, tls: 'yes', sni: '',
  };
}

function 運算子(cfg, cc) {
  /* detect Iranian ISP operators */
  if (cc !== 'IR') return null;
  const list = [];
  if (_b(cfg.ispMobile)) list.push('HamrahAval');
  if (_b(cfg.ispUnicom)) list.push('Irancell');
  if (_b(cfg.ispTelecom)) list.push('Rightel');
  if (_b(cfg.ispMokhaberat)) list.push('Mokhaberat');
  if (_b(cfg.ispShatel)) list.push('Shatel');
  if (_b(cfg.ispAsiatek)) list.push('Asiatek');
  if (_b(cfg.ispParsonline)) list.push('ParsOnline');
  if (_b(cfg.ispHiweb)) list.push('Hiweb');
  return list;
}
