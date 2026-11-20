'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Compass, 
  Camera, 
  MapPin, 
  RefreshCw, 
  Volume2, 
  VolumeX, 
  Info, 
  CheckCircle2, 
  Layers, 
  SwitchCamera, 
  VideoOff, 
  ChevronRight, 
  ChevronLeft,
  Navigation,
  Zap,
  MoreVertical,
  X,
  Search,
  Sparkles,
  Smartphone,
  Maximize2,
  Palette,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import { CompassCalibrationModal } from '@/components/islami/CompassCalibrationModal';

// Kaaba Coordinates in Makkah
const KAABA_LAT = 21.422487;
const KAABA_LNG = 39.826206;

export type CompassThemeId = 'classic' | 'simple' | 'emerald' | 'obsidian' | 'gold';

export interface CompassThemeData {
  id: CompassThemeId;
  name: string;
  tagline: string;
  badge: string;
  previewBg: string;
  previewRing: string;
  previewAccent: string;
  dialBg: string;
  dialBorder: string;
  dialShadow: string;
  tickCardinal: string;
  tickMajor: string;
  tickMinor: string;
  cardinalNorth: string;
  cardinalOther: string;
  degreeColor: string;
  centerBg: string;
  centerBorder: string;
  centerDegree: string;
  centerLabel: string;
  centerSubtext: string;
  bezelDefault: string;
  bezelAligned: string;
  fontFamily: 'serif' | 'sans' | 'mono';
  beamColor: string;
}

const COMPASS_THEMES: Record<CompassThemeId, CompassThemeData> = {
  classic: {
    id: 'classic',
    name: 'Classic Kompas',
    tagline: 'Nuansa nautika klasik bahari dengan mawar angin 8 arah & lingkar kuningan',
    badge: 'Vintage',
    previewBg: '#faf5ea',
    previewRing: '#b45309',
    previewAccent: '#b91c1c',
    dialBg: '#faf5ea',
    dialBorder: '#92400e',
    dialShadow: '0 20px 30px -10px rgba(146, 64, 14, 0.25)',
    tickCardinal: 'bg-[#92400e]',
    tickMajor: 'bg-[#b45309]',
    tickMinor: 'bg-[#d97706]/60',
    cardinalNorth: 'text-[#b91c1c]',
    cardinalOther: 'text-[#78350f]',
    degreeColor: 'text-[#92400e]',
    centerBg: '#fefbf3',
    centerBorder: 'border-[#b45309]',
    centerDegree: 'text-[#78350f]',
    centerLabel: 'text-[#92400e]',
    centerSubtext: 'text-[#b45309]',
    bezelDefault: '#b45309',
    bezelAligned: '#15803d',
    fontFamily: 'serif',
    beamColor: 'from-[#b45309] to-transparent',
  },
  simple: {
    id: 'simple',
    name: 'Simple Kompas',
    tagline: 'Desain ultra-bersih, minimalis modern, kontras tajam & presisi',
    badge: 'Minimalis',
    previewBg: '#ffffff',
    previewRing: '#cbd5e1',
    previewAccent: '#059669',
    dialBg: '#ffffff',
    dialBorder: '#cbd5e1',
    dialShadow: '0 20px 30px -10px rgba(100, 116, 139, 0.15)',
    tickCardinal: 'bg-slate-900',
    tickMajor: 'bg-slate-500',
    tickMinor: 'bg-slate-300',
    cardinalNorth: 'text-emerald-600',
    cardinalOther: 'text-slate-600',
    degreeColor: 'text-slate-400',
    centerBg: '#f8fafc',
    centerBorder: 'border-slate-200',
    centerDegree: 'text-slate-900',
    centerLabel: 'text-slate-500',
    centerSubtext: 'text-emerald-600',
    bezelDefault: '#334155',
    bezelAligned: '#059669',
    fontFamily: 'sans',
    beamColor: 'from-emerald-500 to-transparent',
  },
  emerald: {
    id: 'emerald',
    name: 'Modern Emerald',
    tagline: 'Keanggunan zamrud islami bercahaya emas dengan watermark bintang',
    badge: 'Islami',
    previewBg: '#064e3b',
    previewRing: '#f59e0b',
    previewAccent: '#34d399',
    dialBg: '#064e3b',
    dialBorder: '#f59e0b',
    dialShadow: '0 20px 35px -10px rgba(6, 78, 59, 0.5)',
    tickCardinal: 'bg-amber-300',
    tickMajor: 'bg-emerald-300',
    tickMinor: 'bg-emerald-700',
    cardinalNorth: 'text-amber-400',
    cardinalOther: 'text-emerald-200',
    degreeColor: 'text-emerald-400',
    centerBg: '#022c22',
    centerBorder: 'border-emerald-500',
    centerDegree: 'text-white',
    centerLabel: 'text-emerald-300',
    centerSubtext: 'text-amber-400',
    bezelDefault: '#f59e0b',
    bezelAligned: '#10b981',
    fontFamily: 'sans',
    beamColor: 'from-amber-400 to-transparent',
  },
  obsidian: {
    id: 'obsidian',
    name: 'Dark Obsidian',
    tagline: 'Gaya taktis cyber night pekat dengan indikator HUD berpendar neon',
    badge: 'Taktis',
    previewBg: '#090d16',
    previewRing: '#06b6d4',
    previewAccent: '#38bdf8',
    dialBg: '#090d16',
    dialBorder: '#0891b2',
    dialShadow: '0 20px 35px -10px rgba(8, 145, 178, 0.35)',
    tickCardinal: 'bg-cyan-400',
    tickMajor: 'bg-emerald-400',
    tickMinor: 'bg-slate-700',
    cardinalNorth: 'text-cyan-400',
    cardinalOther: 'text-slate-400',
    degreeColor: 'text-slate-500',
    centerBg: '#030712',
    centerBorder: 'border-cyan-600',
    centerDegree: 'text-cyan-300',
    centerLabel: 'text-slate-400',
    centerSubtext: 'text-emerald-400',
    bezelDefault: '#38bdf8',
    bezelAligned: '#10b981',
    fontFamily: 'mono',
    beamColor: 'from-cyan-400 to-transparent',
  },
  gold: {
    id: 'gold',
    name: 'Royal Gold',
    tagline: 'Motif kubah istana arabesque dengan gradasi emas hangat & ornamen anggun',
    badge: 'Arabesque',
    previewBg: '#fef3c7',
    previewRing: '#d97706',
    previewAccent: '#b45309',
    dialBg: '#fffbeb',
    dialBorder: '#d97706',
    dialShadow: '0 20px 30px -10px rgba(217, 119, 6, 0.25)',
    tickCardinal: 'bg-amber-700',
    tickMajor: 'bg-amber-600',
    tickMinor: 'bg-amber-300',
    cardinalNorth: 'text-amber-800',
    cardinalOther: 'text-amber-900',
    degreeColor: 'text-amber-700',
    centerBg: '#fffdf5',
    centerBorder: 'border-amber-400',
    centerDegree: 'text-amber-950',
    centerLabel: 'text-amber-800',
    centerSubtext: 'text-emerald-700',
    bezelDefault: '#d97706',
    bezelAligned: '#16a34a',
    fontFamily: 'serif',
    beamColor: 'from-amber-600 to-transparent',
  }
};

const CompassRoseAccent: React.FC<{ themeId: CompassThemeId }> = ({ themeId }) => {
  if (themeId === 'classic') {
    return (
      <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full pointer-events-none select-none">
        {/* Outer antique brass hairline rings */}
        <circle cx="100" cy="100" r="92" fill="none" stroke="#b45309" strokeWidth="1" strokeDasharray="2 3" opacity="0.4" />
        <circle cx="100" cy="100" r="74" fill="none" stroke="#92400e" strokeWidth="0.75" opacity="0.3" />
        
        {/* 8-Point Nautical Compass Rose */}
        {/* 4 Intercardinal Points (45, 135, 225, 315) */}
        <g transform="rotate(45 100 100)" opacity="0.7">
          <polygon points="100,100 100,48 94,100" fill="#92400e" />
          <polygon points="100,100 100,48 106,100" fill="#d97706" />
        </g>
        <g transform="rotate(135 100 100)" opacity="0.7">
          <polygon points="100,100 100,48 94,100" fill="#92400e" />
          <polygon points="100,100 100,48 106,100" fill="#d97706" />
        </g>
        <g transform="rotate(225 100 100)" opacity="0.7">
          <polygon points="100,100 100,48 94,100" fill="#92400e" />
          <polygon points="100,100 100,48 106,100" fill="#d97706" />
        </g>
        <g transform="rotate(315 100 100)" opacity="0.7">
          <polygon points="100,100 100,48 94,100" fill="#92400e" />
          <polygon points="100,100 100,48 106,100" fill="#d97706" />
        </g>

        {/* 4 Primary Cardinal Points (0, 90, 180, 270) */}
        {/* North */}
        <g opacity="0.85">
          <polygon points="100,100 100,32 91,100" fill="#92400e" />
          <polygon points="100,100 100,32 109,100" fill="#d97706" />
        </g>
        {/* East */}
        <g transform="rotate(90 100 100)" opacity="0.85">
          <polygon points="100,100 100,32 91,100" fill="#92400e" />
          <polygon points="100,100 100,32 109,100" fill="#d97706" />
        </g>
        {/* South */}
        <g transform="rotate(180 100 100)" opacity="0.85">
          <polygon points="100,100 100,32 91,100" fill="#92400e" />
          <polygon points="100,100 100,32 109,100" fill="#d97706" />
        </g>
        {/* West */}
        <g transform="rotate(270 100 100)" opacity="0.85">
          <polygon points="100,100 100,32 91,100" fill="#92400e" />
          <polygon points="100,100 100,32 109,100" fill="#d97706" />
        </g>
      </svg>
    );
  }

  if (themeId === 'simple') {
    return (
      <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full pointer-events-none select-none">
        <circle cx="100" cy="100" r="88" fill="none" stroke="#e2e8f0" strokeWidth="1" />
        <circle cx="100" cy="100" r="72" fill="none" stroke="#f1f5f9" strokeWidth="1" />
        <line x1="100" y1="20" x2="100" y2="180" stroke="#f1f5f9" strokeWidth="0.75" />
        <line x1="20" y1="100" x2="180" y2="100" stroke="#f1f5f9" strokeWidth="0.75" />
      </svg>
    );
  }

  if (themeId === 'emerald') {
    return (
      <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full pointer-events-none select-none">
        <g opacity="0.25">
          <rect x="52" y="52" width="96" height="96" fill="none" stroke="#f59e0b" strokeWidth="1.2" />
          <rect x="52" y="52" width="96" height="96" transform="rotate(45 100 100)" fill="none" stroke="#f59e0b" strokeWidth="1.2" />
          <circle cx="100" cy="100" r="88" fill="none" stroke="#10b981" strokeWidth="1" strokeDasharray="3 3" />
        </g>
      </svg>
    );
  }

  if (themeId === 'obsidian') {
    return (
      <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full pointer-events-none select-none">
        <g opacity="0.3">
          <circle cx="100" cy="100" r="90" fill="none" stroke="#06b6d4" strokeWidth="0.75" strokeDasharray="6 4" />
          <circle cx="100" cy="100" r="74" fill="none" stroke="#0891b2" strokeWidth="0.5" />
          <circle cx="100" cy="100" r="58" fill="none" stroke="#06b6d4" strokeWidth="0.5" strokeDasharray="2 3" />
          <line x1="100" y1="15" x2="100" y2="185" stroke="#06b6d4" strokeWidth="0.75" strokeDasharray="4 4" />
          <line x1="15" y1="100" x2="185" y2="100" stroke="#06b6d4" strokeWidth="0.75" strokeDasharray="4 4" />
        </g>
      </svg>
    );
  }

  if (themeId === 'gold') {
    return (
      <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full pointer-events-none select-none">
        <g opacity="0.35">
          <circle cx="100" cy="100" r="90" fill="none" stroke="#d97706" strokeWidth="1" />
          <circle cx="100" cy="100" r="76" fill="none" stroke="#b45309" strokeWidth="0.75" strokeDasharray="2 3" />
          {[0, 30, 60, 90, 120, 150].map((deg) => (
            <ellipse key={deg} cx="100" cy="100" rx="28" ry="60" transform={`rotate(${deg} 100 100)`} fill="none" stroke="#d97706" strokeWidth="0.6" />
          ))}
        </g>
      </svg>
    );
  }

  return null;
};

// Preset Indonesian & Global Cities
const PRESET_CITIES = [
  { name: 'Jakarta', lat: -6.2088, lng: 106.8456, province: 'DKI Jakarta', country: 'Indonesia' },
  { name: 'Surabaya', lat: -7.2575, lng: 112.7521, province: 'Jawa Timur', country: 'Indonesia' },
  { name: 'Bandung', lat: -6.9175, lng: 107.6191, province: 'Jawa Barat', country: 'Indonesia' },
  { name: 'Medan', lat: 3.5952, lng: 98.6722, province: 'Sumatera Utara', country: 'Indonesia' },
  { name: 'Makassar', lat: -5.1477, lng: 119.4327, province: 'Sulawesi Selatan', country: 'Indonesia' },
  { name: 'Semarang', lat: -6.9667, lng: 110.4167, province: 'Jawa Tengah', country: 'Indonesia' },
  { name: 'Yogyakarta', lat: -7.7956, lng: 110.3695, province: 'DI Yogyakarta', country: 'Indonesia' },
  { name: 'Palembang', lat: -2.9761, lng: 104.7754, province: 'Sumatera Selatan', country: 'Indonesia' },
  { name: 'Cirebon', lat: -6.7320, lng: 108.5523, province: 'Jawa Barat', country: 'Indonesia' },
  { name: 'Banda Aceh', lat: 5.5483, lng: 95.3238, province: 'Aceh', country: 'Indonesia' },
  { name: 'Padang', lat: -0.9471, lng: 100.4172, province: 'Sumatera Barat', country: 'Indonesia' },
  { name: 'Denpasar', lat: -8.6705, lng: 115.2126, province: 'Bali', country: 'Indonesia' },
  { name: 'Balikpapan', lat: -1.2379, lng: 116.8529, province: 'Kalimantan Timur', country: 'Indonesia' },
  { name: 'Banjarmasin', lat: -3.3194, lng: 114.5908, province: 'Kalimantan Selatan', country: 'Indonesia' },
  { name: 'Pontianak', lat: -0.0263, lng: 109.3425, province: 'Kalimantan Barat', country: 'Indonesia' },
  { name: 'Mataram', lat: -8.5833, lng: 116.1167, province: 'Nusa Tenggara Barat', country: 'Indonesia' },
  { name: 'Kupang', lat: -10.1772, lng: 123.6070, province: 'Nusa Tenggara Timur', country: 'Indonesia' },
  { name: 'Jayapura', lat: -2.5337, lng: 140.7181, province: 'Papua', country: 'Indonesia' },
  { name: 'Bekasi', lat: -6.2383, lng: 106.9756, province: 'Jawa Barat', country: 'Indonesia' },
  { name: 'Tangerang', lat: -6.1783, lng: 106.6319, province: 'Banten', country: 'Indonesia' },
  { name: 'Bogor', lat: -6.5971, lng: 106.8060, province: 'Jawa Barat', country: 'Indonesia' },
  { name: 'Depok', lat: -6.4025, lng: 106.7942, province: 'Jawa Barat', country: 'Indonesia' },
  { name: 'Solo (Surakarta)', lat: -7.5666, lng: 110.8166, province: 'Jawa Tengah', country: 'Indonesia' },
  { name: 'Malang', lat: -7.9797, lng: 112.6304, province: 'Jawa Timur', country: 'Indonesia' },
  { name: 'Kuala Lumpur', lat: 3.1390, lng: 101.6869, province: 'Malaysia', country: 'Malaysia' },
  { name: 'Singapura', lat: 1.3521, lng: 103.8198, province: 'Singapore', country: 'Singapura' },
  { name: 'Makkah (Pusat)', lat: 21.4225, lng: 39.8262, province: 'Arab Saudi', country: 'Arab Saudi' },
  { name: 'Madinah', lat: 24.5247, lng: 39.5692, province: 'Arab Saudi', country: 'Arab Saudi' }
];

// Helper: Degree to Radian and vice-versa
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

// Helper: Reverse Geocode latitude & longitude into City and Country
const fetchCityAndCountry = async (lat: number, lng: number): Promise<{ city: string; country: string }> => {
  // 1. Try BigDataCloud Reverse Geocoding API (Client-side CORS supported, fast & free)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=id`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      const city = data.city || data.locality || data.principalSubdivision || '';
      const country = data.countryName || 'Indonesia';
      if (city) {
        return { city, country };
      }
    }
  } catch {
    // Continue to next fallback
  }

  // 2. Try OpenStreetMap Nominatim
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=12&accept-language=id`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      const city = addr.city || addr.town || addr.municipality || addr.regency || addr.county || addr.state || '';
      const country = addr.country || 'Indonesia';
      if (city) {
        return { city, country };
      }
    }
  } catch {
    // Continue to next fallback
  }

  // 3. Fallback: match nearest preset city
  const nearest = PRESET_CITIES.reduce((prev, curr) => {
    const dPrev = Math.hypot(prev.lat - lat, prev.lng - lng);
    const dCurr = Math.hypot(curr.lat - lat, curr.lng - lng);
    return dCurr < dPrev ? curr : prev;
  });
  const distKm = Math.hypot(nearest.lat - lat, nearest.lng - lng) * 111;
  if (distKm < 60) {
    return { city: `${nearest.name}, ${nearest.province}`, country: nearest.country };
  }

  return {
    city: `Lokasi GPS (${lat.toFixed(4)}°, ${lng.toFixed(4)}°)`,
    country: 'Indonesia'
  };
};

// Calculate Qibla Bearing (° from True North)
const calculateQiblaBearing = (lat: number, lng: number): number => {
  const phiK = toRad(KAABA_LAT);
  const lambdaK = toRad(KAABA_LNG);
  const phi = toRad(lat);
  const lambda = toRad(lng);

  const deltaLambda = lambdaK - lambda;
  const y = Math.sin(deltaLambda);
  const x = Math.cos(phi) * Math.tan(phiK) - Math.sin(phi) * Math.cos(deltaLambda);

  let qibla = toDeg(Math.atan2(y, x));
  qibla = (qibla + 360) % 360;
  return Math.round(qibla * 10) / 10;
};

// Calculate Haversine Distance to Kaaba in KM
const calculateDistanceToKaaba = (lat: number, lng: number): number => {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(KAABA_LAT - lat);
  const dLng = toRad(KAABA_LNG - lng);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat)) * Math.cos(toRad(KAABA_LAT)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
};

export default function KompasKiblatPage() {
  // Location State
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: -6.2088, // Default: Jakarta
    lng: 106.8456
  });
  const [cityName, setCityName] = useState<string>('Jakarta');
  const [countryName, setCountryName] = useState<string>('Indonesia');
  const [isLoadingAddress, setIsLoadingAddress] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isCityModalOpen, setIsCityModalOpen] = useState<boolean>(false);
  const [citySearchQuery, setCitySearchQuery] = useState<string>('');

  // Modals & Menu State
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState<boolean>(false);

  // Theme State (5 Compass Themes)
  const [compassTheme, setCompassTheme] = useState<CompassThemeId>(() => {
    try {
      const saved = localStorage.getItem('kompas_theme') as CompassThemeId;
      if (saved && ['classic', 'simple', 'emerald', 'obsidian', 'gold'].includes(saved)) {
        return saved;
      }
    } catch {
      // Fallback
    }
    return 'classic';
  });

  const handleSelectTheme = (themeId: CompassThemeId) => {
    setCompassTheme(themeId);
    try {
      localStorage.setItem('kompas_theme', themeId);
    } catch (e) {
      console.warn('Failed to save compass theme to localStorage:', e);
    }
  };

  const [isThemeAccordionOpen, setIsThemeAccordionOpen] = useState<boolean>(false);

  // Sensor / Orientation State
  const [heading, setHeading] = useState<number>(0); // 0-360 degrees from North
  const [pitchBeta, setPitchBeta] = useState<number>(0); // Device vertical tilt angle (-180 to 180)
  const [sensorSupported, setSensorSupported] = useState<boolean>(false);
  const [sensorActive, setSensorActive] = useState<boolean>(false);
  const [sensorDataLive, setSensorDataLive] = useState<boolean>(false);
  const [sensorEventCount, setSensorEventCount] = useState<number>(0);
  const [sensorEventType, setSensorEventType] = useState<string>('');
  const [sensorRawAlpha, setSensorRawAlpha] = useState<number | null>(null);
  const [needsPermissionPrompt, setNeedsPermissionPrompt] = useState<boolean>(false);
  const [isInIframe, setIsInIframe] = useState<boolean>(false);

  // Detect iframe environment (AI Studio preview)
  useEffect(() => {
    setIsInIframe(typeof window !== 'undefined' && window.self !== window.top);
  }, []);

  // Display Mode: 'compass' (default) or 'camera' (AR)
  const [activeMode, setActiveMode] = useState<'compass' | 'camera'>('compass');
  const [autoSwitchOnTilt, setAutoSwitchOnTilt] = useState<boolean>(true); // Aktif secara otomatis: Tegak -> Kamera AR, Tiduran -> Kompas
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState<boolean>(false);
  const [isSensorBannerDismissed, setIsSensorBannerDismissed] = useState<boolean>(false);
  const isCameraMode = activeMode === 'camera';

  // Calibration Popup Modal state (auto opens on tool launch if not dismissed with "dontShowAgain")
  const [isCalibrationModalOpen, setIsCalibrationModalOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('hide_qibla_calibration_modal') !== 'true';
    } catch {
      return true;
    }
  });

  // Audio and Haptic feedback
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [hapticEnabled, setHapticEnabled] = useState<boolean>(true);
  const lastChimeTimeRef = useRef<number>(0);

  // High-performance Compass Smoothing & RAF Animation Refs
  const targetHeadingRef = useRef<number>(0);
  const smoothedHeadingRef = useRef<number>(0);
  const lastRenderedHeadingRef = useRef<number>(0);
  const hasInitializedHeadingRef = useRef<boolean>(false);
  const lastPitchBetaRef = useRef<number>(0);
  const dialRef = useRef<HTMLDivElement | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const rafIdRef = useRef<number | null>(null);

  // Camera State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showSajadah, setShowSajadah] = useState<boolean>(true);
  const [showFloorArrow, setShowFloorArrow] = useState<boolean>(true);

  // Calculate Qibla Bearing & Distance
  const qiblaAngle = calculateQiblaBearing(coords.lat, coords.lng);
  const distanceKm = calculateDistanceToKaaba(coords.lat, coords.lng);

  // Effective Heading directly from device compass sensor
  const effectiveHeading = heading;

  // Angle Difference to Qibla (-180 to +180)
  let angleDiff = (qiblaAngle - effectiveHeading + 360) % 360;
  if (angleDiff > 180) angleDiff -= 360;

  // Is Aligned with Qibla (within ±3 degrees)
  const isAligned = Math.abs(angleDiff) <= 3;
  const isNearAligned = Math.abs(angleDiff) <= 12;

  // Automatic mode switching based on phone tilt:
  // - Ponsel berdiri tegak (upright / vertical): otomatis aktifkan mode Kamera AR
  // - Ponsel tiduran (flat / horizontal): otomatis beralih ke mode Kompas
  useEffect(() => {
    if (!autoSwitchOnTilt) return;
    const absBeta = Math.abs(pitchBeta);
    // Ponsel berdiri tegak: pitchBeta antara 45° dan 135°
    const isDeviceVertical = absBeta >= 45 && absBeta <= 135;
    // Ponsel tiduran/mendatar: pitchBeta < 35° atau > 145°
    const isDeviceFlat = absBeta < 35 || absBeta > 145;

    if (isDeviceVertical) {
      if (!cameraPermissionDenied) {
        setActiveMode('camera');
      }
    } else if (isDeviceFlat) {
      setActiveMode('compass');
    }
  }, [pitchBeta, autoSwitchOnTilt, cameraPermissionDenied]);

  // Synthesize soft pleasant bell chime using Web Audio API
  const playChimeSound = useCallback(() => {
    if (!soundEnabled) return;
    const now = Date.now();
    if (now - lastChimeTimeRef.current < 2500) return; // Debounce 2.5s
    lastChimeTimeRef.current = now;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

      gain.gain.setValueAtTime(0.01, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 1.2);
    } catch (e) {
      console.warn('Audio chime could not be played', e);
    }
  }, [soundEnabled]);

  // Haptic feedback trigger when aligned
  useEffect(() => {
    if (isAligned) {
      if (hapticEnabled && navigator.vibrate) {
        navigator.vibrate([40, 60, 40]);
      }
      playChimeSound();
    }
  }, [isAligned, hapticEnabled, playChimeSound]);

  // Get Current Location
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation tidak didukung pada perangkat ini.');
      return;
    }

    setIsLocating(true);
    setIsLoadingAddress(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });
        setIsLocating(false);

        // Fetch reverse geocode to get real city and country name
        try {
          const res = await fetchCityAndCountry(latitude, longitude);
          setCityName(res.city);
          setCountryName(res.country);
        } catch {
          const nearest = PRESET_CITIES.reduce((prev, curr) => {
            const dPrev = Math.hypot(prev.lat - latitude, prev.lng - longitude);
            const dCurr = Math.hypot(curr.lat - latitude, curr.lng - longitude);
            return dCurr < dPrev ? curr : prev;
          });
          setCityName(`${nearest.name}, ${nearest.province}`);
          setCountryName(nearest.country);
        } finally {
          setIsLoadingAddress(false);
        }
      },
      (err) => {
        setIsLocating(false);
        setIsLoadingAddress(false);
        let msg = 'Gagal mendapatkan lokasi GPS.';
        if (err.code === 1) msg = 'Izin lokasi ditolak. Silakan pilih kota manual.';
        else if (err.code === 2) msg = 'Posisi tidak dapat ditemukan.';
        else if (err.code === 3) msg = 'Waktu permintaan lokasi habis.';
        setLocationError(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  // Initialize Geolocation on Mount
  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  // High-performance RAF Smoothing loop for fluid, oil-damped compass motion
  useEffect(() => {
    isMountedRef.current = true;

    const smoothLoop = () => {
      if (!isMountedRef.current) return;

      if (hasInitializedHeadingRef.current) {
        const target = targetHeadingRef.current;
        let current = smoothedHeadingRef.current;

        // Calculate shortest angular difference (-180 to 180 deg)
        let diff = (target - current) % 360;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;

        // Deadband filter: ignore jitter/tremor under 0.12 deg
        if (Math.abs(diff) >= 0.12) {
          // Adaptive damping factor (LERP):
          // - Rapid turn (> 40 deg): follow faster (0.22) so compass doesn't feel sluggish
          // - Normal rotation (15-40 deg): follow smoothly (0.16)
          // - Micro adjustment (< 15 deg): silky fluid damping (0.09)
          const absDiff = Math.abs(diff);
          const factor = absDiff > 40 ? 0.22 : absDiff > 15 ? 0.16 : 0.09;

          current = ((current + diff * factor) % 360 + 360) % 360;
          smoothedHeadingRef.current = current;

          // Directly apply hardware-accelerated transform to dial element at native refresh rate (60/120fps)
          if (dialRef.current) {
            dialRef.current.style.transform = `rotate(${-current}deg)`;
          }

          // Throttle state update so UI numbers, direction, and alignment stay in sync
          const stateDiff = Math.abs(current - lastRenderedHeadingRef.current);
          const wrappedDiff = Math.min(stateDiff, 360 - stateDiff);
          if (wrappedDiff >= 0.25 || (absDiff < 1.5 && wrappedDiff >= 0.1)) {
            lastRenderedHeadingRef.current = current;
            setHeading(Math.round(current * 10) / 10);
          }
        }
      }

      rafIdRef.current = requestAnimationFrame(smoothLoop);
    };

    rafIdRef.current = requestAnimationFrame(smoothLoop);

    return () => {
      isMountedRef.current = false;
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  // Setup Device Orientation Sensors with Tilt Compensation (Android Chrome & iOS)
  useEffect(() => {
    // Check if iOS requires permission
    if (typeof (DeviceOrientationEvent as any)?.requestPermission === 'function') {
      setNeedsPermissionPrompt(true);
    }

    // Unified orientation handler
    const handleOrientation = (e: any) => {
      let rawAngle: number | null = null;

      // Priority 1: iOS WebKit Compass Heading (absolute true north)
      if (e.webkitCompassHeading !== undefined && e.webkitCompassHeading !== null) {
        setSensorDataLive(true);
        setSensorSupported(true);
        setSensorActive(true);
        setNeedsPermissionPrompt(false);
        setSensorEventCount(prev => prev + 1);
        setSensorEventType('iOS WebKit');
        rawAngle = ((e.webkitCompassHeading % 360) + 360) % 360;
      }
      // Priority 2: Chrome Android / W3C deviceorientationabsolute & deviceorientation
      else if (e.alpha !== null && !isNaN(e.alpha)) {
        setSensorDataLive(true);
        setSensorSupported(true);
        setSensorActive(true);
        setNeedsPermissionPrompt(false);
        setSensorEventCount(prev => prev + 1);
        setSensorEventType(e.absolute ? 'deviceorientationabsolute' : 'deviceorientation');
        setSensorRawAlpha(Math.round(e.alpha * 10) / 10);
        // Standard W3C Compass Heading formula: (360 - alpha) % 360
        rawAngle = ((360 - e.alpha) % 360 + 360) % 360;
      }

      if (rawAngle !== null) {
        if (!hasInitializedHeadingRef.current) {
          hasInitializedHeadingRef.current = true;
          smoothedHeadingRef.current = rawAngle;
          targetHeadingRef.current = rawAngle;
          lastRenderedHeadingRef.current = rawAngle;
          setHeading(Math.round(rawAngle * 10) / 10);
          if (dialRef.current) {
            dialRef.current.style.transform = `rotate(${-rawAngle}deg)`;
          }
        } else {
          targetHeadingRef.current = rawAngle;
        }
      }

      if (e.beta !== null && !isNaN(e.beta)) {
        const roundedBeta = Math.round(e.beta);
        if (Math.abs(roundedBeta - lastPitchBetaRef.current) >= 2) {
          lastPitchBetaRef.current = roundedBeta;
          setPitchBeta(roundedBeta);
        }
      }
    };

    // Listen on window and document with standard bubbling
    window.addEventListener('deviceorientationabsolute', handleOrientation as any, false);
    window.addEventListener('deviceorientation', handleOrientation as any, false);
    try {
      (window as any).ondeviceorientationabsolute = handleOrientation;
      (window as any).ondeviceorientation = handleOrientation;
    } catch {}

    // Fallback: If after 1.5 seconds no sensor event has arrived, mark sensorSupported
    const timer = setTimeout(() => {
      setSensorSupported(true);
    }, 1500);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('deviceorientationabsolute', handleOrientation as any, false);
      window.removeEventListener('deviceorientation', handleOrientation as any, false);
      try {
        (window as any).ondeviceorientationabsolute = null;
        (window as any).ondeviceorientation = null;
      } catch {}
    };
  }, []);

  // Request Sensor Permission (Android Chrome & iOS)
  const requestSensorPermissionAndStart = async () => {
    // 1. iOS permission
    if (typeof (DeviceOrientationEvent as any)?.requestPermission === 'function') {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        if (response === 'granted') {
          setNeedsPermissionPrompt(false);
          setSensorActive(true);
          return;
        }
      } catch (err) {
        console.warn('Sensor orientation permission notice:', err);
      }
    }

    // 2. Android Chrome / W3C absolute orientation requestPermission if available
    if (typeof (window as any).DeviceOrientationAbsoluteEvent?.requestPermission === 'function') {
      try {
        const res = await (window as any).DeviceOrientationAbsoluteEvent.requestPermission();
        if (res === 'granted') {
          setSensorActive(true);
          return;
        }
      } catch {}
    }

    // 3. Android Chrome Sensor permissions query
    if (typeof navigator !== 'undefined' && (navigator as any).permissions) {
      try {
        await Promise.allSettled([
          (navigator as any).permissions.query({ name: 'accelerometer' }),
          (navigator as any).permissions.query({ name: 'gyroscope' }),
          (navigator as any).permissions.query({ name: 'magnetometer' })
        ]);
      } catch {}
    }

    setSensorActive(true);
  };

  // Camera Management
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Kamera tidak didukung pada peramban/perangkat ini.');
      }

      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: cameraFacingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
      } catch (constraintErr: any) {
        // If ideal constraints failed (e.g. OverconstrainedError or desktop webcam),
        // rethrow if it was permission denial; otherwise retry with basic video
        const isPerm = 
          constraintErr?.name === 'NotAllowedError' || 
          constraintErr?.name === 'PermissionDeniedError' || 
          constraintErr?.name === 'SecurityError' ||
          constraintErr?.message?.toLowerCase().includes('permission denied') ||
          constraintErr?.message?.toLowerCase().includes('not allowed');

        if (isPerm) {
          throw constraintErr;
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.warn('Video play notice:', e));
      }
      setIsCameraActive(true);
      setCameraPermissionDenied(false);
      setCameraError(null);
    } catch (err: any) {
      const isPermissionDenied = 
        err?.name === 'NotAllowedError' || 
        err?.name === 'PermissionDeniedError' || 
        err?.name === 'SecurityError' ||
        err?.message?.toLowerCase().includes('permission denied') ||
        err?.message?.toLowerCase().includes('not allowed');

      if (isPermissionDenied) {
        console.warn('Camera access permission notice:', err?.message || 'Permission denied');
        setCameraPermissionDenied(true);
        setCameraError('Izin akses kamera belum diberikan. Aktifkan izin kamera pada browser untuk menggunakan fitur AR, atau beralih ke Mode Kompas.');
      } else {
        console.warn('Camera stream warning:', err?.message || err);
        setCameraError(err?.message || 'Gagal mengakses kamera perangkat.');
      }
      setIsCameraActive(false);
    }
  }, [cameraFacingMode]);

  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  // Switch camera when isCameraMode changes
  useEffect(() => {
    if (isCameraMode) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isCameraMode, startCamera, stopCamera]);

  // Toggle Camera Facing mode (Front/Back)
  const toggleCameraFacing = () => {
    setCameraFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  // Filtered cities for manual selection
  const filteredCities = PRESET_CITIES.filter(c => 
    c.name.toLowerCase().includes(citySearchQuery.toLowerCase()) ||
    c.province.toLowerCase().includes(citySearchQuery.toLowerCase())
  );

  const selectCity = (city: typeof PRESET_CITIES[0]) => {
    setCoords({ lat: city.lat, lng: city.lng });
    setCityName(`${city.name}, ${city.province}`);
    setCountryName(city.country);
    setIsCityModalOpen(false);
  };

  // Cardinal direction helper for Qibla
  const getCardinalDirection = (deg: number) => {
    const val = Math.floor((deg / 22.5) + 0.5);
    const arr = ["Utara", "Utara Timur Laut", "Timur Laut", "Timur Timur Laut", "Timur", "Timur Tenggara", "Tenggara", "Selatan Tenggara", "Selatan", "Selatan Barat Daya", "Barat Daya", "Barat Barat Daya", "Barat", "Barat Barat Laut", "Barat Laut", "Utara Barat Laut"];
    return arr[(val % 16)];
  };

  // Relative X offset for AR Kaaba Pin in Camera FOV (-100% to +100%)
  const FOV_DEG = 60;
  const clampedAngleDiff = Math.max(-180, Math.min(180, angleDiff));
  const arHorizontalPercent = Math.max(8, Math.min(92, 50 + (clampedAngleDiff / (FOV_DEG / 2)) * 50));
  const isKaabaInFOV = Math.abs(angleDiff) <= (FOV_DEG / 2);
  const currentTheme = COMPASS_THEMES[compassTheme] || COMPASS_THEMES.classic;

  return (
    <div className={`w-full h-full flex-1 flex flex-col select-none relative overflow-hidden transition-colors duration-200 -mx-4 sm:-mx-6 lg:-mx-8 -my-6 min-h-[calc(100dvh-4rem)] ${
      isCameraMode ? 'bg-black text-white' : 'bg-white text-slate-900'
    }`}>
      
      {/* ================= FULLSCREEN COMPASS & AR VIEW CONTAINER (NO HEADER, CLEAN & COMPACT) ================= */}
      <div className="flex-1 w-full relative overflow-hidden flex flex-col items-center justify-between p-3 sm:p-4 h-full">
        
        {/* Real-time Video Stream (Active when in Camera AR mode) */}
        {isCameraMode && (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="absolute inset-0 w-full h-full object-cover z-0"
          />
        )}

        {/* Camera Error Fallback */}
        {isCameraMode && cameraError && (
          <div className="absolute inset-0 bg-slate-900/95 z-30 flex flex-col items-center justify-center p-6 text-center text-white backdrop-blur-md">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center mb-3">
              <VideoOff size={32} />
            </div>
            <h3 className="text-base font-bold text-white">Akses Kamera Belum Tersedia</h3>
            <p className="text-xs text-slate-300 mt-1 max-w-sm leading-relaxed">
              {isInIframe
                ? 'Pada Chrome Android dalam pratinjau browser, sistem membatasi akses kamera dan sensor. Buka di Tab Baru Chrome untuk akses penuh, atau gunakan Kompas Digital.'
                : cameraError}
            </p>

            <div className="flex flex-col sm:flex-row gap-2.5 mt-5 w-full max-w-xs">
              <button
                type="button"
                onClick={() => {
                  setCameraPermissionDenied(false);
                  startCamera();
                }}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-xs"
              >
                <RefreshCw size={14} />
                <span>Coba Minta Izin Lagi</span>
              </button>

              <a
                href={typeof window !== 'undefined' ? window.location.href : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-xs text-center"
              >
                <ExternalLink size={14} />
                <span>Buka di Tab Baru Chrome</span>
              </a>

              <button
                type="button"
                onClick={() => {
                  setActiveMode('compass');
                  setCameraError(null);
                }}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Compass size={14} className="text-emerald-400" />
                <span>Beralih ke Kompas Digital</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-400 mt-4 max-w-xs">
              💡 <span className="font-semibold text-slate-300">Tips Chrome Android:</span> Ketuk ikon gembok/setelan di sebelah kiri alamat URL Chrome &gt; Izin &gt; Izinkan Kamera &amp; Sensor.
            </p>
          </div>
        )}

        {/* Top Mode Switcher & Upper-Right Controls */}
        <div className="z-10 w-full flex flex-col gap-2">
          
          <div className="w-full flex items-center justify-between gap-2">
            {/* Segmented Mode Toggle: Kompas Digital vs Kamera AR */}
            <div className={`flex items-center p-1 rounded-full border transition shadow-xs ${
              isCameraMode 
                ? 'bg-black/60 border-white/20' 
                : 'bg-slate-100 border-slate-200/80'
            }`}>
              <button
                type="button"
                onClick={() => {
                  setActiveMode('compass');
                  setCameraError(null);
                }}
                className={`px-3 py-1 rounded-full text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  !isCameraMode
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Beralih ke Kompas Digital"
              >
                <Compass size={13} />
                <span>Kompas</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCameraPermissionDenied(false);
                  setActiveMode('camera');
                }}
                className={`px-3 py-1 rounded-full text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  isCameraMode
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Beralih ke Kamera AR Kiblat"
              >
                <Camera size={13} />
                <span>Kamera AR</span>
              </button>
            </div>

            {/* Right Controls: AR Controls, Info ("i") & 3-Dots ("...") */}
            <div className="flex items-center gap-1.5">
              
              {/* Flip Camera Button (Only in AR Camera Mode) */}
              {isCameraMode && (
                <button
                  type="button"
                  onClick={toggleCameraFacing}
                  className="p-1.5 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/20 text-white transition cursor-pointer"
                  title="Ganti Kamera Depan/Belakang"
                >
                  <SwitchCamera size={15} />
                </button>
              )}

              {/* Sajadah Overlay Toggle (Only in AR Camera Mode) */}
              {isCameraMode && (
                <button
                  type="button"
                  onClick={() => setShowSajadah(!showSajadah)}
                  className={`p-1.5 rounded-full backdrop-blur-md border transition cursor-pointer ${
                    showSajadah ? 'bg-emerald-500/30 border-emerald-400 text-emerald-300' : 'bg-black/60 border-white/20 text-white/70'
                  }`}
                  title="Tampilkan / Sembunyikan Sajadah AR"
                >
                  <Layers size={15} />
                </button>
              )}

              {/* Tombol Info ("i") - Pojok Kanan Atas */}
              <button
                type="button"
                onClick={() => setIsInfoModalOpen(true)}
                className={`w-8 h-8 rounded-full border transition flex items-center justify-center cursor-pointer shadow-xs ${
                  isCameraMode
                    ? 'bg-black/60 hover:bg-black/80 text-white border-white/20 backdrop-blur-md'
                    : 'bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 border-slate-200/80'
                }`}
                title="Petunjuk & Akurasi Kompas"
                aria-label="Petunjuk & Akurasi Kompas"
              >
                <Info size={16} />
              </button>

              {/* Tombol Titik Tiga ("...") - Pojok Kanan Atas */}
              <button
                type="button"
                onClick={() => setIsMenuOpen(true)}
                className={`w-8 h-8 rounded-full border transition flex items-center justify-center cursor-pointer shadow-xs ${
                  isCameraMode
                    ? 'bg-black/60 hover:bg-black/80 text-white border-white/20 backdrop-blur-md'
                    : 'bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 border-slate-200/80'
                }`}
                title="Pengaturan, Tema & Menu"
                aria-label="Menu Pengaturan dan Tema"
              >
                <MoreVertical size={16} />
              </button>

            </div>

          </div>

          {/* Sensor Assistant Floating Card: Melayang & memiliki tombol X di pojok kanan atas untuk menghapusnya */}
          {!isSensorBannerDismissed && (
            sensorDataLive ? (
              <div className="absolute top-16 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md z-30 py-1.5 px-3.5 rounded-full bg-emerald-50/95 backdrop-blur-md border border-emerald-300 text-emerald-900 flex items-center justify-between gap-2 text-xs shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center gap-1.5 truncate">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="text-[11px] font-bold truncate">Sensor Kompas Aktif (Real-time)</span>
                  <span className="text-[10px] text-emerald-700 font-mono shrink-0">({Math.round(heading)}°)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSensorBannerDismissed(true)}
                  className="p-1 rounded-full text-emerald-700 hover:text-emerald-900 hover:bg-emerald-200/60 transition cursor-pointer shrink-0"
                  title="Tutup Pesan"
                  aria-label="Tutup pesan status sensor"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="absolute top-16 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md z-30 p-3.5 rounded-2xl bg-amber-50/95 sm:bg-white/95 backdrop-blur-md border border-amber-300/80 text-amber-950 space-y-2.5 text-xs shadow-xl shadow-amber-900/10 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1">
                    <Zap size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1 pr-1">
                      <h3 className="font-extrabold text-amber-900 text-xs">
                        {isInIframe ? 'Sensor Kompas Dibatasi di Mode Pratinjau (Iframe)' : 'Sensor Kompas Belum Terhubung'}
                      </h3>
                      <p className="text-[11px] text-amber-800/90 leading-snug mt-0.5">
                        {isInIframe 
                          ? 'Chrome HP membatasi sensor kompas di dalam frame pratinjau. Buka di Tab Baru Chrome agar kompas langsung berputar otomatis mengikuti HP Anda.'
                          : 'Gerakkan ponsel Anda atau ketuk tombol di bawah untuk mengizinkan sensor gerak Chrome.'}
                      </p>
                    </div>
                  </div>

                  {/* Tombol X di Pojok Kanan Atas untuk Menghapus / Menutup */}
                  <button
                    type="button"
                    onClick={() => setIsSensorBannerDismissed(true)}
                    className="p-1 rounded-full text-amber-800/70 hover:text-amber-950 hover:bg-amber-200/60 transition cursor-pointer shrink-0"
                    title="Tutup / Hapus Pesan Ini"
                    aria-label="Tutup pesan bantuan sensor"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-amber-200/60">
                  {isInIframe && (
                    <a
                      href={typeof window !== 'undefined' ? window.location.href : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-w-[150px] py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-xs text-center"
                    >
                      <ExternalLink size={13} />
                      <span>Buka di Tab Baru Chrome</span>
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={requestSensorPermissionAndStart}
                    className="py-1.5 px-3 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Zap size={13} />
                    <span>Aktifkan Sensor</span>
                  </button>
                </div>
              </div>
            )
          )}

        </div>

        {/* ================= VIEW BODY (KOMPAS OR AR OVERLAY) ================= */}
        {!isCameraMode ? (
          /* ---------- MODE 1: KOMPAS DIGITAL DIAL ---------- */
          <div className="w-full flex-1 flex flex-col items-center justify-center relative my-1">
            
            {/* ROTATING COMPASS DIAL WRAPPER (Responsive scaled per device) */}
            <div 
              className="relative w-[76vw] h-[76vw] max-w-[320px] max-h-[320px] xs:max-w-[340px] xs:max-h-[340px] sm:w-[50vh] sm:h-[50vh] sm:max-w-[420px] sm:max-h-[420px] md:w-[54vh] md:h-[54vh] md:max-w-[480px] md:max-h-[480px] lg:w-[58vh] lg:h-[58vh] lg:max-w-[540px] lg:max-h-[540px] my-1 sm:my-2 flex items-center justify-center select-none shrink-0"
            >
              {/* Outer Top Indicator Bezel (Menempel presisi di bibir atas kompas) */}
              <div className="absolute -top-3 sm:-top-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none">
                <div 
                  className="w-0 h-0 border-l-[10px] sm:border-l-[12px] md:border-l-[14px] border-l-transparent border-r-[10px] sm:border-r-[12px] md:border-r-[14px] border-r-transparent border-t-[15px] sm:border-t-[19px] md:border-t-[22px] transition-transform duration-300 drop-shadow-md"
                  style={{
                    borderTopColor: isAligned ? currentTheme.bezelAligned : currentTheme.bezelDefault,
                    transform: isAligned ? 'scale(1.25)' : 'scale(1)'
                  }}
                />
              </div>

              <div 
                ref={dialRef}
                className="w-full h-full rounded-full border-4 sm:border-[5px] relative flex items-center justify-center overflow-hidden will-change-transform"
                style={{
                  transform: `rotate(${-effectiveHeading}deg)`,
                  borderColor: isAligned ? '#10b981' : isNearAligned ? '#f59e0b' : currentTheme.dialBorder,
                  backgroundColor: currentTheme.dialBg,
                  boxShadow: currentTheme.dialShadow
                }}
              >
                {/* Theme Special SVG Accent (Compass Rose, Rub el Hizb, etc.) */}
                <CompassRoseAccent themeId={compassTheme} />

                {/* Degree Tick Marks */}
                {Array.from({ length: 72 }).map((_, i) => {
                  const deg = i * 5;
                  const isMajor = deg % 30 === 0;
                  const isCardinal = deg % 90 === 0;
                  return (
                    <div
                      key={deg}
                      className="absolute inset-0 flex justify-center pointer-events-none"
                      style={{ transform: `rotate(${deg}deg)` }}
                    >
                      <div className={`rounded-full ${
                        isCardinal 
                          ? `w-1 sm:w-1.5 h-3.5 sm:h-4 md:h-5 ${currentTheme.tickCardinal}` 
                          : isMajor 
                            ? `w-0.5 sm:w-1 h-2.5 sm:h-3 md:h-3.5 ${currentTheme.tickMajor}` 
                            : `w-0.5 h-1.5 sm:h-2 md:h-2.5 ${currentTheme.tickMinor}`
                      }`} />
                    </div>
                  );
                })}

                {/* Cardinal Letters (U, T, S, B) */}
                <span className={`absolute top-3.5 sm:top-5 md:top-6 ${currentTheme.cardinalNorth} font-extrabold text-sm sm:text-base md:text-lg tracking-wider ${currentTheme.fontFamily === 'serif' ? 'font-serif' : currentTheme.fontFamily === 'mono' ? 'font-mono' : 'font-sans'}`}>U</span>
                <span className={`absolute right-3.5 sm:right-5 md:right-6 ${currentTheme.cardinalOther} font-bold text-xs sm:text-sm md:text-base ${currentTheme.fontFamily === 'serif' ? 'font-serif' : currentTheme.fontFamily === 'mono' ? 'font-mono' : 'font-sans'}`}>T</span>
                <span className={`absolute bottom-3.5 sm:bottom-5 md:bottom-6 ${currentTheme.cardinalOther} font-bold text-xs sm:text-sm md:text-base ${currentTheme.fontFamily === 'serif' ? 'font-serif' : currentTheme.fontFamily === 'mono' ? 'font-mono' : 'font-sans'}`}>S</span>
                <span className={`absolute left-3.5 sm:left-5 md:left-6 ${currentTheme.cardinalOther} font-bold text-xs sm:text-sm md:text-base ${currentTheme.fontFamily === 'serif' ? 'font-serif' : currentTheme.fontFamily === 'mono' ? 'font-mono' : 'font-sans'}`}>B</span>

                {/* Degree Numbers */}
                <span className={`absolute top-9 sm:top-12 md:top-14 text-[10px] sm:text-xs md:text-sm ${currentTheme.degreeColor} font-mono font-semibold`}>0°</span>
                <span className={`absolute right-9 sm:right-12 md:right-14 text-[10px] sm:text-xs md:text-sm ${currentTheme.degreeColor} font-mono font-semibold`}>90°</span>
                <span className={`absolute bottom-9 sm:bottom-12 md:bottom-14 text-[10px] sm:text-xs md:text-sm ${currentTheme.degreeColor} font-mono font-semibold`}>180°</span>
                <span className={`absolute left-9 sm:left-12 md:left-14 text-[10px] sm:text-xs md:text-sm ${currentTheme.degreeColor} font-mono font-semibold`}>270°</span>

                {/* INNER KAABA PIN (Positioned at exact Qibla Angle on Dial) */}
                <div 
                  className="absolute inset-0 flex justify-center pointer-events-none"
                  style={{ transform: `rotate(${qiblaAngle}deg)` }}
                >
                  <div className="absolute top-4 sm:top-6 md:top-7 flex flex-col items-center group">
                    {/* Kaaba Icon Pin - Fully inside dial, never clipped */}
                    <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-11 md:h-11 rounded-full bg-emerald-600 border-2 border-amber-300 text-white flex items-center justify-center shadow-lg shadow-emerald-500/50 ring-2 ring-amber-300/40 animate-bounce">
                      <div className="w-4 h-4 sm:w-5 sm:h-5 md:w-5.5 md:h-5.5 bg-slate-950 border border-amber-400 rounded-xs flex flex-col justify-start overflow-hidden shadow-xs">
                        <div className="w-full h-1 sm:h-1.5 bg-amber-400" />
                      </div>
                    </div>
                    {/* Directional beam line to center */}
                    <div className={`w-0.5 sm:w-1 h-12 sm:h-20 md:h-28 lg:h-36 bg-gradient-to-b ${currentTheme.beamColor}`} />
                  </div>
                </div>

                {/* Center Core Dial Ring */}
                <div 
                  className={`w-24 h-24 sm:w-30 sm:h-30 md:w-36 md:h-36 lg:w-40 lg:h-40 rounded-full border-2 sm:border-[2.5px] flex flex-col items-center justify-center z-10 shadow-inner ${currentTheme.centerBorder}`}
                  style={{ backgroundColor: currentTheme.centerBg }}
                >
                  <span className={`text-xl sm:text-2xl md:text-3xl lg:text-4xl font-black font-mono leading-none my-0.5 ${currentTheme.centerDegree}`}>
                    {Math.round(effectiveHeading)}°
                  </span>
                  <span className={`text-[10px] sm:text-xs md:text-sm font-bold ${currentTheme.centerSubtext}`}>
                    {getCardinalDirection(effectiveHeading)}
                  </span>
                </div>

              </div>
            </div>

            {/* Info Status Kiblat, Arah Kiblat & Jarak Ka'bah */}
            <div className="mt-2 sm:mt-3 w-full max-w-sm sm:max-w-md md:max-w-lg mx-auto flex items-center justify-around px-4 sm:px-6 py-2.5 sm:py-3 rounded-2xl bg-slate-900 border border-slate-800 text-white shadow-md shrink-0">
              {/* Sebelah kiri Arah Kiblat: Petunjuk / Status Penyelarasan */}
              <div className="text-center flex-1 px-1">
                <span className={`text-[10px] block font-bold ${isAligned ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {isAligned ? 'Status' : 'Petunjuk'}
                </span>
                <span className={`font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1 ${
                  isAligned ? 'text-emerald-400' : 'text-white'
                }`}>
                  {isAligned ? (
                    <>
                      <CheckCircle2 size={13} className="text-emerald-400 shrink-0 animate-pulse" />
                      <span className="truncate">Tepat Kiblat</span>
                    </>
                  ) : (
                    <>
                      <Navigation size={12} className="text-emerald-400 shrink-0" />
                      <span className="truncate font-mono">
                        {angleDiff > 0 ? `Kanan ${Math.abs(angleDiff).toFixed(0)}°` : `Kiri ${Math.abs(angleDiff).toFixed(0)}°`}
                      </span>
                    </>
                  )}
                </span>
              </div>

              <div className="h-6 w-px bg-white/15" />

              {/* Arah Kiblat */}
              <div className="text-center flex-1 px-1">
                <span className="text-[10px] text-slate-400 block font-bold">Arah Kiblat</span>
                <span className="font-extrabold text-emerald-400 font-mono text-sm sm:text-base">{qiblaAngle}°</span>
              </div>

              <div className="h-6 w-px bg-white/15" />

              {/* Jarak Ka'bah */}
              <div className="text-center flex-1 px-1">
                <span className="text-[10px] text-slate-400 block font-bold">Jarak Ka'bah</span>
                <span className="font-extrabold text-amber-300 font-mono text-xs sm:text-sm">{distanceKm.toLocaleString('id-ID')} km</span>
              </div>
            </div>

          </div>
        ) : (
          /* ---------- MODE 2: KAMERA AR (AUGMENTED REALITY) OVERLAY ---------- */
          <div className="relative w-full flex-1 flex items-center justify-center my-4 overflow-hidden z-10">
            
            {/* Left Guidance Arrow (when Kaaba is to the left) */}
            {angleDiff < -FOV_DEG / 2 && (
              <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-3 py-2 bg-emerald-600/90 text-white rounded-2xl backdrop-blur-md shadow-lg animate-pulse border border-emerald-400">
                <ChevronLeft size={20} className="animate-bounce" />
                <div className="text-left">
                  <span className="text-[10px] font-bold block opacity-80">Kiblat di Kiri</span>
                  <span className="text-xs font-black">{Math.abs(angleDiff).toFixed(0)}°</span>
                </div>
              </div>
            )}

            {/* Right Guidance Arrow (when Kaaba is to the right) */}
            {angleDiff > FOV_DEG / 2 && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-3 py-2 bg-emerald-600/90 text-white rounded-2xl backdrop-blur-md shadow-lg animate-pulse border border-emerald-400">
                <div className="text-right">
                  <span className="text-[10px] font-bold block opacity-80">Kiblat di Kanan</span>
                  <span className="text-xs font-black">{Math.abs(angleDiff).toFixed(0)}°</span>
                </div>
                <ChevronRight size={20} className="animate-bounce" />
              </div>
            )}

            {/* FLOATING KAABA MARKER PIN (Reference image recreation) */}
            <div 
              className="absolute transition-all duration-75 ease-out flex flex-col items-center pointer-events-none"
              style={{
                left: `${arHorizontalPercent}%`,
                top: '28%',
                transform: `translate(-50%, -50%) scale(${isAligned ? 1.15 : 1})`,
                opacity: isKaabaInFOV ? 1 : 0.4
              }}
            >
              <div className="relative flex flex-col items-center">
                
                {/* Outer Glowing Badge */}
                <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center p-1 shadow-2xl transition-all ${
                  isAligned 
                    ? 'bg-emerald-500 ring-4 ring-emerald-300 animate-pulse shadow-emerald-500/80' 
                    : 'bg-emerald-600 border-2 border-white/90 shadow-black/80'
                }`}>
                  {/* Inner Kaaba Graphic Box */}
                  <div className="w-full h-full rounded-full bg-slate-950 flex flex-col items-center justify-center border-2 border-emerald-400 overflow-hidden relative shadow-inner">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-black border border-amber-400 rounded-xs relative flex flex-col justify-start">
                      <div className="w-full h-2 bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-500 border-b border-amber-600" />
                      <div className="w-1.5 h-3 bg-amber-400 absolute bottom-1 right-1 rounded-xs" />
                    </div>
                  </div>
                </div>

                {/* Pinpoint Triangle Bottom Pointer */}
                <div className="w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[14px] border-t-emerald-500 -mt-1 drop-shadow-md" />

                {/* Kaaba Distance Tag */}
                <div className="mt-1 px-3 py-0.5 rounded-full bg-black/75 backdrop-blur-md border border-white/20 text-white text-[10px] sm:text-xs font-extrabold whitespace-nowrap shadow-md">
                  Ka'bah • {distanceKm.toLocaleString('id-ID')} km
                </div>

              </div>
            </div>

            {/* GUIDANCE BEAM ARROW ON FLOOR */}
            {showFloorArrow && (
              <div 
                className="absolute bottom-24 sm:bottom-28 transition-all duration-75 ease-out flex flex-col items-center pointer-events-none"
                style={{
                  left: `${arHorizontalPercent}%`,
                  transform: `translateX(-50%) perspective(400px) rotateX(45deg) rotate(${angleDiff * 0.3}deg)`,
                  opacity: isKaabaInFOV ? 0.9 : 0.4
                }}
              >
                <div className="w-8 sm:w-10 h-24 sm:h-32 bg-gradient-to-t from-transparent via-white/40 to-white/90 flex flex-col items-center justify-start rounded-t-full shadow-lg">
                  <div className="w-0 h-0 border-l-[14px] border-l-transparent border-r-[14px] border-r-transparent border-b-[20px] border-b-white -mt-4 drop-shadow-lg" />
                </div>
              </div>
            )}

            {/* VIRTUAL SAJADAH OVERLAY */}
            {showSajadah && (
              <div 
                className="absolute bottom-1 sm:bottom-2 transition-all duration-75 ease-out pointer-events-none"
                style={{
                  transform: `perspective(500px) rotateX(55deg) rotate(${angleDiff * 0.4}deg) scale(${isAligned ? 1.05 : 1})`,
                  transformOrigin: 'bottom center'
                }}
              >
                <div className="w-48 sm:w-56 h-64 sm:h-76 bg-slate-950 border-4 border-amber-400/90 rounded-2xl p-2.5 shadow-2xl flex flex-col justify-between relative overflow-hidden">
                  <div className="absolute inset-1 border-2 border-dashed border-amber-400/60 rounded-xl pointer-events-none" />
                  
                  {/* Mihrab Arch */}
                  <div className="w-full h-40 sm:h-48 border-2 border-amber-400 rounded-t-full relative flex items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950">
                    <div className="w-24 sm:w-28 h-28 sm:h-32 border border-amber-300/80 rounded-t-full flex items-center justify-center">
                      <div className="w-4 h-4 rounded-full bg-amber-400/80 shadow-md shadow-amber-300" />
                    </div>
                  </div>

                  <div className="w-full text-center py-1 bg-amber-500/10 rounded-lg border border-amber-400/30">
                    <span className="text-[9px] font-black text-amber-300 uppercase tracking-widest">
                      KIBLAT {qiblaAngle}°
                    </span>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* Bottom Strip Footer for Camera Mode */}
        {isCameraMode && (
          <div className="z-10 w-full max-w-sm sm:max-w-md mx-auto flex items-center justify-around px-4 py-2 rounded-2xl border text-xs shadow-xs bg-black/60 backdrop-blur-md border-white/10 text-white shrink-0">
            {/* Sebelah kiri Arah Kiblat: Petunjuk / Status Penyelarasan */}
            <div className="text-center flex-1 px-1">
              <span className={`text-[10px] block font-bold ${isAligned ? 'text-emerald-400' : 'text-slate-400'}`}>
                {isAligned ? 'Status' : 'Petunjuk'}
              </span>
              <span className={`font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1 ${
                isAligned ? 'text-emerald-400' : 'text-white'
              }`}>
                {isAligned ? (
                  <>
                    <CheckCircle2 size={13} className="text-emerald-400 shrink-0 animate-pulse" />
                    <span className="truncate">Tepat Kiblat</span>
                  </>
                ) : (
                  <>
                    <Navigation size={12} className="text-emerald-400 shrink-0" />
                    <span className="truncate font-mono">
                      {angleDiff > 0 ? `Kanan ${Math.abs(angleDiff).toFixed(0)}°` : `Kiri ${Math.abs(angleDiff).toFixed(0)}°`}
                    </span>
                  </>
                )}
              </span>
            </div>

            <div className="h-5 w-px bg-white/15" />

            {/* Arah Kiblat */}
            <div className="text-center flex-1 px-1">
              <span className="text-[10px] text-slate-400 block font-bold">Arah Kiblat</span>
              <span className="font-extrabold text-emerald-400 font-mono text-sm">{qiblaAngle}°</span>
            </div>

            <div className="h-5 w-px bg-white/15" />

            {/* Jarak Ka'bah */}
            <div className="text-center flex-1 px-1">
              <span className="text-[10px] text-slate-400 block font-bold">Jarak Ka'bah</span>
              <span className="font-extrabold text-amber-300 font-mono text-xs">{distanceKm.toLocaleString('id-ID')} km</span>
            </div>
          </div>
        )}

      </div>

      {/* ================= 3-DOTS SUBMENU DRAWER / MODAL ================= */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setIsMenuOpen(false)}
        >
          <div 
            className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* Submenu Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                  <Compass size={18} />
                </div>
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900">
                  Pengaturan & Informasi
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsMenuOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-200/70 text-slate-500 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Submenu Content Body */}
            <div className="p-4 sm:p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              
              {/* 1. Lokasi Pengguna Card */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-slate-500">
                    <MapPin size={15} className="text-blue-600" />
                    <span className="text-[11px] uppercase font-extrabold tracking-wider text-slate-500">
                      Lokasi Pengguna
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={requestLocation}
                      disabled={isLocating || isLoadingAddress}
                      className="p-1 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                      title="GPS Refresh"
                    >
                      <RefreshCw size={14} className={(isLocating || isLoadingAddress) ? 'animate-spin text-blue-600' : ''} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        setIsCityModalOpen(true);
                      }}
                      className="px-2 py-0.5 rounded-md bg-blue-100 hover:bg-blue-200 text-blue-800 font-bold text-[10px] transition cursor-pointer"
                    >
                      Ubah Kota
                    </button>
                  </div>
                </div>

                {/* Nama Kota */}
                <div className="min-h-[22px] flex items-center">
                  {isLoadingAddress ? (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                      <RefreshCw size={12} className="animate-spin text-blue-600" />
                      <span>Mendeteksi kota & negara...</span>
                    </div>
                  ) : (
                    <p className="text-sm sm:text-base font-extrabold text-slate-900 leading-tight">
                      {cityName}
                    </p>
                  )}
                </div>

                {/* Nama Negara (teks lebih kecil dari kota) */}
                <p className="text-xs font-semibold text-slate-500 mt-0.5">
                  {countryName}
                </p>

                {/* Titik Koordinat GPS */}
                <p className="text-[10px] text-slate-400 font-mono mt-1">
                  Lat: {coords.lat.toFixed(4)}°, Lng: {coords.lng.toFixed(4)}°
                </p>

                {locationError && (
                  <p className="text-[10px] text-rose-500 font-medium mt-1">
                    {locationError}
                  </p>
                )}
              </div>

              {/* 2. Arah Derajat Kiblat & Jarak */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-emerald-50/60 rounded-2xl border border-emerald-100">
                  <span className="text-[10px] uppercase font-bold text-emerald-800/70 block">
                    Derajat Kiblat
                  </span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-base font-black text-emerald-900">{qiblaAngle}°</span>
                    <span className="text-[10px] font-bold text-emerald-700">{getCardinalDirection(qiblaAngle)}</span>
                  </div>
                </div>

                <div className="p-3 bg-amber-50/60 rounded-2xl border border-amber-100">
                  <span className="text-[10px] uppercase font-bold text-amber-800/70 block">
                    Jarak ke Ka'bah
                  </span>
                  <div className="text-base font-black text-amber-900 mt-0.5">
                    {distanceKm.toLocaleString('id-ID')} <span className="text-xs font-bold">km</span>
                  </div>
                </div>
              </div>

              {/* ===== ACCORDION TEMA KOMPAS (BERADA TEPAT DI BAWAH JARAK KE KA'BAH) ===== */}
              <div className="bg-slate-50 rounded-2xl border border-slate-200/80 overflow-hidden transition-all shadow-xs">
                <button
                  type="button"
                  onClick={() => setIsThemeAccordionOpen(!isThemeAccordionOpen)}
                  className="w-full p-3.5 flex items-center justify-between hover:bg-slate-100/80 transition cursor-pointer text-left select-none"
                  aria-expanded={isThemeAccordionOpen}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center border border-emerald-200/60 shrink-0">
                      <Palette size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-800">
                          Tema Kompas
                        </span>
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 truncate">
                          {currentTheme.name}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {isThemeAccordionOpen ? 'Pilih gaya tampilan dial kompas' : 'Ketuk untuk mengganti tema kompas (5 pilihan)'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {/* Mini Preview Swatch of Current Active Theme */}
                    <div 
                      className="w-6 h-6 rounded-full border-2 flex items-center justify-center shadow-2xs"
                      style={{
                        backgroundColor: currentTheme.previewBg,
                        borderColor: currentTheme.previewRing
                      }}
                      title={`Tema aktif: ${currentTheme.name}`}
                    >
                      <div 
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: currentTheme.previewAccent }}
                      />
                    </div>
                    <div className="text-slate-400 p-0.5">
                      {isThemeAccordionOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                </button>

                {/* Accordion Expandable Content */}
                {isThemeAccordionOpen && (
                  <div className="p-3 pt-1 border-t border-slate-200/70 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                    {(Object.keys(COMPASS_THEMES) as CompassThemeId[]).map((themeKey) => {
                      const theme = COMPASS_THEMES[themeKey];
                      const isSelected = compassTheme === themeKey;
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => handleSelectTheme(theme.id)}
                          className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-3 cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-50/90 border-emerald-500 shadow-xs'
                              : 'bg-white border-slate-200/90 hover:bg-slate-100/80'
                          }`}
                        >
                          {/* Left Preview Swatch & Label */}
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div 
                              className="w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 shadow-xs relative overflow-hidden"
                              style={{
                                backgroundColor: theme.previewBg,
                                borderColor: theme.previewRing
                              }}
                            >
                              <div 
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: theme.previewAccent }}
                              />
                              <div 
                                className="absolute inset-x-1 top-1 h-0.5 rounded-full opacity-60"
                                style={{ backgroundColor: theme.previewRing }}
                              />
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-xs font-bold truncate ${isSelected ? 'text-emerald-950' : 'text-slate-800'}`}>
                                  {theme.name}
                                </span>
                                <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-full shrink-0 ${
                                  isSelected ? 'bg-emerald-200 text-emerald-900' : 'bg-slate-100 text-slate-500'
                                }`}>
                                  {theme.badge}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500 truncate mt-0.5">
                                {theme.tagline}
                              </p>
                            </div>
                          </div>

                          {/* Right Selected Checkmark */}
                          {isSelected ? (
                            <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                              <Check size={12} strokeWidth={3} />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-full border border-slate-300 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 3. Audio & Haptic Toggle Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`p-3 rounded-2xl border text-left transition cursor-pointer flex items-center justify-between ${
                    soundEnabled 
                      ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900' 
                      : 'bg-slate-100 border-slate-200 text-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {soundEnabled ? <Volume2 size={16} className="text-emerald-600" /> : <VolumeX size={16} />}
                    <span className="text-xs font-bold">Suara Nada</span>
                  </div>
                  <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${
                    soundEnabled ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {soundEnabled ? 'ON' : 'OFF'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setHapticEnabled(!hapticEnabled)}
                  className={`p-3 rounded-2xl border text-left transition cursor-pointer flex items-center justify-between ${
                    hapticEnabled 
                      ? 'bg-blue-50/80 border-blue-300 text-blue-900' 
                      : 'bg-slate-100 border-slate-200 text-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Zap size={16} className={hapticEnabled ? 'text-blue-600' : 'text-slate-400'} />
                    <span className="text-xs font-bold">Getar Haptic</span>
                  </div>
                  <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${
                    hapticEnabled ? 'bg-blue-200 text-blue-800' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {hapticEnabled ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>

              {/* 4. Manual Mode Switch (Auto Tilt vs Paksa Kamera vs Paksa Kompas) */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                <span className="text-[11px] uppercase font-extrabold tracking-wider text-slate-500 block">
                  Pilihan Tampilan Layar
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMode('compass');
                      setCameraError(null);
                    }}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      !isCameraMode
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs' 
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Compass size={14} />
                    <span>Kompas Digital</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCameraPermissionDenied(false);
                      setActiveMode('camera');
                    }}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      isCameraMode
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs' 
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Camera size={14} />
                    <span>Kamera AR</span>
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-700 block">Auto Mode Kompas / AR</span>
                    <span className="text-[10px] text-slate-500">Tegak: Kamera AR &bull; Tiduran: Kompas</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAutoSwitchOnTilt(!autoSwitchOnTilt)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition cursor-pointer ${
                      autoSwitchOnTilt ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {autoSwitchOnTilt ? 'Aktif' : 'Nonaktif'}
                  </button>
                </div>
              </div>

              {/* 5. Sensor Android & iOS Permissions Card */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase font-extrabold tracking-wider text-slate-500 block">
                    Status Sensor Kompas
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    sensorDataLive ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {sensorDataLive ? '🟢 Sensor Aktif' : '🟡 Menunggu Data'}
                  </span>
                </div>

                <div className="text-[11px] text-slate-600 bg-white p-2 rounded-xl border border-slate-200/60 font-mono space-y-0.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tipe Sensor:</span>
                    <span className="font-bold text-slate-700">{sensorEventType || 'Menunggu Sinyal'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Paket Diterima:</span>
                    <span className="font-bold text-slate-700">{sensorEventCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Orientasi (Alpha/Pitch):</span>
                    <span className="font-bold text-slate-700">{sensorRawAlpha ?? '-'}° / {pitchBeta}°</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={requestSensorPermissionAndStart}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Zap size={14} />
                  <span>Hubungkan / Minta Izin Sensor</span>
                </button>

                {isInIframe && (
                  <a
                    href={typeof window !== 'undefined' ? window.location.href : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-2 text-center"
                  >
                    <ExternalLink size={14} />
                    <span>Buka di Tab Baru Chrome (Otomatis)</span>
                  </a>
                )}

                {/* Tombol Buka Animasi Kalibrasi 8 */}
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsCalibrationModalOpen(true);
                  }}
                  className="w-full py-2 px-3 bg-sky-50 hover:bg-sky-100 text-sky-800 rounded-xl text-xs font-bold border border-sky-200/80 transition cursor-pointer flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <RefreshCw size={13} className="text-sky-600" />
                    <span>Buka Animasi Kalibrasi (Angka 8)</span>
                  </div>
                  <ChevronRight size={13} className="text-sky-500" />
                </button>
              </div>

              {/* 6. Sensor iOS Prompt */}
              {needsPermissionPrompt && (
                <button
                  type="button"
                  onClick={requestSensorPermissionAndStart}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Zap size={14} />
                  <span>Izinkan Sensor Gerak Kompas (iOS)</span>
                </button>
              )}

            </div>

            {/* Submenu Footer */}
            <div className="p-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setIsMenuOpen(false)}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition cursor-pointer"
              >
                Tutup
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ================= INFO MODAL ("i" POPUP) ================= */}
      {isInfoModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200 cursor-pointer"
          onClick={() => setIsInfoModalOpen(false)}
        >
          <div 
            className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                  <Sparkles size={18} />
                </div>
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900">
                  Petunjuk & Akurasi Kompas
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsInfoModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-200/70 text-slate-500 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 space-y-3.5 text-xs text-slate-600 leading-relaxed">
              
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100">
                <h4 className="font-extrabold text-emerald-900 mb-1 flex items-center gap-1.5">
                  <Smartphone size={14} className="text-emerald-700" />
                  <span>Beralih Otomatis (Kompas & Kamera AR)</span>
                </h4>
                <p className="text-[11px] text-emerald-800/90">
                  • <strong>Pegang Datar / Sejajar Lantai</strong>: Menampilkan dial kompas digital.<br />
                  • <strong>Angkat Berdiri Tegak (Vertikal)</strong>: Secara otomatis mengaktifkan kamera AR dengan pin Ka'bah dan sajadah digital.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-extrabold text-slate-900">Tips Kalibrasi & Presisi:</h4>
                <ul className="space-y-2 text-slate-600">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <div className="flex-1">
                      <span>Gerakkan ponsel membentuk <strong>angka 8 (delapan)</strong> di udara untuk mengkalibrasi sensor kompas.</span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsInfoModalOpen(false);
                          setIsCalibrationModalOpen(true);
                        }}
                        className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-100/70 hover:bg-emerald-200/70 border border-emerald-300/80 px-2.5 py-1 rounded-lg cursor-pointer transition-colors"
                      >
                        <RefreshCw size={11} className="text-emerald-600" />
                        <span>Buka Animasi Gerakan Kalibrasi</span>
                      </button>
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <span>Jauhkan dari benda bermagnet, casing berbahan magnetik, laptop, atau logam berat.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <span>Aktifkan GPS lokasi berakurasi tinggi untuk menghitung derajat kiblat yang paling presisi.</span>
                  </li>
                </ul>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setIsInfoModalOpen(false)}
                className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition cursor-pointer"
              >
                Saya Mengerti
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ================= PILIH KOTA MODAL ================= */}
      {isCityModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200 cursor-pointer"
          onClick={() => setIsCityModalOpen(false)}
        >
          <div 
            className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin size={18} className="text-emerald-600" />
                <h3 className="font-extrabold text-slate-900 text-sm">Pilih Kota Manual</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCityModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500"
              >
                <X size={18} />
              </button>
            </div>

            {/* Search Box */}
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari nama kota atau provinsi..."
                  value={citySearchQuery}
                  onChange={(e) => setCitySearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-emerald-500"
                />
              </div>
            </div>

            {/* Cities List */}
            <div className="p-2 overflow-y-auto flex-1 divide-y divide-slate-100">
              {filteredCities.map((city) => (
                <button
                  key={city.name}
                  type="button"
                  onClick={() => selectCity(city)}
                  className="w-full text-left p-3 hover:bg-emerald-50/60 rounded-xl transition flex items-center justify-between group cursor-pointer"
                >
                  <div>
                    <span className="text-xs font-bold text-slate-800 block group-hover:text-emerald-700">
                      {city.name}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {city.province} • {city.country}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-slate-400 group-hover:text-emerald-600">
                    {calculateQiblaBearing(city.lat, city.lng)}°
                  </span>
                </button>
              ))}
            </div>

          </div>
        </div>
      )}

      {/* ================= COMPASS CALIBRATION MODAL (FIGURE-8 POPUP) ================= */}
      <CompassCalibrationModal
        isOpen={isCalibrationModalOpen}
        onClose={() => setIsCalibrationModalOpen(false)}
      />

    </div>
  );
};

