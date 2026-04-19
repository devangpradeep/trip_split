import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { inviteLinksApi } from '../lib/api';
import { useAuth } from '../contexts/useAuth';

const formatDateTime = (value) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString();
};

const JoinGroup = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const fetchInvite = async () => {
      try {
        setError('');
        const response = await inviteLinksApi.get(token);
        setInvite(response.data.invite || response.data);
      } catch (err) {
        const serverError = err.response?.data?.errors?.join(', ');
        setError(serverError || 'Invite link is invalid or unavailable');
      } finally {
        setLoading(false);
      }
    };

    fetchInvite();
  }, [token]);

  const handleJoin = async () => {
    try {
      setJoining(true);
      setError('');
      setSuccessMessage('');

      const response = await inviteLinksApi.accept(token);
      const group = response.data.group;
      setSuccessMessage(response.data.message || 'Joined group successfully');

      if (group?.id) {
        navigate(`/groups/${group.id}`, { replace: true });
      }
    } catch (err) {
      const serverError = err.response?.data?.errors?.join(', ');
      setError(serverError || 'Failed to join group');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="container text-center" style={{ paddingTop: '5rem' }}>
        Loading invite...
      </div>
    );
  }

  if (error && !invite) {
    return (
      <div className="container" style={{ maxWidth: 640, paddingBottom: '5rem' }}>
        <div className="glass-panel">
          <h2 style={{ marginBottom: '0.8rem' }}>Invite unavailable</h2>
          <p className="error-text" style={{ margin: 0 }}>{error}</p>
          <div style={{ marginTop: '1.25rem' }}>
            <Link to="/login" className="btn btn-primary">Go to Login</Link>
          </div>
        </div>
      </div>
    );
  }

  const nextParam = encodeURIComponent(`/join/${token}`);

  return (
    <div className="container" style={{ maxWidth: 700, paddingBottom: '5rem' }}>
      <div className="glass-panel">
        <h1 className="text-title" style={{ fontSize: '1.8rem', marginBottom: '0.6rem' }}>Group Invite</h1>
        <p className="text-subtitle" style={{ marginBottom: '1rem' }}>
          You were invited to join <strong style={{ color: 'var(--text-primary)' }}>{invite?.group?.name}</strong>.
        </p>

        <div style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          Expires: {formatDateTime(invite?.expires_at)}
        </div>

        {error && <div className="error-text" style={{ marginBottom: '0.8rem' }}>{error}</div>}
        {successMessage && <div style={{ color: 'var(--success-color)', marginBottom: '0.8rem' }}>{successMessage}</div>}

        {!user ? (
          <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
            <Link to={`/login?next=${nextParam}`} className="btn btn-primary">Login to Join</Link>
            <Link to={`/register?next=${nextParam}`} className="btn btn-secondary">Create Account & Join</Link>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={handleJoin} disabled={joining}>
            {joining ? 'Joining...' : 'Join Group'}
          </button>
        )}
      </div>
    </div>
  );
};

export default JoinGroup;
