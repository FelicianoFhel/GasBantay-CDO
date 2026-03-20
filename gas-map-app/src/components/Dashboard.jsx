import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { haversine } from '../lib/geo';
import { FUEL_TYPES } from '../constants';

const TREND_DAYS = 7;
const TREND_EPS = 0.15;

function reportTimeMs(r) {
  return new Date(r.reported_at || r.created_at).getTime();
}

/** One trusted “official” price per station (highest score, same as map), then mean. */
function avgOfficialPriceForWindow(
  reports,
  upvoteCounts,
  downvoteCounts,
  stationIdsSet,
  fuelType,
  startMs,
  endMs
) {
  const filtered = reports.filter(
    (r) =>
      r.fuel_type === fuelType &&
      stationIdsSet.has(r.station_id) &&
      reportTimeMs(r) >= startMs &&
      reportTimeMs(r) < endMs
  );
  const scored = filtered.map((r) => ({
    r,
    likes: upvoteCounts[r.id] || 0,
    dislikes: downvoteCounts[r.id] || 0,
    score: (upvoteCounts[r.id] || 0) - (downvoteCounts[r.id] || 0),
  }));
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.likes - a.likes ||
      reportTimeMs(b.r) - reportTimeMs(a.r)
  );
  const bestByStation = {};
  for (const { r } of scored) {
    if (!bestByStation[r.station_id]) bestByStation[r.station_id] = r;
  }
  const prices = Object.values(bestByStation).map((r) => Number(r.price));
  if (prices.length === 0) return null;
  return prices.reduce((a, b) => a + b, 0) / prices.length;
}

function TrendChevron({ direction }) {
  const cls =
    direction === 'up'
      ? 'dashboard-fuel-card__trend dashboard-fuel-card__trend--up'
      : 'dashboard-fuel-card__trend dashboard-fuel-card__trend--down';
  const label =
    direction === 'up' ? 'Higher than prior week' : 'Lower than prior week';
  return (
    <span className={cls} aria-label={label} title={label}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {direction === 'up' ? (
          <path d="M18 15l-6-6-6 6" />
        ) : (
          <path d="M6 9l6 6 6-6" />
        )}
      </svg>
    </span>
  );
}

export default function Dashboard({
  stations,
  reportsInvalidatedAt = 0,
  searchQuery = '',
  onSelectStation,
  userPosition,
  onRequestLocation,
  locationLoading,
  locationError,
}) {
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
      .slice(0, 4)
      .map((s) => ({
        ...s,
        photoUrl: bestPhotoByStation[s.id],
      }));
  }, [getStationsWithDistance, bestPhotoByStation]);

  const cheapestList = userPosition ? getCheapestNearMe() : [];
  const nearMeList = userPosition ? getNearMe() : [];

  const fuelMarketStats = useMemo(() => {
    const stationIdsSet = new Set((stations || []).map((s) => s.id));
    const now = Date.now();
    const msDay = 24 * 60 * 60 * 1000;
    const windowMs = TREND_DAYS * msDay;
    const curStart = now - windowMs;
    const prevStart = now - 2 * windowMs;
    const prevEnd = now - windowMs;

    return FUEL_TYPES.map(({ value, tabLabel }) => {
      const curWindow = avgOfficialPriceForWindow(
        reports,
        upvoteCounts,
        downvoteCounts,
        stationIdsSet,
        value,
        curStart,
        now + 1
      );
      const prevWindow = avgOfficialPriceForWindow(
        reports,
        upvoteCounts,
        downvoteCounts,
        stationIdsSet,
        value,
        prevStart,
        prevEnd
      );
      const allTime = avgOfficialPriceForWindow(
        reports,
        upvoteCounts,
        downvoteCounts,
        stationIdsSet,
        value,
        0,
        now + 1
      );
      const displayAvg = curWindow ?? allTime;
      let trend = null;
      if (curWindow != null && prevWindow != null) {
        if (curWindow - prevWindow > TREND_EPS) trend = 'up';
        else if (prevWindow - curWindow > TREND_EPS) trend = 'down';
      }
      return {
        value,
        tabLabel,
        displayAvg,
        trend,
        usedSevenDay: curWindow != null,
      };
    });
  }, [stations, reports, upvoteCounts, downvoteCounts]);

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
              onClick={onRequestLocation}
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

        <div className="dashboard-fuel-cards" aria-label="Average official price by fuel">
          {fuelMarketStats.map(({ value, tabLabel, displayAvg, trend, usedSevenDay }) => (
            <article key={value} className="dashboard-fuel-card">
              <div className="dashboard-fuel-card__head">
                <span className="dashboard-fuel-card__fuel">{tabLabel}</span>
                {trend === 'up' && <TrendChevron direction="up" />}
                {trend === 'down' && <TrendChevron direction="down" />}
              </div>
              <p className="dashboard-fuel-card__hint">Avg. official price</p>
              {reportsLoading ? (
                <strong className="dashboard-fuel-card__price">…</strong>
              ) : displayAvg != null ? (
                <strong className="dashboard-fuel-card__price">
                  ₱{displayAvg.toFixed(2)}
                </strong>
              ) : (
                <strong className="dashboard-fuel-card__price dashboard-fuel-card__price--empty">
                  —
                </strong>
              )}
              <p className="dashboard-fuel-card__meta">
                {displayAvg == null
                  ? 'No reports for this fuel'
                  : usedSevenDay
                    ? `Trusted avg. · last ${TREND_DAYS} days · ${stations.length} stations`
                    : `Trusted avg. · all data · ${stations.length} stations`}
              </p>
            </article>
          ))}
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
