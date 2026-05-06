import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Copy, CreditCard, Pencil, Save, UserCircle } from 'lucide-react';
import { profileApi } from '../lib/api';
import { useAuth } from '../contexts/useAuth';

const emptyProfileForm = {
  name: '',
  phone: '',
  upi_id: '',
  bank_account_holder_name: '',
  bank_name: '',
  bank_account_number: '',
  bank_ifsc: ''
};

const serverErrorMessage = (error, fallback) => {
  const errors = error.response?.data?.errors;
  if (Array.isArray(errors) && errors.length > 0) return errors.join(', ');

  return error.response?.data?.error || fallback;
};

const OptionalBadge = () => <span className="field-optional">Optional</span>;

const Profile = () => {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState(emptyProfileForm);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedField, setCopiedField] = useState('');

  useEffect(() => {
    document.title = 'Profile | Tripsplit';

    return () => {
      document.title = 'Tripsplit';
    };
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await profileApi.get();
        const nextProfile = response.data.user;
        setProfile(nextProfile);
        setProfileForm(buildForm(nextProfile));
      } catch (fetchError) {
        setError(serverErrorMessage(fetchError, 'Failed to load profile'));
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  const buildForm = (nextProfile) => ({
    name: nextProfile?.name || '',
    phone: nextProfile?.phone || '',
    upi_id: nextProfile?.upi_id || '',
    bank_account_holder_name: nextProfile?.bank_account_holder_name || '',
    bank_name: nextProfile?.bank_name || '',
    bank_account_number: nextProfile?.bank_account_number || '',
    bank_ifsc: nextProfile?.bank_ifsc || ''
  });

  const updateField = (field, value) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
    setError('');
    setSuccess('');
  };

  const handleCancel = () => {
    setProfileForm(buildForm(profile));
    setEditing(false);
    setError('');
    setSuccess('');
  };

  const handleSave = async (event) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const response = await profileApi.update(profileForm);
      const nextProfile = response.data.user;
      setProfile(nextProfile);
      setProfileForm(buildForm(nextProfile));
      updateUser({
        id: nextProfile.id,
        name: nextProfile.name,
        email: nextProfile.email,
        avatar_url: nextProfile.avatar_url
      });
      setEditing(false);
      setSuccess('Profile saved');
    } catch (saveError) {
      setError(serverErrorMessage(saveError, 'Failed to save profile'));
    } finally {
      setSaving(false);
    }
  };

  const copyValue = async (field, value) => {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => {
        setCopiedField((current) => (current === field ? '' : current));
      }, 1400);
    } catch {
      setError('Unable to copy automatically');
    }
  };

  if (loading) return <div className="container text-center pt-20">Loading profile...</div>;

  const displayName = profile?.name || user?.name || 'Your profile';
  const accountNumberDisplay = profile?.bank_account_number_masked || '';

  return (
    <div className="container profile-page">
      <div className="profile-header">
        <div className="flex items-center gap-4">
          <Link to="/" className="btn btn-secondary" style={{ padding: '0.5rem', borderRadius: '50%' }}>
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-title" style={{ fontSize: '2rem' }}>Profile</h1>
            <p className="text-secondary">Manage your identity and private payment details.</p>
          </div>
        </div>

        {!editing && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>
            <Pencil size={17} /> Edit
          </button>
        )}
      </div>

      {error && <div className="error-text profile-status">{error}</div>}
      {success && <div className="settings-success-text profile-status">{success}</div>}

      <div className="profile-layout">
        <section className="glass-panel profile-summary-panel">
          <div className="profile-avatar">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2>{displayName}</h2>
            <p>{profile?.email}</p>
          </div>
        </section>

        <form onSubmit={handleSave} className="profile-details-stack">
          <section className="glass-panel profile-section">
            <div className="profile-section-header">
              <div>
                <h2><UserCircle size={20} /> Basic Details</h2>
                <p>These details identify you in groups and expenses.</p>
              </div>
            </div>

            <div className="profile-form-grid">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Name</label>
                <input
                  value={profileForm.name}
                  onChange={(event) => updateField('name', event.target.value)}
                  disabled={!editing || saving}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Email</label>
                <input value={profile?.email || ''} disabled />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Phone <OptionalBadge /></label>
                <input
                  value={profileForm.phone}
                  onChange={(event) => updateField('phone', event.target.value)}
                  disabled={!editing || saving}
                  inputMode="tel"
                  placeholder="9876543210"
                />
              </div>
            </div>
          </section>

          <section className="glass-panel profile-section">
            <div className="profile-section-header">
              <div>
                <h2><CreditCard size={20} /> Payment Details</h2>
                <p>Payment details are private and only visible to you.</p>
              </div>
            </div>

            <div className="profile-form-grid">
              <div className="form-group profile-field-with-copy" style={{ marginBottom: 0 }}>
                <label>UPI ID <OptionalBadge /></label>
                <div className="profile-copy-row">
                  <input
                    value={profileForm.upi_id}
                    onChange={(event) => updateField('upi_id', event.target.value)}
                    disabled={!editing || saving}
                    placeholder="name@bank"
                  />
                  {!editing && profile?.upi_id && (
                    <button type="button" className="btn btn-secondary" onClick={() => copyValue('upi', profile.upi_id)}>
                      {copiedField === 'upi' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  )}
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Account Holder Name <OptionalBadge /></label>
                <input
                  value={profileForm.bank_account_holder_name}
                  onChange={(event) => updateField('bank_account_holder_name', event.target.value)}
                  disabled={!editing || saving}
                  placeholder="John Doe"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Bank Name <OptionalBadge /></label>
                <input
                  value={profileForm.bank_name}
                  onChange={(event) => updateField('bank_name', event.target.value)}
                  disabled={!editing || saving}
                  placeholder="Example Bank"
                />
              </div>
              <div className="form-group profile-field-with-copy" style={{ marginBottom: 0 }}>
                <label>Account Number <OptionalBadge /></label>
                <div className="profile-copy-row">
                  <input
                    value={editing ? profileForm.bank_account_number : accountNumberDisplay}
                    onChange={(event) => updateField('bank_account_number', event.target.value)}
                    disabled={!editing || saving}
                    inputMode="numeric"
                    placeholder="123456789012"
                  />
                  {!editing && profile?.bank_account_number && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => copyValue('account', profile.bank_account_number)}
                    >
                      {copiedField === 'account' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  )}
                </div>
              </div>
              <div className="form-group profile-field-with-copy" style={{ marginBottom: 0 }}>
                <label>IFSC Code <OptionalBadge /></label>
                <div className="profile-copy-row">
                  <input
                    value={profileForm.bank_ifsc}
                    onChange={(event) => updateField('bank_ifsc', event.target.value)}
                    disabled={!editing || saving}
                    placeholder="ABCD0123456"
                  />
                  {!editing && profile?.bank_ifsc && (
                    <button type="button" className="btn btn-secondary" onClick={() => copyValue('ifsc', profile.bank_ifsc)}>
                      {copiedField === 'ifsc' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          {editing && (
            <div className="profile-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                <Save size={17} /> {saving ? 'Saving...' : 'Save Profile'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleCancel} disabled={saving}>
                Cancel
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default Profile;
