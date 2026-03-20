import { useState, useCallback, useEffect, useMemo } from 'react';
import Map from './components/Map';
import StationPopup from './components/StationPopup';
import Dashboard from './components/Dashboard';
import SearchBar from './components/SearchBar';
import ChatAssistant from './components/ChatAssistant';
import PrivacyModal from './components/PrivacyModal';
import { isSupabaseConfigured } from './lib/supabaseClient';
import { supabase } from './lib/supabaseClient';
import { getUserPosition, haversine } from './lib/geo';

function trustedByStationFromReports(reports, upvoteCounts, downvoteCounts) {
  const scored = reports.map((r) => ({
    ...r,
    likes: upvoteCounts[r.id] || 0,
    dislikes: downvoteCounts[r.id] || 0,
    score: (upvoteCounts[r.id] || 0) - (downvoteCounts[r.id] || 0),
  }));
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.likes - a.likes ||
      new Date(b.reported_at || b.created_at) - new Date(a.reported_at || a.created_at)
  );
  const byStationFuel = {};
  for (const r of scored) {
    if (!byStationFuel[r.station_id]) byStationFuel[r.station_id] = {};
    if (!byStationFuel[r.station_id][r.fuel_type]) byStationFuel[r.station_id][r.fuel_type] = r;
  }
  const byStation = {};
  Object.entries(byStationFuel).forEach(([stationId, fuels]) => {
    const trusted = Object.values(fuels).map((r) => ({
      fuelType: r.fuel_type,
      price: Number(r.price),
    }));
    const valid = trusted.filter((r) => Number.isFinite(r.price));
    if (!valid.length) return;
    valid.sort((a, b) => a.price - b.price);
    byStation[stationId] = {
      bestPrice: valid[0].price,
      bestFuelType: valid[0].fuelType,
    };
  });
  return byStation;
}

function filterStationsBySearch(stations, query) {
  if (!query || !query.trim()) return stations;
  const q = query.trim().toLowerCase();
  return stations.filter(
    (s) =>
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.address && s.address.toLowerCase().includes(q))
  );
}

export default function App() {
  const [selectedStation, setSelectedStation] = useState(null);
  const [stations, setStations] = useState([]);
  const [stationsLoading, setStationsLoading] = useState(true);
  const [stationsError, setStationsError] = useState(null);
  const [reportsInvalidatedAt, setReportsInvalidatedAt] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [userPosition, setUserPosition] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [mapExplorerView, setMapExplorerView] = useState('map');
  const [trustedByStation, setTrustedByStation] = useState({});

  const filteredStations = useMemo(
    () => filterStationsBySearch(stations, searchQuery),
    [stations, searchQuery]
  );

  const mapStations = useMemo(
    () =>
      filteredStations.map((s) => ({
        ...s,
        badgePrice: trustedByStation[s.id]?.bestPrice ?? null,
        badgeFuelType: trustedByStation[s.id]?.bestFuelType ?? null,
      })),
    [filteredStations, trustedByStation]
  );

  const compactListStations = useMemo(() => {
    const list = mapStations.map((s) => {
      const distance =
        userPosition && s.lat != null && s.lng != null
          ? haversine(userPosition.lat, userPosition.lng, Number(s.lat), Number(s.lng))
          : null;
      return { ...s, distance };
    });
    return list
      .sort((a, b) => {
        const aHas = Number.isFinite(a.badgePrice);
        const bHas = Number.isFinite(b.badgePrice);
        if (aHas !== bHas) return bHas ? 1 : -1;
        if (userPosition && a.distance != null && b.distance != null) {
          return a.distance - b.distance;
        }
        return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
      })
      .slice(0, 14);
  }, [mapStations, userPosition]);

  useEffect(() => {
    if (!isSupabaseConfigured || !filteredStations.length) {
      setTrustedByStation({});
      return;
    }
    const stationIds = filteredStations.map((s) => s.id);
    (async () => {
      const { data: reportsData, error } = await supabase
        .from('price_reports')
        .select('*')
        .in('station_id', stationIds)
        .order('reported_at', { ascending: false });
      if (error || !reportsData?.length) {
        setTrustedByStation({});
        return;
      }
      const reportIds = reportsData.map((r) => r.id);
      const { data: up } = await supabase.from('upvotes').select('report_id').in('report_id', reportIds);
      const { data: down } = await supabase
        .from('downvotes')
        .select('report_id')
        .in('report_id', reportIds);
      const upCounts = {};
      const downCounts = {};
      reportIds.forEach((id) => {
        upCounts[id] = 0;
        downCounts[id] = 0;
      });
      (up || []).forEach((u) => {
        upCounts[u.report_id] = (upCounts[u.report_id] || 0) + 1;
      });
      (down || []).forEach((d) => {
        downCounts[d.report_id] = (downCounts[d.report_id] || 0) + 1;
      });
      setTrustedByStation(trustedByStationFromReports(reportsData, upCounts, downCounts));
    })();
  }, [filteredStations, reportsInvalidatedAt]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setStationsLoading(false);
      return;
    }
    (async () => {
      setStationsLoading(true);
      setStationsError(null);
      const { data, error } = await supabase
        .from('gas_stations')
        .select('*')
        .order('name');
      if (error) {
        setStationsError(error.message);
        setStations([]);
      } else {
        setStations(data || []);
      }
      setStationsLoading(false);
    })();
  }, []);

  const handleSelectStation = useCallback((station) => {
    setSelectedStation(station);
  }, []);

  const handleClosePopup = useCallback(() => {
    setSelectedStation(null);
    setReportsInvalidatedAt((t) => t + 1);
  }, []);

  const handleReportSubmitted = useCallback(() => {
    setReportsInvalidatedAt((t) => t + 1);
  }, []);

  const requestLocation = useCallback(() => {
    setLocationLoading(true);
    setLocationError(null);
    getUserPosition()
      .then((pos) => {
        setUserPosition(pos);
        setLocationLoading(false);
      })
      .catch((err) => {
        setLocationError(err.message || 'Location unavailable');
        setLocationLoading(false);
      });
  }, []);

  return (
    <>
      {!isSupabaseConfigured && (
        <div className="config-banner">
          Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>gas-map-app/.env</code>, then run <code>npm run build</code> in gas-map-app.
        </div>
      )}
      <header className="app-header">
        <div className="app-header__row">
          <div>
            <h1 className="app-title">CDO Gas Price Map</h1>
            <p className="app-sub">Cagayan de Oro — community fuel prices</p>
          </div>
          <div className="app-header__badge">{stations.length} stations tracked</div>
        </div>
      </header>
      <main className="app-main">
        <div className="search-bar-wrap">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            resultsCount={filteredStations.length}
            totalCount={stations.length}
          />
        </div>
        <Dashboard
          stations={filteredStations}
          reportsInvalidatedAt={reportsInvalidatedAt}
          onSelectStation={handleSelectStation}
          searchQuery={searchQuery}
          userPosition={userPosition}
          onRequestLocation={requestLocation}
          locationLoading={locationLoading}
          locationError={locationError}
        />
        <section className="map-section" aria-label="Map">
          <div className="map-section-head">
            <h2 className="map-section-title">Map Explorer</h2>
            <p className="map-section-sub">
              {searchQuery
                ? `Showing ${filteredStations.length} station${filteredStations.length !== 1 ? 's' : ''} matching your search.`
                : 'Tap any marker to open trusted reports and submit updates.'}
            </p>
          </div>
          <div className="map-list-segment" role="tablist" aria-label="Map explorer view">
            <button
              type="button"
              role="tab"
              aria-selected={mapExplorerView === 'map'}
              className={`map-list-segment__btn ${mapExplorerView === 'map' ? 'is-active' : ''}`}
              onClick={() => setMapExplorerView('map')}
            >
              Map
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mapExplorerView === 'list'}
              className={`map-list-segment__btn ${mapExplorerView === 'list' ? 'is-active' : ''}`}
              onClick={() => setMapExplorerView('list')}
            >
              List
            </button>
          </div>
          {mapExplorerView === 'map' ? (
            <div className="map-wrap-inline">
              <Map
                stations={mapStations}
                loading={stationsLoading}
                error={stationsError}
                selectedStationId={selectedStation?.id}
                onSelectStation={handleSelectStation}
              />
            </div>
          ) : (
            <div className="map-compact-list" role="tabpanel" aria-label="Station list view">
              {compactListStations.map((s) => (
                <button
                  key={`${s.id}-compact`}
                  type="button"
                  className="map-compact-list__item"
                  onClick={() => handleSelectStation(s)}
                >
                  <span className="map-compact-list__name">{s.name}</span>
                  <span className="map-compact-list__meta">
                    {s.distance != null ? `${s.distance.toFixed(1)} km` : 'CDO'}
                  </span>
                  <span className="map-compact-list__fuel">
                    {s.badgeFuelType?.includes('diesel')
                      ? 'Diesel'
                      : s.badgeFuelType?.includes('regular')
                        ? 'Unleaded'
                        : s.badgeFuelType?.includes('premium')
                          ? 'Premium'
                          : 'No report'}
                  </span>
                  <strong className="map-compact-list__price">
                    {Number.isFinite(s.badgePrice) ? `₱${s.badgePrice.toFixed(2)}` : '—'}
                  </strong>
                </button>
              ))}
            </div>
          )}
        </section>
        <footer className="app-footer" role="contentinfo">
          <div className="app-footer__inner">
            <nav className="app-footer__nav" aria-label="Footer links">
              <button type="button" className="app-footer__link" onClick={() => setPrivacyOpen(true)}>
                Privacy policy
              </button>
              <span className="app-footer__sep" aria-hidden>
                ·
              </span>
              <a
                className="app-footer__out"
                href="https://fhel-dev.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Developer profile
              </a>
            </nav>
            <p className="app-footer__credit">
              <strong className="app-footer__brand">CDO Gas Price Map</strong> — community fuel prices
              for Cagayan de Oro. Prices are user-submitted; please verify at the station. 
              <a
                href="https://fhel-dev.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="app-footer__out app-footer__out--inline"
              >
                Fhel
              </a>
              .
            </p>
          </div>
        </footer>
      </main>
      <PrivacyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      {selectedStation && (
        <StationPopup
          station={selectedStation}
          onClose={handleClosePopup}
          onReportSubmitted={handleReportSubmitted}
        />
      )}
      <ChatAssistant
        stations={filteredStations}
        userPosition={userPosition}
        onRequestLocation={requestLocation}
        locationLoading={locationLoading}
        locationError={locationError}
      />
    </>
  );
}
