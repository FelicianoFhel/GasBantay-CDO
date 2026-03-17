import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getUserPosition, haversine } from '../lib/geo';
import { FUEL_TYPES } from '../constants';

export default function Dashboard({ stations, reportsInvalidatedAt = 0, searchQuery = '', onSelectStation }) {
  const [userPosition, setUserPosition] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [fuelType, setFuelType] = useState('diesel');
  const [reports, setReports] = useState([]);
  const [upvoteCounts, setUpvoteCounts] = useState({});
  const [downvoteCounts, setDownvoteCounts] = useState({});
  const [reportsLoading, setReportsLoading] = useState(true);

  // Fetch all price reports and upvote counts for current stations
  useEffect(() => {
    if (!stations?.length) {
      setReports([]);
      setUpvoteCounts({});
      setDownvoteCounts({});
      setReportsLoading(false);
      return;
    }
    const stationIds = stations.map((s) => s.id);
    setReportsLoading(true);
    (async () => {
      const { data: reportsData, error: e1 } = await supabase
        .from('price_reports')
        .select('*')
        .in('station_id', stationIds)
        .order('reported_at', { ascending: false });
      if (e1) {
        setReports([]);
        setReportsLoading(false);
        return;
      }
      const list = reportsData || [];
      setReports(list);
      if (list.length === 0) {
        setUpvoteCounts({});
        setDownvoteCounts({});
        setReportsLoading(false);
        return;
      }
      const reportIds = list.map((r) => r.id);
      const { data: upvotesData } = await supabase
        .from('upvotes')
        .select('report_id')
        .in('report_id', reportIds);
      const { data: downvotesData } = await supabase
        .from('downvotes')
        .select('report_id')
        .in('report_id', reportIds);
      const counts = {};
      const downCounts = {};
      reportIds.forEach((id) => {
        counts[id] = 0;
        downCounts[id] = 0;
      });
      (upvotesData || []).forEach((u) => {
        counts[u.report_id] = (counts[u.report_id] || 0) + 1;
      });
      (downvotesData || []).forEach((u) => {
        downCounts[u.report_id] = (downCounts[u.report_id] || 0) + 1;
      });
      setUpvoteCounts(counts);
      setDownvoteCounts(downCounts);
      setReportsLoading(false);
    })();
  }, [stations, reportsInvalidatedAt]);

  const getBestReportPerStation = useCallback(() => {
    const withVotes = reports.map((r) => {
      const likes = upvoteCounts[r.id] || 0;
      const dislikes = downvoteCounts[r.id] || 0;
      return { ...r, likes, dislikes, score: likes - dislikes };
    });
    const sorted = [...withVotes].sort(
      (a, b) =>
        b.score - a.score ||
        b.likes - a.likes ||
        new Date(b.reported_at || b.created_at) - new Date(a.reported_at || a.created_at)
    );
    const byStation = {};
    const bestPhotoByStation = {};
    sorted.forEach((r) => {
      const sid = r.station_id;
      if (!byStation[sid]) byStation[sid] = {};
      if (!byStation[sid][r.fuel_type]) {
        byStation[sid][r.fuel_type] = r;
        if (!bestPhotoByStation[sid] && r.photo_url) bestPhotoByStation[sid] = r.photo_url;
      }
    });
    return { byStation, bestPhotoByStation };
  }, [reports, upvoteCounts, downvoteCounts]);

  const { byStation, bestPhotoByStation } = getBestReportPerStation();

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

  const getStationsWithDistance = useCallback(() => {
    if (!userPosition) return [];
    return stations.map((s) => ({
      ...s,
      distance: haversine(
        userPosition.lat,
        userPosition.lng,
        Number(s.lat),
        Number(s.lng)
      ),
    }));
  }, [stations, userPosition]);

  const getCheapestNearMe = useCallback(() => {
    const withDist = getStationsWithDistance();
    if (!withDist.length) return [];
    return withDist
      .map((s) => {
        const report = byStation[s.id]?.[fuelType];
        return {
          ...s,
          price: report ? Number(report.price) : null,
          photoUrl: report?.photo_url || bestPhotoByStation[s.id],
        };
      })
      .filter((s) => s.price != null)
      .sort((a, b) => a.price - b.price || a.distance - b.distance)
      .slice(0, 10);
  }, [getStationsWithDistance, byStation, fuelType, bestPhotoByStation]);

  const getNearMe = useCallback(() => {
    const withDist = getStationsWithDistance();
    if (!withDist.length) return [];
    return [...withDist]
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10)
      .map((s) => ({
        ...s,
        photoUrl: bestPhotoByStation[s.id],
      }));
  }, [getStationsWithDistance, bestPhotoByStation]);

  const cheapestList = userPosition ? getCheapestNearMe() : [];
  const nearMeList = userPosition ? getNearMe() : [];
  const withPhotosCount = reports.filter((r) => Boolean(r.photo_url)).length;

  return (
    <div className="dashboard">
      <section className="dashboard-hero">
        <div>
          <h2 className="dashboard-hero__title">Fuel Intelligence Dashboard</h2>
          <p className="dashboard-hero__sub">
            Find verified prices faster using community trust and nearby ranking.
          </p>
        </div>
        <div className="dashboard-hero__actions">
          {!userPosition ? (
            <button
              type="button"
              className="btn-primary dashboard-btn"
              onClick={requestLocation}
              disabled={locationLoading}
            >
              {locationLoading ? 'Getting location…' : 'Use my location'}
            </button>
          ) : (
            <label className="dashboard-label">
              Fuel type
              <select
                className="form-select dashboard-select"
                value={fuelType}
                onChange={(e) => setFuelType(e.target.value)}
              >
                {FUEL_TYPES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="dashboard-stats">
          <article className="dashboard-stat">
            <span className="dashboard-stat__label">Stations</span>
            <strong className="dashboard-stat__value">{stations.length}</strong>
          </article>
          <article className="dashboard-stat">
            <span className="dashboard-stat__label">Price reports</span>
            <strong className="dashboard-stat__value">{reports.length}</strong>
          </article>
          <article className="dashboard-stat">
            <span className="dashboard-stat__label">Reports with photos</span>
            <strong className="dashboard-stat__value">{withPhotosCount}</strong>
          </article>
        </div>
        {locationError && <p className="form-msg error">{locationError}</p>}
      </section>

      {searchQuery && stations.length === 0 ? (
        <div className="dashboard-empty-search">
          <p className="dashboard-empty-search__text">No stations match “{searchQuery}”.</p>
          <p className="dashboard-empty-search__hint">Try a different name or address, or clear the search.</p>
        </div>
      ) : (
        <>
      <section className="dashboard-section dashboard-panel">
        <div className="dashboard-section-head">
          <h3 className="dashboard-title">Cheapest Near Me</h3>
          <p className="dashboard-desc">Lowest trusted prices for your selected fuel type.</p>
        </div>
        {reportsLoading ? (
          <p className="station-panel__muted">Loading prices…</p>
        ) : userPosition && cheapestList.length === 0 ? (
          <p className="station-panel__muted">
            No reported prices for {FUEL_TYPES.find((f) => f.value === fuelType)?.label} nearby.
          </p>
        ) : (
          <div className="card-grid">
            {cheapestList.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className="station-card"
                onClick={() => onSelectStation(s)}
              >
                <div className="station-card__img-wrap">
                  {s.photoUrl ? (
                    <img src={s.photoUrl} alt="" className="station-card__img" />
                  ) : (
                    <div className="station-card__img-placeholder" aria-hidden="true">
                      <span className="station-card__placeholder-icon" aria-hidden="true">⛽</span>
                    </div>
                  )}
                  <span className="station-card__rank">#{i + 1}</span>
                </div>
                <div className="station-card__body">
                  <span className="station-card__name">{s.name}</span>
                  {s.address && <span className="station-card__address">{s.address}</span>}
                  <span className="station-card__price">₱{s.price?.toFixed(2)}</span>
                  <span className="station-card__meta">{s.distance.toFixed(1)} km away</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-section dashboard-panel">
        <div className="dashboard-section-head">
          <h3 className="dashboard-title">Stations Near Me</h3>
          <p className="dashboard-desc">Closest stations sorted by distance from your location.</p>
        </div>
        {reportsLoading ? (
          <p className="station-panel__muted">Loading…</p>
        ) : (
          <div className="card-grid">
            {nearMeList.map((s) => (
              <button
                key={s.id}
                type="button"
                className="station-card"
                onClick={() => onSelectStation(s)}
              >
                <div className="station-card__img-wrap">
                  {s.photoUrl ? (
                    <img src={s.photoUrl} alt="" className="station-card__img" />
                  ) : (
                    <div className="station-card__img-placeholder" aria-hidden="true">
                      <span className="station-card__placeholder-icon" aria-hidden="true">⛽</span>
                    </div>
                  )}
                </div>
                <div className="station-card__body">
                  <span className="station-card__name">{s.name}</span>
                  {s.address && <span className="station-card__address">{s.address}</span>}
                  <span className="station-card__meta">{s.distance.toFixed(1)} km away</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
        </>
      )}
    </div>
  );
}
