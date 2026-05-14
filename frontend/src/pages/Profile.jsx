import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bell, Check, CheckCircle2, Copy, CreditCard, Save, UserCircle, XCircle } from 'lucide-react';
import { profileApi } from '../lib/api';
import { useAuth } from '../contexts/useAuth';
import NotificationBell from '../components/NotificationBell';

const NOTIFICATION_PREFERENCE_GROUPS = [
  {
    title: 'Expenses',
    options: [
      {
        field: 'notify_expense_created',
        label: 'New expenses',
        description: 'When someone adds an expense to a group you share.'
      },
      {
        field: 'notify_expense_updated',
        label: 'Expense edits',
        description: 'When an existing expense is changed.'
      },
      {
        field: 'notify_expense_deleted',
        label: 'Expense deletions',
        description: 'When an expense is removed from a group.'
      }
    ]
  },
  {
    title: 'Settlements',
    options: [
      {
        field: 'notify_settlement_created',
        label: 'New settlements',
        description: 'When a settlement is recorded with you.'
      },
      {
        field: 'notify_settlement_deleted',
        label: 'Settlement deletions',
        description: 'When a settlement involving you is removed.'
      }
    ]
  },
  {
    title: 'Groups',
    options: [
      {
        field: 'notify_group_member_added',
        label: 'Added to a group',
        description: 'When someone adds you to a group.'
      }
    ]
  }
];

const emptyProfileForm = {
  name: '',
  phone: '',
  upi_id: '',
  bank_account_holder_name: '',
  bank_name: '',
  bank_account_number: '',
  bank_ifsc: '',
  notify_expense_created: true,
  notify_expense_updated: true,
  notify_expense_deleted: true,
  notify_settlement_created: true,
  notify_settlement_deleted: true,
  notify_group_member_added: true
};

const serverErrorMessage = (error, fallback) => {
  const errors = error.response?.data?.errors;
  if (Array.isArray(errors) && errors.length > 0) return errors.join(', ');

  return error.response?.data?.error || fallback;
};

const OptionalBadge = () => <span className="field-optional">Optional</span>;

const PROFILE_SECTIONS = [
  { id: 'basic', label: 'Basic' },
  { id: 'payment', label: 'Payment' },
  { id: 'notifications', label: 'Notifications' }
];

const buildNotificationPreferences = (preferences = {}) => (
  NOTIFICATION_PREFERENCE_GROUPS
    .flatMap((group) => group.options)
    .reduce((formPreferences, option) => ({
      ...formPreferences,
      [option.field]: preferences[option.field] ?? true
    }), {})
);

const Profile = () => {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState(emptyProfileForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPreference, setSavingPreference] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedField, setCopiedField] = useState('');
  const [activeProfileSection, setActiveProfileSection] = useState('basic');

  useEffect(() => {
    if (!success) return undefined;

    const timeoutId = window.setTimeout(() => {
      setSuccess('');
    }, 2600);

    return () => window.clearTimeout(timeoutId);
  }, [success]);

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
    bank_ifsc: nextProfile?.bank_ifsc || '',
    ...buildNotificationPreferences(nextProfile?.notification_preferences)
  });

  const updateField = (field, value) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
    setError('');
    setSuccess('');
  };

  const handleCancel = () => {
    setProfileForm(buildForm(profile));
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
      setSuccess('Changes saved');
    } catch (saveError) {
      setError(serverErrorMessage(saveError, 'Failed to save profile'));
    } finally {
      setSaving(false);
    }
  };

  const updateNotificationPreference = async (field, checked) => {
    const previousValue = profileForm[field];
    setProfileForm((prev) => ({ ...prev, [field]: checked }));
    setSavingPreference(field);
    setError('');
    setSuccess('');

    try {
      const response = await profileApi.update({ [field]: checked });
      const nextProfile = response.data.user;
      setProfile(nextProfile);
      setProfileForm((prev) => ({
        ...prev,
        ...buildNotificationPreferences(nextProfile.notification_preferences)
      }));
      setSuccess('Preference updated');
    } catch (saveError) {
      setProfileForm((prev) => ({ ...prev, [field]: previousValue }));
      setError(serverErrorMessage(saveError, 'Failed to save notification preference'));
    } finally {
      setSavingPreference('');
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

  return (
    <div className="container profile-page">
      <div className="profile-header">
        <div className="flex items-center gap-4">
          <Link to="/" className="btn btn-secondary" style={{ padding: '0.5rem', borderRadius: '50%' }}>
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-title" style={{ fontSize: '2rem' }}>Profile</h1>
            <p className="text-secondary">Manage your account information and preferences.</p>
          </div>
        </div>

        <div className="profile-header-actions">
          <NotificationBell />
        </div>
      </div>

      {(error || success) && (
        <div className={`profile-toast ${error ? 'error' : 'success'}`} role="status">
          {error ? <XCircle size={17} /> : <CheckCircle2 size={17} />}
          <span>{error || success}</span>
          <button
            type="button"
            onClick={() => {
              setError('');
              setSuccess('');
            }}
            aria-label="Dismiss status"
          >
            ×
          </button>
        </div>
      )}

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
          <div className="profile-section-tabs" role="tablist" aria-label="Profile sections">
            {PROFILE_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                role="tab"
                className={`profile-section-tab ${activeProfileSection === section.id ? 'active' : ''}`}
                aria-selected={activeProfileSection === section.id}
                onClick={() => setActiveProfileSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </div>

          <section
            className="glass-panel profile-section profile-tab-panel"
            role="tabpanel"
            hidden={activeProfileSection !== 'basic'}
          >
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
                  disabled={saving}
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
                  disabled={saving}
                  inputMode="tel"
                  placeholder="9876543210"
                />
              </div>
            </div>
          </section>

          <section
            className="glass-panel profile-section profile-tab-panel"
            role="tabpanel"
            hidden={activeProfileSection !== 'payment'}
          >
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
                    disabled={saving}
                    placeholder="name@bank"
                  />
                  {profileForm.upi_id && (
                    <button type="button" className="btn btn-secondary" onClick={() => copyValue('upi', profileForm.upi_id)}>
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
                  disabled={saving}
                  placeholder="John Doe"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Bank Name <OptionalBadge /></label>
                <input
                  value={profileForm.bank_name}
                  onChange={(event) => updateField('bank_name', event.target.value)}
                  disabled={saving}
                  placeholder="Example Bank"
                />
              </div>
              <div className="form-group profile-field-with-copy" style={{ marginBottom: 0 }}>
                <label>Account Number <OptionalBadge /></label>
                <div className="profile-copy-row">
                  <input
                    value={profileForm.bank_account_number}
                    onChange={(event) => updateField('bank_account_number', event.target.value)}
                    disabled={saving}
                    inputMode="numeric"
                    placeholder="123456789012"
                  />
                  {profileForm.bank_account_number && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => copyValue('account', profileForm.bank_account_number)}
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
                    disabled={saving}
                    placeholder="ABCD0123456"
                  />
                  {profileForm.bank_ifsc && (
                    <button type="button" className="btn btn-secondary" onClick={() => copyValue('ifsc', profileForm.bank_ifsc)}>
                      {copiedField === 'ifsc' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section
            className="glass-panel profile-section profile-tab-panel"
            role="tabpanel"
            hidden={activeProfileSection !== 'notifications'}
          >
            <div className="profile-section-header">
              <div>
                <h2><Bell size={20} /> Notification Preferences</h2>
                <p>Choose which in-app notifications you receive.</p>
              </div>
            </div>

            <div className="profile-preferences-grid">
              {NOTIFICATION_PREFERENCE_GROUPS.map((preferenceGroup) => (
                <div key={preferenceGroup.title} className="profile-preference-group">
                  <h3>{preferenceGroup.title}</h3>
                  <div className="profile-preference-list">
                    {preferenceGroup.options.map((option) => (
                      <label key={option.field} className="profile-preference-toggle">
                        <span>
                          <strong>{option.label}</strong>
                          <span>{option.description}</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={Boolean(profileForm[option.field])}
                          onChange={(event) => updateNotificationPreference(option.field, event.target.checked)}
                          disabled={saving || savingPreference === option.field}
                        />
                        <span className="profile-switch" aria-hidden="true" />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {activeProfileSection !== 'notifications' && (
            <div className="profile-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                <Save size={17} /> {saving ? 'Saving...' : 'Save Profile'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleCancel} disabled={saving}>
                Reset Changes
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default Profile;
