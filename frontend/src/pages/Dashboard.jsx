import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import api, { groupMembersApi } from '../lib/api';
import { LogOut, Plus, Users, ArrowRight, UserCircle, Archive, ChevronDown, ChevronRight } from 'lucide-react';

const normalizeGroup = (payload) => payload?.group || payload?.data || payload || null;

const normalizeGroups = (payload) => {
  if (Array.isArray(payload)) return payload;
  return payload?.groups || payload?.data || [];
};

const ARCHIVED_GROUPS_COLLAPSED_KEY = 'tripsplit:archived-groups-collapsed';

const DashboardCustomSelect = ({ value, options, onChange, disabled = false }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    const handleDocumentClick = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    return () => document.removeEventListener('mousedown', handleDocumentClick);
  }, []);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  return (
    <div ref={rootRef} className={`custom-select ${open ? 'open' : ''}`}>
      <button
        type="button"
        className="custom-select-trigger"
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
        disabled={disabled}
      >
        <span>{selectedOption?.label || 'Select'}</span>
        <span className="custom-select-caret">▾</span>
      </button>
      {open && (
        <div className="custom-select-menu">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`custom-select-option ${option.value === value ? 'active' : ''}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const Dashboard = () => {
  const { user, logout } = useAuth();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupCurrency, setNewGroupCurrency] = useState('INR');
  const [newGroupFriendQuery, setNewGroupFriendQuery] = useState('');
  const [selectedNewGroupFriends, setSelectedNewGroupFriends] = useState([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [createGroupError, setCreateGroupError] = useState('');
  const [archivedGroupsCollapsed, setArchivedGroupsCollapsed] = useState(() => (
    localStorage.getItem(ARCHIVED_GROUPS_COLLAPSED_KEY) === 'true'
  ));
  const currencyOptions = [
    { value: 'INR', label: 'INR (₹)' },
    { value: 'USD', label: 'USD ($)' },
    { value: 'EUR', label: 'EUR (€)' }
  ];

  useEffect(() => {
    fetchGroups();
  }, []);

  const uniqueFriendCandidates = Object.values(
    groups
      .flatMap((group) => group.members || [])
      .reduce((accumulator, member) => {
        const email = (member?.email || '').trim().toLowerCase();
        if (!email) return accumulator;
        if (member.id === user?.id) return accumulator;

        if (!accumulator[email]) {
          accumulator[email] = {
            id: member.id,
            name: member.name,
            email
          };
        }

        return accumulator;
      }, {})
  );

  const selectedFriendEmailSet = new Set(
    selectedNewGroupFriends.map((friend) => friend.email)
  );
  const activeGroups = groups.filter((group) => group.status !== 'archived' && !group.archived_at);
  const archivedGroups = groups.filter((group) => group.status === 'archived' || group.archived_at);

  const filteredFriendSuggestions = uniqueFriendCandidates.filter((friend) => {
    if (selectedFriendEmailSet.has(friend.email)) return false;

    const query = newGroupFriendQuery.trim().toLowerCase();
    if (!query) return false;

    return (
      friend.name?.toLowerCase().includes(query) ||
      friend.email.toLowerCase().includes(query)
    );
  }).slice(0, 8);

  const fetchGroups = async () => {
    try {
      const response = await api.get('/groups');
      setGroups(normalizeGroups(response.data));
    } catch (error) {
      console.error('Failed to fetch groups', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    try {
      setCreatingGroup(true);
      setCreateGroupError('');
      const response = await api.post('/groups', {
        group: { name: newGroupName, currency: newGroupCurrency }
      });
      const createdGroup = normalizeGroup(response.data);
      if (!createdGroup?.id) {
        throw new Error('Group created but response is missing group id');
      }

      // Optimistic insert so the new group appears immediately.
      setGroups((prevGroups) => [
        createdGroup,
        ...prevGroups.filter((group) => group.id !== createdGroup.id)
      ]);

      if (selectedNewGroupFriends.length > 0) {
        const addMemberResults = await Promise.allSettled(
          selectedNewGroupFriends.map((friend) => groupMembersApi.add(createdGroup.id, friend.email))
        );

        const failedAdds = addMemberResults.filter((result) => result.status === 'rejected');
        if (failedAdds.length > 0) {
          setCreateGroupError('Group created, but some friends could not be added.');
        }
      }

      await fetchGroups();
      setNewGroupName('');
      setNewGroupFriendQuery('');
      setSelectedNewGroupFriends([]);
      setShowAddGroup(false);
    } catch (error) {
      console.error('Failed to create group', error);
      const serverError = error.response?.data?.errors?.join(', ') || error.response?.data?.error;
      setCreateGroupError(serverError || 'Failed to create group');
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleAddFriendSelection = (friend) => {
    if (!friend?.email) return;
    if (selectedFriendEmailSet.has(friend.email)) return;

    setSelectedNewGroupFriends((prev) => [...prev, friend]);
    setNewGroupFriendQuery('');
  };

  const handleRemoveSelectedFriend = (email) => {
    setSelectedNewGroupFriends((prev) => prev.filter((friend) => friend.email !== email));
  };

  const toggleArchivedGroups = () => {
    setArchivedGroupsCollapsed((prev) => {
      const nextValue = !prev;
      localStorage.setItem(ARCHIVED_GROUPS_COLLAPSED_KEY, String(nextValue));
      return nextValue;
    });
  };

  const renderGroupCard = (group, archived = false) => (
    <Link
      key={group.id}
      to={`/groups/${group.id}`}
      className="glass-panel group-card-link"
    >
      <div className="flex justify-between items-start" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
        <div>
          <h3 className="font-bold text-2xl">{group.name}</h3>
          {archived && (
            <span className="archive-status-badge">
              <Archive size={13} /> Archived
            </span>
          )}
        </div>
        <span className="currency-badge">
          {group.currency}
        </span>
      </div>

      {group.description && (
        <p className="text-secondary group-card-description">
          {group.description}
        </p>
      )}

      <div className="flex items-center gap-2 text-secondary group-card-footer">
        <Users size={16} />
        <span style={{ fontSize: '0.9rem' }}>{group.members?.length || 1} members</span>
        <ArrowRight size={16} style={{ marginLeft: 'auto', color: 'var(--primary-color)' }} />
      </div>
    </Link>
  );

  return (
    <div className="container" style={{ paddingBottom: '5rem' }}>
      {/* Header bar */}
      <header className="glass-panel dashboard-header" style={{ padding: '1rem 1.5rem', marginBottom: '2rem' }}>
        <h1 className="text-2xl font-bold heading-gradient">Tripsplit</h1>
        
        <div className="dashboard-header-actions">
          <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
            <UserCircle size={20} />
            <span style={{ fontWeight: '500' }}>{user?.name}</span>
          </div>
          <button onClick={logout} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="dashboard-toolbar" style={{ marginBottom: '1.5rem' }}>
        <h2 className="text-2xl font-bold">Your Groups</h2>
        <button 
          className="btn btn-primary"
          onClick={() => setShowAddGroup(!showAddGroup)}
        >
          <Plus size={18} /> New Group
        </button>
      </div>

      {showAddGroup && (
        <div className="glass-panel animate-fade-in" style={{ marginBottom: '2rem' }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1.2rem' }}>Create New Group</h3>
          <form
            onSubmit={handleCreateGroup}
            autoComplete="off"
            data-lpignore="true"
            data-form-type="other"
            className="create-group-form"
          >
            <div className="form-group create-group-name-field" style={{ margin: 0 }}>
              <input 
                type="text" 
                placeholder="Group Name (e.g., Goa Trip)" 
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="form-group create-group-currency-field" style={{ margin: 0 }}>
              <DashboardCustomSelect
                value={newGroupCurrency} 
                options={currencyOptions}
                onChange={setNewGroupCurrency}
              />
            </div>
            <div className="form-group create-group-friends-field" style={{ margin: 0 }}>
              <label style={{ marginBottom: '0.35rem' }}>Add friends (optional)</label>
              <input
                type="search"
                name="create_group_friend_lookup"
                value={newGroupFriendQuery}
                onChange={(e) => setNewGroupFriendQuery(e.target.value)}
                placeholder="Type a name (e.g., Test)"
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                inputMode="search"
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                data-form-type="other"
              />
              {newGroupFriendQuery.trim() && filteredFriendSuggestions.length > 0 && (
                <div className="create-group-friend-suggestions">
                  {filteredFriendSuggestions.map((friend) => (
                    <button
                      key={friend.email}
                      type="button"
                      className="create-group-friend-suggestion-btn"
                      onClick={() => handleAddFriendSelection(friend)}
                    >
                      {friend.name} ({friend.email})
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="create-group-actions">
              <button type="submit" className="btn btn-primary create-group-submit-btn" disabled={creatingGroup}>
                {creatingGroup ? 'Creating...' : 'Create'}
              </button>
              <button
                type="button"
                className="btn btn-secondary create-group-cancel-btn"
                onClick={() => {
                  if (creatingGroup) return;
                  setShowAddGroup(false);
                  setCreateGroupError('');
                  setNewGroupFriendQuery('');
                  setSelectedNewGroupFriends([]);
                }}
                disabled={creatingGroup}
              >
                Cancel
              </button>
            </div>
            {selectedNewGroupFriends.length > 0 && (
              <div className="create-group-selected-friends">
                {selectedNewGroupFriends.map((friend) => (
                  <button
                    key={friend.email}
                    type="button"
                    className="create-group-selected-friend-chip"
                    onClick={() => handleRemoveSelectedFriend(friend.email)}
                    title="Remove friend"
                  >
                    {friend.name} ×
                  </button>
                ))}
              </div>
            )}
            {createGroupError && (
              <div className="error-text create-group-error-text">{createGroupError}</div>
            )}
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center" style={{ padding: '3rem', color: 'var(--text-secondary)' }}>
          Loading your groups...
        </div>
      ) : groups.length === 0 ? (
        <div className="glass-panel text-center animate-fade-in" style={{ padding: '4rem 2rem' }}>
          <Users size={48} style={{ color: 'var(--primary-light)', margin: '0 auto 1rem' }} />
          <h3 className="text-2xl font-bold" style={{ marginBottom: '0.5rem' }}>No groups yet</h3>
          <p className="text-secondary" style={{ marginBottom: '1.5rem' }}>
            Create a group to start adding and splitting expenses with friends.
          </p>
          <button 
            className="btn btn-primary"
            onClick={() => setShowAddGroup(true)}
          >
            <Plus size={18} /> Create your first group
          </button>
        </div>
      ) : (
        <div className="dashboard-groups-stack">
          {activeGroups.length > 0 ? (
            <div className="group-card-grid">
              {activeGroups.map((group) => renderGroupCard(group))}
            </div>
          ) : (
            <div className="glass-panel text-center" style={{ padding: '2.5rem 2rem' }}>
              <h3 className="text-2xl font-bold" style={{ marginBottom: '0.5rem' }}>No active groups</h3>
              <p className="text-secondary">Create a group or restore one from the archived section.</p>
            </div>
          )}

          {archivedGroups.length > 0 && (
            <section className="archived-groups-section">
              <button
                type="button"
                className="archived-groups-toggle"
                onClick={toggleArchivedGroups}
                aria-expanded={!archivedGroupsCollapsed}
              >
                <span className="archived-groups-heading">
                  <Archive size={18} />
                  <span className="text-xl font-bold">Archived Groups</span>
                  <span className="archived-groups-count">{archivedGroups.length}</span>
                </span>
                {archivedGroupsCollapsed ? <ChevronRight size={20} /> : <ChevronDown size={20} />}
              </button>
              {!archivedGroupsCollapsed && (
                <div className="group-card-grid">
                  {archivedGroups.map((group) => renderGroupCard(group, true))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
