import { useState, useCallback, useEffect, useMemo } from 'react';
import Map from './components/Map';
import StationPopup from './components/StationPopup';
import Dashboard from './components/Dashboard';
import SearchBar from './components/SearchBar';
import ChatAssistant from './components/ChatAssistant';
import PrivacyModal from './components/PrivacyModal';
import { isSupabaseConfigured } from './lib/supabaseClient';
import { supabase } from './lib/supabaseClient';
import { getUserPosition } from './lib/geo';

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

  const filteredStations = useMemo(
    () => filterStationsBySearch(stations, searchQuery),
    [stations, searchQuery]
  );

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
          <div className="map-wrap-inline">
            <Map
              stations={filteredStations}
              loading={stationsLoading}
              error={stationsError}
              selectedStationId={selectedStation?.id}
              onSelectStation={handleSelectStation}
            />
          </div>
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
