import { useEffect, useRef } from 'react';

/**
 * Short privacy notice for Gas Bantay / CDO Gas Price Map (community tool).
 * Not a substitute for legal review; adjust contact line to your real channel.
 */
export default function PrivacyModal({ open, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="privacy-modal" role="dialog" aria-modal="true" aria-labelledby="privacy-modal-title">
      <button
        type="button"
        className="privacy-modal__backdrop"
        aria-label="Close privacy policy"
        onClick={onClose}
      />
      <div className="privacy-modal__panel">
        <div className="privacy-modal__head">
          <h2 id="privacy-modal-title" className="privacy-modal__title">
            Privacy policy
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="privacy-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="privacy-modal__body">
          <p className="privacy-modal__meta">Last updated: March 2025 · CDO Gas Price Map (&quot;Gas Bantay&quot;)</p>

          <section className="privacy-modal__section">
            <h3>What this app is</h3>
            <p>
              A community map of fuel prices in Cagayan de Oro. Prices and related info are mostly
              submitted by users, not by gas companies.
            </p>
          </section>

          <section className="privacy-modal__section">
            <h3>What we collect</h3>
            <ul>
              <li>
                <strong>Price reports:</strong> fuel type, price, station, and time of report. Optional
                photos of pump signage may be stored to support the report.
              </li>
              <li>
                <strong>Map assistant (optional):</strong> your messages are sent to an AI service to
                generate replies. When you use &quot;near me&quot;, approximate coordinates may be included
                so the assistant can describe nearby stations.
              </li>
              <li>
                <strong>Location on your device:</strong> if you allow it, your browser shares location
                only to sort &quot;nearby&quot; results in the app. We do not use it to build a personal
                profile.
              </li>
            </ul>
          </section>

          <section className="privacy-modal__section">
            <h3>What we do not aim to collect</h3>
            <p>
              We do not require accounts for basic use. Do not submit names, phone numbers, or other
              personal data in price reports or photos.
            </p>
          </section>

          <section className="privacy-modal__section">
            <h3>Why we use data</h3>
            <p>To show and improve community price information, map features, and optional chat help.</p>
          </section>

          <section className="privacy-modal__section">
            <h3>Storage &amp; security</h3>
            <p>
              Data is stored using our database and file hosting provider. We use reasonable measures to
              protect it, but no online service is perfectly secure.
            </p>
          </section>

          <section className="privacy-modal__section">
            <h3>Your choices</h3>
            <ul>
              <li>You can use the map without turning on location.</li>
              <li>You can avoid the map assistant if you prefer not to send chat messages to AI.</li>
              <li>
                Under Philippine law (Data Privacy Act of 2012), you may have rights to access or object
                to processing of personal data. Contact us if you believe we hold personal data about you.
              </li>
            </ul>
          </section>

          <section className="privacy-modal__section">
            <h3>Accuracy</h3>
            <p>
              Prices are community-sourced and may be wrong or outdated. Verify at the station before
              buying. We are not responsible for losses from relying on this app.
            </p>
          </section>

          <section className="privacy-modal__section">
            <h3>Contact</h3>
            <p>
              For privacy questions, contact the project operator through the official site, store
              listing, or repository linked to this deployment.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
