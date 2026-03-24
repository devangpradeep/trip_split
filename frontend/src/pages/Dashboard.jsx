import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import api from '../lib/api';
import { LogOut, Plus, Users, ArrowRight, UserCircle } from 'lucide-react';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupCurrency, setNewGroupCurrency] = useState('INR');

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      const response = await api.get('/groups');
      const data = response.data;
      const groupsArray = Array.isArray(data) ? data : (data.groups || data.data || []);
      setGroups(groupsArray);
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
      const response = await api.post('/groups', {
        group: { name: newGroupName, currency: newGroupCurrency }
      });
      setGroups([response.data, ...groups]);
      setNewGroupName('');
      setShowAddGroup(false);
    } catch (error) {
      console.error('Failed to create group', error);
    }
  };

  return (
    <div className="container" style={{ paddingBottom: '5rem' }}>
      {/* Header bar */}
      <header className="glass-panel flex justify-between items-center" style={{ padding: '1rem 1.5rem', marginBottom: '2rem' }}>
        <h1 className="text-2xl font-bold heading-gradient">Tripsplit</h1>
        
        <div className="flex items-center gap-4">
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
      <div className="flex justify-between items-center" style={{ marginBottom: '1.5rem' }}>
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
          <form onSubmit={handleCreateGroup} className="flex gap-4 items-center">
            <div className="form-group" style={{ margin: 0, flex: 1 }}>
              <input 
                type="text" 
                placeholder="Group Name (e.g., Goa Trip)" 
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="form-group" style={{ margin: 0, width: '120px' }}>
              <select 
                value={newGroupCurrency} 
                onChange={(e) => setNewGroupCurrency(e.target.value)}
              >
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary" style={{ padding: '0.9rem 1.5rem' }}>Create</button>
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={() => setShowAddGroup(false)}
            >
              Cancel
            </button>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {groups.map(group => (
            <Link 
              key={group.id} 
              to={`/groups/${group.id}`} 
              className="glass-panel" 
              style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column' }}
            >
              <div className="flex justify-between items-start" style={{ marginBottom: '1rem' }}>
                <h3 className="font-bold text-2xl">{group.name}</h3>
                <span style={{ 
                  background: 'var(--primary-light)', 
                  color: 'var(--primary-color)',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: '600'
                }}>
                  {group.currency}
                </span>
              </div>
              
              <div className="flex items-center gap-2 text-secondary" style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--surface-border)' }}>
                <Users size={16} />
                <span style={{ fontSize: '0.9rem' }}>{group.members?.length || 1} members</span>
                <ArrowRight size={16} style={{ marginLeft: 'auto', color: 'var(--primary-color)' }} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
