import { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { DivIcon, Icon, LatLngBounds } from 'leaflet';

const markerIcon = new Icon({
  iconUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const buildPriceIcon = (
  priceLabel: string | null,
  hasPrices: boolean,
  color: string
) =>
  new DivIcon({
    className: 'price-marker',
    html: hasPrices
      ? `<div class="marker-stack"><div class="marker-label" style="background:${color}">${priceLabel ?? ''}</div><div class="marker-dot" style="background:${color}"></div></div>`
      : '<div class="marker-dot marker-dot--grey"></div>',
    iconSize: hasPrices ? [48, 40] : [16, 16],
    iconAnchor: hasPrices ? [24, 24] : [8, 8],
    popupAnchor: [0, -18],
  });

type FuelRow = Record<string, string>;

type FuelPoint = {
  id: string;
  lat: number;
  lng: number;
  tradingName: string;
  brand: string;
  address: string;
  postcode: string;
  updated: string;
  prices: Record<string, string>;
  hasPrices: boolean;
  displayPrice: string | null;
  displayPriceValue: number | null;
};

const priceKeys = [
  'forecourts.fuel_price.E5',
  'forecourts.fuel_price.E10',
  'forecourts.fuel_price.B7P',
  'forecourts.fuel_price.B7S',
  'forecourts.fuel_price.B10',
  'forecourts.fuel_price.HVO',
];

const toNumber = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizePrice = (value: string) => value.replace(/^'+/, '');

const formatPriceLabel = (value: string) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return value;
  const pounds = parsed / 100;
  return `£${pounds.toFixed(2)}`;
};

const toPounds = (value: string) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed / 100;
};

const formatPriceValue = (value: string) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return value;
  const pounds = parsed / 100;
  return `£${pounds.toFixed(3)}`;
};

const getDisplayPrice = (prices: Record<string, string>) => {
  const preferred = ['E10', 'E5', 'B7S', 'B7P', 'B10', 'HVO'];
  for (const key of preferred) {
    const value = prices[key];
    if (value) return formatPriceLabel(value);
  }
  return null;
};

const getDisplayPriceValue = (prices: Record<string, string>) => {
  const preferred = ['E10', 'E5', 'B7S', 'B7P', 'B10', 'HVO'];
  for (const key of preferred) {
    const value = prices[key];
    if (value) return toPounds(value);
  }
  return null;
};

const priceToColor = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value) || min === max) return '#16a34a';
  const t = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const hue = 120 - 120 * t;
  return `hsl(${hue}, 70%, 45%)`;
};

function FitBounds({ points }: { points: FuelPoint[] }) {
  const map = useMap();
  const bounds = useMemo(() => {
    if (points.length === 0) return null;
    const latLngs = points.map((p) => [p.lat, p.lng] as [number, number]);
    return new LatLngBounds(latLngs);
  }, [points]);

  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [bounds, map]);

  return null;
}

function MapSizer({ trigger }: { trigger: number }) {
  const map = useMap();
  useEffect(() => {
    const id = window.setTimeout(() => {
      map.invalidateSize();
    }, 50);
    return () => window.clearTimeout(id);
  }, [map, trigger]);
  return null;
}

export default function App() {
  const [fileName, setFileName] = useState<string>('');
  const [rows, setRows] = useState<FuelPoint[]>([]);
  const [parseError, setParseError] = useState<string>('');
  const [tileCounts, setTileCounts] = useState<{ loaded: number; error: number }>({
    loaded: 0,
    error: 0,
  });

  const handleFile = (file: File) => {
    setFileName(file.name);
    setParseError('');
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const trimmed = text.trimStart();
      if (!trimmed.includes(',') || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
        setParseError(
          'This file does not look like the CSV (it looks like HTML or has no commas). Please re-download the CSV and try again.'
        );
        setRows([]);
        return;
      }

      Papa.parse<FuelRow>(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length) {
            setParseError(results.errors[0].message);
          }

          const points: FuelPoint[] = [];
          for (const row of results.data) {
            const lat = toNumber(row['forecourts.location.latitude'] ?? '');
            const lng = toNumber(row['forecourts.location.longitude'] ?? '');
            if (lat === null || lng === null) continue;

            const tradingName = row['forecourts.trading_name'] || 'Unknown site';
            const brand = row['forecourts.brand_name'] || 'Unknown brand';
            const address = [
              row['forecourts.location.address_line_1'],
              row['forecourts.location.address_line_2'],
              row['forecourts.location.city'],
              row['forecourts.location.county'],
            ]
              .filter(Boolean)
              .join(', ');
            const postcode = row['forecourts.location.postcode'] || '';
            const updated = row['latest_update_timestamp'] || '';
          const prices: Record<string, string> = {};
          for (const key of priceKeys) {
            const value = row[key];
            if (value) prices[key.split('.').pop() ?? key] = normalizePrice(value);
          }

          const hasPrices = Object.keys(prices).length > 0;
          const displayPrice = hasPrices ? getDisplayPrice(prices) : null;
          const displayPriceValue = hasPrices ? getDisplayPriceValue(prices) : null;

          points.push({
            id: row['forecourts.node_id'] || `${lat},${lng}`,
            lat,
            lng,
            tradingName,
            brand,
            address,
            postcode,
            updated,
            prices,
            hasPrices,
            displayPrice,
            displayPriceValue,
          });
        }

          setRows(points);
        },
        error: (error: Error) => setParseError(error.message),
      });
    };
    reader.onerror = () => setParseError('Could not read the file.');
    reader.readAsText(file);
  };

  const stats = useMemo(() => {
    if (rows.length === 0) return null;
    const uniqueBrands = new Set(rows.map((row) => row.brand)).size;
    return { count: rows.length, brands: uniqueBrands };
  }, [rows]);

  const priceRange = useMemo(() => {
    const values = rows
      .map((row) => row.displayPriceValue)
      .filter((value): value is number => value !== null);
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const pick = (p: number) => {
      const idx = Math.floor(p * (sorted.length - 1));
      return sorted[idx];
    };
    return { min: pick(0.1), max: pick(0.9) };
  }, [rows]);

  return (
    <div className="app">
      <header className="header">
        <h1>UK Fuel Prices Map</h1>
        <p>Upload the latest CSV to see forecourts and prices plotted on OpenStreetMap.</p>
      </header>

      <section className="controls">
        <input
          type="file"
          accept=".csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        {fileName ? <span>Loaded: {fileName}</span> : <span>No file selected.</span>}
        {parseError ? <span>Parse error: {parseError}</span> : null}
      </section>

      {stats ? (
        <section className="stats">
          <span className="stat-pill">Sites: {stats.count}</span>
          <span className="stat-pill">Brands: {stats.brands}</span>
          <span className="stat-pill">
            Tiles: {tileCounts.loaded} loaded, {tileCounts.error} errors
          </span>
        </section>
      ) : null}

      <div className="map-wrap">
        <MapContainer
          center={[54.8, -4.6]}
          zoom={6}
          scrollWheelZoom
          style={{ height: '60vh', minHeight: '60vh', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            eventHandlers={{
              tileload: () =>
                setTileCounts((prev) => ({ ...prev, loaded: prev.loaded + 1 })),
              tileerror: () =>
                setTileCounts((prev) => ({ ...prev, error: prev.error + 1 })),
            }}
          />
          {rows.map((row) => (
            <Marker
              key={row.id}
              position={[row.lat, row.lng]}
              icon={buildPriceIcon(
                row.displayPrice,
                row.hasPrices,
                row.displayPriceValue !== null && priceRange
                  ? priceToColor(row.displayPriceValue, priceRange.min, priceRange.max)
                  : '#16a34a'
              )}
            >
              <Popup>
                <div className="popup">
                  <h3>{row.tradingName}</h3>
                  <p>{row.brand}</p>
                  <p>{row.address}</p>
                  {row.postcode ? <p>{row.postcode}</p> : null}
                  {row.updated ? <p>Updated: {row.updated}</p> : null}
                  {Object.keys(row.prices).length ? (
                    <p>
                      Prices:{' '}
                      {Object.entries(row.prices)
                        .map(([key, value]) => `${key}: ${formatPriceValue(value)}`)
                        .join(' · ')}
                    </p>
                  ) : (
                    <p>Prices: not provided</p>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
          <MapSizer trigger={rows.length} />
          {rows.length ? <FitBounds points={rows} /> : null}
        </MapContainer>
      </div>

      <footer className="footer">
        Data stays in your browser; upload the CSV file you already have.
      </footer>
    </div>
  );
}
