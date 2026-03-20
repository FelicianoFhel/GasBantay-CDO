import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getVoterId } from '../lib/fingerprint';
import { formatUpdatedAt } from '../lib/relativeTime';
import {
  getVoteCooldownRemainingMs,
  startVoteCooldown,
  formatCooldownClock,
} from '../lib/voteCooldown';
import { FUEL_TYPES } from '../constants';
import SubmitPriceForm from './SubmitPriceForm';

const RECENT_COLLAPSED = 3;
const RECENT_MAX = 10;

export default function StationPopup({ station, onClose, onReportSubmitted }) {
  const [reports, setReports] = useState([]);
  const [likeCounts, setLikeCounts] = useState({});
  const [dislikeCounts, setDislikeCounts] = useState({});
  const [myLikes, setMyLikes] = useState(new Set());
  const [myDislikes, setMyDislikes] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [reportsExpanded, setReportsExpanded] = useState(false);
  const [activeFuelTab, setActiveFuelTab] = useState(FUEL_TYPES[0].value);
  const [detailReport, setDetailReport] = useState(null);
  const [cooldownTick, setCooldownTick] = useState(0);
  const voterId = getVoterId();

  useEffect(() => {
    const id = setInterval(() => setCooldownTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setReportsExpanded(false);
    setDetailReport(null);
    setActiveFuelTab(FUEL_TYPES[0].value);
  }, [station?.id]);

  useEffect(() => {
    if (!detailReport) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setDetailReport(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailReport]);

  const voteCooldownMs = useMemo(
    () => getVoteCooldownRemainingMs(activeFuelTab),
    [cooldownTick, activeFuelTab]
  );
  const voteLocked = voteCooldownMs > 0;
  const activeTabLabel =
    FUEL_TYPES.find((f) => f.value === activeFuelTab)?.tabLabel || 'This fuel';

  const fetchReports = useCallback(async () => {
    if (!station?.id) return;
    const { data: reportsData, error: e1 } = await supabase
      .from('price_reports')
      .select('*')
      .eq('station_id', station.id)
      .order('reported_at', { ascending: false });

    if (e1) {
      setReports([]);
      setLoading(false);
      return;
    }

    const list = reportsData || [];
    setReports(list);

    if (list.length === 0) {
      setLikeCounts({});
      setDislikeCounts({});
      setMyLikes(new Set());
      setMyDislikes(new Set());
      setLoading(false);
      return;
    }

    const reportIds = list.map((r) => r.id);
    const { data: likesData } = await supabase
      .from('upvotes')
      .select('report_id')
      .in('report_id', reportIds);
    const { data: dislikesData } = await supabase
      .from('downvotes')
      .select('report_id')
      .in('report_id', reportIds);

    const likes = {};
    const dislikes = {};
    const mineLikes = new Set();
    const mineDislikes = new Set();
    reportIds.forEach((id) => {
      likes[id] = 0;
      dislikes[id] = 0;
    });
    (likesData || []).forEach((u) => {
      likes[u.report_id] = (likes[u.report_id] || 0) + 1;
    });
    (dislikesData || []).forEach((u) => {
      dislikes[u.report_id] = (dislikes[u.report_id] || 0) + 1;
    });

    const { data: myLikesData } = await supabase
      .from('upvotes')
      .select('report_id')
      .in('report_id', reportIds)
      .eq('fingerprint', voterId);
    const { data: myDislikesData } = await supabase
      .from('downvotes')
      .select('report_id')
      .in('report_id', reportIds)
      .eq('fingerprint', voterId);
    (myLikesData || []).forEach((u) => mineLikes.add(u.report_id));
    (myDislikesData || []).forEach((u) => mineDislikes.add(u.report_id));

    setLikeCounts(likes);
    setDislikeCounts(dislikes);
    setMyLikes(mineLikes);
    setMyDislikes(mineDislikes);
    setLoading(false);
  }, [station?.id, voterId]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Display the most trusted report per fuel type (likes - dislikes); if tie, use most recent
  const reportsWithVotes = reports.map((r) => {
    const likes = likeCounts[r.id] || 0;
    const dislikes = dislikeCounts[r.id] || 0;
    return { ...r, likes, dislikes, score: likes - dislikes };
  });
  const sortedByTrust = [...reportsWithVotes].sort(
    (a, b) =>
      b.score - a.score ||
      b.likes - a.likes ||
      new Date(b.reported_at || b.created_at) - new Date(a.reported_at || a.created_at)
  );
  const latestByFuel = {};
  sortedByTrust.forEach((r) => {
    if (!latestByFuel[r.fuel_type]) latestByFuel[r.fuel_type] = r;
  });
  const topReport = sortedByTrust[0];
  const updatedAt = topReport?.reported_at || topReport?.created_at;

  const handleLike = async (reportId, fuelType) => {
    if (myLikes.has(reportId)) {
      const { error } = await supabase
        .from('upvotes')
        .delete()
        .eq('report_id', reportId)
        .eq('fingerprint', voterId);
      if (error) {
        await fetchReports();
        return;
      }
      setMyLikes((s) => {
        const next = new Set(s);
        next.delete(reportId);
        return next;
      });
      setLikeCounts((c) => ({
        ...c,
        [reportId]: Math.max(0, (c[reportId] || 0) - 1),
      }));
      startVoteCooldown(fuelType);
      await fetchReports();
      return;
    }

    if (myDislikes.has(reportId)) {
      const { error: delDownErr } = await supabase
        .from('downvotes')
        .delete()
        .eq('report_id', reportId)
        .eq('fingerprint', voterId);
      if (delDownErr) {
        await fetchReports();
        return;
      }
      setMyDislikes((s) => {
        const next = new Set(s);
        next.delete(reportId);
        return next;
      });
      setDislikeCounts((c) => ({
        ...c,
        [reportId]: Math.max(0, (c[reportId] || 0) - 1),
      }));
    }

    const { error } = await supabase.from('upvotes').insert({
      report_id: reportId,
      fingerprint: voterId,
    });
    if (error) {
      await fetchReports();
      return;
    }
    setMyLikes((s) => new Set(s).add(reportId));
    setLikeCounts((c) => ({ ...c, [reportId]: (c[reportId] || 0) + 1 }));
    startVoteCooldown(fuelType);
    await fetchReports();
  };

  const handleDislike = async (reportId, fuelType) => {
    if (myDislikes.has(reportId)) {
      const { error } = await supabase
        .from('downvotes')
        .delete()
        .eq('report_id', reportId)
        .eq('fingerprint', voterId);
      if (error) {
        await fetchReports();
        return;
      }
      setMyDislikes((s) => {
        const next = new Set(s);
        next.delete(reportId);
        return next;
      });
      setDislikeCounts((c) => ({
        ...c,
        [reportId]: Math.max(0, (c[reportId] || 0) - 1),
      }));
      startVoteCooldown(fuelType);
      await fetchReports();
      return;
    }

    if (myLikes.has(reportId)) {
      const { error: delUpErr } = await supabase
        .from('upvotes')
        .delete()
        .eq('report_id', reportId)
        .eq('fingerprint', voterId);
      if (delUpErr) {
        await fetchReports();
        return;
      }
      setMyLikes((s) => {
        const next = new Set(s);
        next.delete(reportId);
        return next;
      });
      setLikeCounts((c) => ({
        ...c,
        [reportId]: Math.max(0, (c[reportId] || 0) - 1),
      }));
    }

    const { error } = await supabase.from('downvotes').insert({
      report_id: reportId,
      fingerprint: voterId,
    });
    if (error) {
      await fetchReports();
      return;
    }
    setMyDislikes((s) => new Set(s).add(reportId));
    setDislikeCounts((c) => ({ ...c, [reportId]: (c[reportId] || 0) + 1 }));
    startVoteCooldown(fuelType);
    await fetchReports();
  };

  const openReportDetail = (r, e) => {
    e?.stopPropagation();
    setDetailReport(r);
  };

  const reportsByFuel = useMemo(() => {
    const buckets = Object.fromEntries(FUEL_TYPES.map(({ value }) => [value, []]));
    for (const r of sortedByTrust) {
      if (buckets[r.fuel_type]) buckets[r.fuel_type].push(r);
    }
    return buckets;
  }, [sortedByTrust]);

  const fuelList = reportsByFuel[activeFuelTab] ?? [];
  const recentSlice = reportsExpanded
    ? fuelList.slice(0, RECENT_MAX)
    : fuelList.slice(0, RECENT_COLLAPSED);
  const hasMoreReports = fuelList.length > RECENT_COLLAPSED;

  const selectFuelTab = (value) => {
    setActiveFuelTab(value);
    setReportsExpanded(false);
  };

  return (
    <div
      className="station-overlay is-open"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="station-panel station-panel--sheet station-panel--modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="station-panel-title"
      >
        <div className="station-panel__handle" aria-hidden="true" />
        <div className="station-panel__header">
          <h2 id="station-panel-title" className="station-panel__title">
            {station.name}
          </h2>
          <button
            type="button"
            className="station-panel__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {station.address && (
          <p className="station-panel__address">{station.address}</p>
        )}

        <div className="station-panel__body">
          <section className="station-panel__section">
            <h3 className="station-panel__section-title">Latest prices</h3>
            {loading ? (
              <p className="station-panel__muted">Loading…</p>
            ) : reports.length === 0 ? (
              <p className="station-panel__muted">
                No prices reported yet. Be the first to submit.
              </p>
            ) : (
              <>
                <p className="station-panel__updated">
                  Updated {formatUpdatedAt(updatedAt)}
                </p>
                <ul className="price-list">
                  {FUEL_TYPES.map(({ value, label }) => {
                    const r = latestByFuel[value];
                    return (
                      <li key={value} className="price-row">
                        <span>{label}</span>
                        <strong>{r ? `₱${Number(r.price).toFixed(2)}` : '—'}</strong>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>

          <section className="station-panel__section station-panel__section--reports">
            <div className="station-panel__section-head">
              <h3 className="station-panel__section-title">Recent reports</h3>
              <p className="station-panel__section-sub">
                Browse by fuel type — tap a row for full details
              </p>
            </div>
            {voteLocked && (
              <p className="station-panel__vote-cooldown" role="status">
                Next {activeTabLabel} vote in {formatCooldownClock(voteCooldownMs)}
              </p>
            )}
            {loading ? null : reports.length === 0 ? null : (
              <>
                <div
                  className="report-fuel-tabs"
                  role="tablist"
                  aria-label="Filter reports by fuel"
                >
                  {FUEL_TYPES.map(({ value, tabLabel }) => {
                    const count = reportsByFuel[value]?.length ?? 0;
                    const isActive = activeFuelTab === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="tab"
                        id={`fuel-tab-${value}`}
                        aria-selected={isActive}
                        aria-controls={`fuel-panel-${value}`}
                        tabIndex={isActive ? 0 : -1}
                        className={`report-fuel-tab ${isActive ? 'is-active' : ''} ${count === 0 ? 'is-empty' : ''}`}
                        onClick={() => selectFuelTab(value)}
                      >
                        <span className="report-fuel-tab__label">{tabLabel}</span>
                        <span className="report-fuel-tab__count">{count}</span>
                      </button>
                    );
                  })}
                </div>
                <div
                  id={`fuel-panel-${activeFuelTab}`}
                  role="tabpanel"
                  aria-labelledby={`fuel-tab-${activeFuelTab}`}
                  className="report-fuel-panel"
                >
                  {fuelList.length === 0 ? (
                    <p className="station-panel__muted report-fuel-panel__empty">
                      No {FUEL_TYPES.find((f) => f.value === activeFuelTab)?.tabLabel}{' '}
                      reports yet for this station.
                    </p>
                  ) : (
                    <ul className="report-list report-list--by-fuel">
                      {recentSlice.map((r) => (
                        <li key={r.id} className="report-row report-row--card">
                          <div
                            role="button"
                            tabIndex={0}
                            className="report-row__main report-row__main--clickable"
                            onClick={(e) => openReportDetail(r, e)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openReportDetail(r, e);
                              }
                            }}
                          >
                            {r.photo_url ? (
                              <img
                                src={r.photo_url}
                                alt=""
                                className="report-row__thumb"
                              />
                            ) : (
                              <span
                                className="report-row__thumb report-row__thumb--placeholder"
                                aria-hidden
                              />
                            )}
                            <div className="report-row__content">
                              <span className="report-row__price">
                                ₱{Number(r.price).toFixed(2)}
                              </span>
                              <span className="report-row__when">
                                {formatUpdatedAt(r.reported_at || r.created_at)}
                              </span>
                            </div>
                          </div>
                          <span className="vote-wrap">
                            <button
                              type="button"
                              disabled={voteLocked}
                              className={`vote-btn vote-btn--like ${myLikes.has(r.id) ? 'is-active' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!voteLocked) handleLike(r.id, r.fuel_type);
                              }}
                              title={
                                voteLocked
                                  ? `Wait ${formatCooldownClock(voteCooldownMs)}`
                                  : myLikes.has(r.id)
                                    ? 'Remove like'
                                    : 'Like'
                              }
                            >
                              👍 {likeCounts[r.id] || 0}
                            </button>
                            <button
                              type="button"
                              disabled={voteLocked}
                              className={`vote-btn vote-btn--dislike ${myDislikes.has(r.id) ? 'is-active' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!voteLocked) handleDislike(r.id, r.fuel_type);
                              }}
                              title={
                                voteLocked
                                  ? `Wait ${formatCooldownClock(voteCooldownMs)}`
                                  : myDislikes.has(r.id)
                                    ? 'Remove dislike'
                                    : 'Dislike'
                              }
                            >
                              👎 {dislikeCounts[r.id] || 0}
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {hasMoreReports && (
                    <button
                      type="button"
                      className="report-list__more"
                      onClick={() => setReportsExpanded((v) => !v)}
                    >
                      {reportsExpanded ? 'Show less' : 'See more'}
                    </button>
                  )}
                </div>
              </>
            )}
          </section>

          <SubmitPriceForm
            stationId={station.id}
            stationName={station.name}
            onSubmitted={async () => {
              await fetchReports();
              onReportSubmitted?.();
            }}
          />
        </div>
      </div>

      {detailReport && (
        <div
          className="report-detail-layer"
          onClick={(e) => {
            e.stopPropagation();
            setDetailReport(null);
          }}
          role="presentation"
        >
          <div
            className="report-detail-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-detail-heading"
          >
            <button
              type="button"
              className="report-detail-modal__close"
              onClick={() => setDetailReport(null)}
              aria-label="Close report details"
            >
              ×
            </button>
            <h3 id="report-detail-heading" className="report-detail-modal__title">
              {station.name}
            </h3>
            <p className="report-detail-modal__fuel">
              {FUEL_TYPES.find((f) => f.value === detailReport.fuel_type)?.label ||
                detailReport.fuel_type}
            </p>
            <p className="report-detail-modal__price">
              ₱{Number(detailReport.price).toFixed(2)}
            </p>
            <p className="report-detail-modal__meta">
              Reported {formatUpdatedAt(detailReport.reported_at || detailReport.created_at)}
            </p>
            {detailReport.photo_url && (
              <img
                src={detailReport.photo_url}
                alt="Price photo"
                className="report-detail-modal__photo"
              />
            )}
            <p className="report-detail-modal__votes">
              👍 {likeCounts[detailReport.id] ?? detailReport.likes ?? 0} · 👎{' '}
              {dislikeCounts[detailReport.id] ?? detailReport.dislikes ?? 0}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
