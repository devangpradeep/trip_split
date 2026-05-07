import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { notificationsApi } from '../lib/api';

const NOTIFICATION_POLL_INTERVAL_MS = 10000;
export const NOTIFICATIONS_REFRESH_EVENT = 'notifications:refresh';

const formatNotificationTime = (value) => {
  if (!value) return '';

  const createdAt = new Date(value);
  if (Number.isNaN(createdAt.getTime())) return '';

  const seconds = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 1000));
  if (seconds < 60) return 'Just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return createdAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

const NotificationBell = () => {
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setError('');
      const response = await notificationsApi.list();
      setNotifications(response.data.notifications || []);
      setUnreadCount(response.data.unread_count || 0);
    } catch (fetchError) {
      if (fetchError.response?.status === 401) return;

      setError('Could not load notifications');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications({ silent: true });
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;

      fetchNotifications({ silent: true });
    }, NOTIFICATION_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [fetchNotifications]);

  useEffect(() => {
    const refreshSilently = () => fetchNotifications({ silent: true });

    const handleDocumentClick = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshSilently();
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', refreshSilently);
    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, refreshSilently);

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', refreshSilently);
      window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, refreshSilently);
    };
  }, [fetchNotifications]);

  const toggleOpen = () => {
    setOpen((prevOpen) => {
      const nextOpen = !prevOpen;
      if (nextOpen) fetchNotifications();
      return nextOpen;
    });
  };

  const handleNotificationClick = async (notification) => {
    try {
      if (!notification.read) {
        await notificationsApi.markRead(notification.id);
        setNotifications((prevNotifications) => prevNotifications.map((item) => (
          item.id === notification.id ? { ...item, read: true, read_at: new Date().toISOString() } : item
        )));
        setUnreadCount((prevCount) => Math.max(prevCount - 1, 0));
      }
    } catch (markError) {
      if (markError.response?.status !== 401) {
        setError('Could not update notification');
      }
      return;
    }

    setOpen(false);
    if (notification.url) {
      navigate(notification.url);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      const readAt = new Date().toISOString();
      setNotifications((prevNotifications) => prevNotifications.map((notification) => ({
        ...notification,
        read: true,
        read_at: notification.read_at || readAt
      })));
      setUnreadCount(0);
    } catch (markError) {
      if (markError.response?.status !== 401) {
        setError('Could not update notifications');
      }
    }
  };

  return (
    <div ref={rootRef} className={`notification-bell ${unreadCount > 0 ? 'has-unread' : ''}`}>
      <button
        type="button"
        className="notification-bell-button"
        onClick={toggleOpen}
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell size={19} />
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notification-menu">
          <div className="notification-menu-header">
            <div>
              <h2>Notifications</h2>
              <p>{unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}</p>
            </div>
            <button
              type="button"
              className="notification-mark-read-btn"
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0}
              title="Mark all as read"
            >
              <CheckCheck size={16} />
            </button>
          </div>

          {error && <div className="notification-error">{error}</div>}

          <div className="notification-list">
            {loading ? (
              <div className="notification-empty">Loading notifications...</div>
            ) : notifications.length === 0 ? (
              <div className="notification-empty">No notifications yet</div>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  className={`notification-item ${notification.read ? '' : 'unread'}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <span className="notification-unread-dot" aria-hidden="true" />
                  <span className="notification-item-content">
                    <span className="notification-title">{notification.title}</span>
                    {notification.body && <span className="notification-body">{notification.body}</span>}
                    <span className="notification-time">
                      {formatNotificationTime(notification.created_at)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
