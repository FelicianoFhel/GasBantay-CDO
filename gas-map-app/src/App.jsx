import { useState, useCallback, useEffect, useMemo } from 'react';
import Map from './components/Map';
import StationPopup from './components/StationPopup';
import Dashboard from './components/Dashboard';
import SearchBar from './components/SearchBar';
import ChatAssistant from './components/ChatAssistant';
import { isSupabaseConfigured } from './lib/supabaseClient';
import { supabase } from './lib/supabaseClient';

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
      </main>
      {selectedStation && (
        <StationPopup
          station={selectedStation}
          onClose={handleClosePopup}
          onReportSubmitted={handleReportSubmitted}
        />
      )}
      <ChatAssistant />
    </>
  );
}
