import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getVoterId } from '../lib/fingerprint';
import { formatUpdatedAt } from '../lib/relativeTime';
import { FUEL_TYPES } from '../constants';
import SubmitPriceForm from './SubmitPriceForm';

export default function StationPopup({ station, onClose, onReportSubmitted }) {
  const [reports, setReports] = useState([]);
  const [likeCounts, setLikeCounts] = useState({});
  const [dislikeCounts, setDislikeCounts] = useState({});
  const [myLikes, setMyLikes] = useState(new Set());
  const [myDislikes, setMyDislikes] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const voterId = getVoterId();

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

  const handleLike = async (reportId) => {
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
  };

  const handleDislike = async (reportId) => {
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

          <section className="station-panel__section">
            <h3 className="station-panel__section-title">Recent reports</h3>
            {loading ? null : reports.length === 0 ? null : (
              <ul className="report-list">
                {sortedByTrust.slice(0, 10).map((r) => (
                  <li key={r.id} className="report-row">
                    <span className="report-row__main">
                      {r.photo_url && (
                        <img
                          src={r.photo_url}
                          alt=""
                          className="report-row__thumb"
                        />
                      )}
                      <span>
                        {FUEL_TYPES.find((f) => f.value === r.fuel_type)?.label || r.fuel_type} ₱
                        {Number(r.price).toFixed(2)} — {formatUpdatedAt(r.reported_at || r.created_at)}
                      </span>
                    </span>
                    <span className="vote-wrap">
                      <button
                        type="button"
                        className={`vote-btn vote-btn--like ${myLikes.has(r.id) ? 'is-active' : ''}`}
                        onClick={() => handleLike(r.id)}
                        title={myLikes.has(r.id) ? 'Remove like' : 'Like'}
                      >
                        👍 {likeCounts[r.id] || 0}
                      </button>
                      <button
                        type="button"
                        className={`vote-btn vote-btn--dislike ${myDislikes.has(r.id) ? 'is-active' : ''}`}
                        onClick={() => handleDislike(r.id)}
                        title={myDislikes.has(r.id) ? 'Remove dislike' : 'Dislike'}
                      >
                        👎 {dislikeCounts[r.id] || 0}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
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
    </div>
  );
}
