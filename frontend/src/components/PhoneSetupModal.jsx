import { useState } from 'react';
import { Phone, ArrowRight, Loader2 } from 'lucide-react';
import { profileApi } from '../lib/api';
import { useAuth } from '../contexts/useAuth';

const isValidPhone = (value) => /^\d{10}$/.test(value.trim());
const nextPhoneValue = (value, current) => (/^\d{0,10}$/.test(value) ? value : current);

const serverError = (error, fallback) => {
  const errors = error?.response?.data?.errors;
  if (Array.isArray(errors) && errors.length > 0) return errors.join(', ');
  return error?.response?.data?.error || fallback;
};

/**
 * Modal that prompts newly registered (or guest-claimed) users to add their
 * 10-digit phone number before they start using the app.
 *
 * Shown by App.jsx whenever:
 *   - user is authenticated
 *   - user.is_guest === false
 *   - user.phone is blank
 */
const PhoneSetupModal = () => {
  const { user, updateUser } = useAuth();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!isValidPhone(phone)) {
      setError('Please enter a valid 10-digit phone number.');
      return;
    }

    try {
      setSaving(true);
      const response = await profileApi.update({ phone: phone.trim() });
      const nextUser = response.data.user;
      // Merge the fresh phone into the stored user without a full page reload
      updateUser({
        ...user,
        phone: nextUser.phone,
      });
    } catch (err) {
      setError(serverError(err, 'Failed to save phone number. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(6px)',
          zIndex: 9998,
        }}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="phone-setup-title"
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1.5rem',
        }}
      >
        <div
          className="glass-panel animate-fade-in"
          style={{
            width: '100%',
            maxWidth: '440px',
            padding: '2.5rem 2rem',
          }}
        >
          {/* Icon ring */}
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--primary-color), var(--secondary-color, #a78bfa))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem',
              boxShadow: '0 0 24px rgba(99, 102, 241, 0.35)',
            }}
          >
            <Phone size={28} color="#fff" />
          </div>

          <div className="text-center" style={{ marginBottom: '1.75rem' }}>
            <h1
              id="phone-setup-title"
              className="text-title heading-gradient"
              style={{ fontSize: '1.6rem', marginBottom: '0.5rem' }}
            >
              One last step
            </h1>
            <p className="text-subtitle" style={{ lineHeight: 1.5 }}>
              Add your phone number so group members can identify and reach you for settlements.
            </p>
          </div>

          {error && (
            <div className="error-text" style={{ marginBottom: '1rem', textAlign: 'center' }}>
              {error}
            </div>
          )}

          <form id="phone-setup-form" onSubmit={handleSubmit}>
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label htmlFor="phone-setup-input">Phone Number</label>
              <input
                id="phone-setup-input"
                type="tel"
                inputMode="numeric"
                pattern="\d{10}"
                maxLength={10}
                value={phone}
                onChange={(e) => {
                  setPhone((cur) => nextPhoneValue(e.target.value, cur));
                  setError('');
                }}
                placeholder="9876543210"
                autoFocus
                required
                disabled={saving}
              />
              <p
                style={{
                  marginTop: '0.4rem',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                }}
              >
                10-digit mobile number — used only to identify you in groups.
              </p>
            </div>

            <button
              id="phone-setup-submit"
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              disabled={saving || phone.length < 10}
            >
              {saving ? (
                <>
                  <Loader2 size={18} className="spin" /> Saving…
                </>
              ) : (
                <>
                  Continue <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </>
  );
};

export default PhoneSetupModal;
