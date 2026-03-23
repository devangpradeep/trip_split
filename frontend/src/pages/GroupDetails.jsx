import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api, { groupMembersApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Plus, Receipt, UserPlus } from 'lucide-react';

const GroupDetails = () => {
  const { id } = useParams();
  const { user } = useAuth();
  
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberEmail, setMemberEmail] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [addMemberError, setAddMemberError] = useState('');
  const [expenseForm, setExpenseForm] = useState({
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchGroupData();
  }, [id]);

  const fetchGroupData = async () => {
    try {
      const [groupRes, expensesRes, balancesRes] = await Promise.all([
        api.get(`/groups/${id}`),
        api.get(`/groups/${id}/expenses`),
        api.get(`/groups/${id}/balances`)
      ]);
      setGroup(groupRes.data.group || groupRes.data.data || groupRes.data);
      const expensesData = expensesRes.data;
      setExpenses(Array.isArray(expensesData) ? expensesData : (expensesData.expenses || expensesData.data || []));
      setBalances(balancesRes.data.balances || []);
    } catch (error) {
      console.error('Failed to fetch group data', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!expenseForm.amount || !expenseForm.description) return;

    // For MVP, split equally among all members
    const membersCount = group.members.length;
    const splitAmount = (parseFloat(expenseForm.amount) / membersCount).toFixed(2);
    
    const splits = group.members.map(m => ({
      user_id: m.id,
      amount: splitAmount
    }));

    try {
      await api.post(`/groups/${id}/expenses`, {
        expense: {
          ...expenseForm,
          currency: group.currency,
          split_type: 'equal',
          splits
        }
      });
      
      setShowAddExpense(false);
      setExpenseForm({ description: '', amount: '', date: new Date().toISOString().split('T')[0] });
      fetchGroupData(); // Refresh all data
    } catch (error) {
      console.error('Failed to add expense', error);
      alert('Failed to add expense. Check console.');
    }
  };

  const openAddMemberModal = () => {
    setAddMemberError('');
    setMemberEmail('');
    setShowAddMember(true);
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!memberEmail.trim()) return;

    try {
      setAddingMember(true);
      setAddMemberError('');
      await groupMembersApi.add(id, memberEmail.trim());
      setShowAddMember(false);
      setMemberEmail('');
      fetchGroupData();
    } catch (error) {
      setAddMemberError(error.response?.data?.error || error.response?.data?.errors?.join(', ') || 'Failed to add member');
    } finally {
      setAddingMember(false);
    }
  };

  const renderBalanceCard = (balanceData) => {
    const isCurrentUser = balanceData.user.id === user.id;
    const amount = balanceData.balance;
    const formattedAmount = Math.abs(amount).toFixed(2);
    const currencySym = group?.currency === 'INR' ? '₹' : (group?.currency === 'USD' ? '$' : '€');
    
    let statusClass = '';
    let statusText = '';
    
    if (amount > 0.01) {
      statusClass = 'text-success';
      statusText = isCurrentUser ? `You are owed ${currencySym}${formattedAmount}` : `Gets back ${currencySym}${formattedAmount}`;
    } else if (amount < -0.01) {
      statusClass = 'text-danger';
      statusText = isCurrentUser ? `You owe ${currencySym}${formattedAmount}` : `Owes ${currencySym}${formattedAmount}`;
    } else {
      statusText = 'Settled up';
    }

    return (
      <div key={balanceData.user.id} className="glass-panel" style={{ padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="flex items-center gap-3">
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
            {balanceData.user.name.charAt(0)}
          </div>
          <div>
            <div style={{ fontWeight: 600 }}>{isCurrentUser ? 'You' : balanceData.user.name}</div>
            <div style={{ fontSize: '0.85rem' }} className={statusClass}>
              {statusText}
            </div>
          </div>
        </div>
        {amount < -0.01 && isCurrentUser && (
          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>Settle</button>
        )}
      </div>
    );
  };

  if (loading) return <div className="container text-center pt-20">Loading group details...</div>;
  if (!group) return <div className="container text-center pt-20">Group not found</div>;

  const currencySym = group.currency === 'INR' ? '₹' : (group.currency === 'USD' ? '$' : '€');
  const canManageMembers = group.created_by_id === user.id;

  return (
    <div className="container flex-col gap-6" style={{ paddingBottom: '5rem' }}>
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/" className="btn btn-secondary" style={{ padding: '0.5rem', borderRadius: '50%' }}>
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-title" style={{ fontSize: '2rem' }}>{group.name}</h1>
          <p className="text-secondary">{group.members.length} members • {group.currency}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem', marginTop: '1rem', alignItems: 'start' }}>
        {/* Left Column - Expenses */}
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Expenses</h2>
            <button className="btn btn-primary" onClick={() => setShowAddExpense(!showAddExpense)}>
              <Plus size={18} /> Add Expense
            </button>
          </div>

          {showAddExpense && (
            <div className="glass-panel animate-fade-in">
              <h3 style={{ marginBottom: '1rem' }}>Add New Expense</h3>
              <form onSubmit={handleAddExpense} className="flex flex-col gap-3">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Description</label>
                  <input required placeholder="e.g. Dinner at Cafe" value={expenseForm.description} onChange={e => setExpenseForm({...expenseForm, description: e.target.value})} />
                </div>
                <div className="flex gap-3">
                  <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                    <label>Amount ({group.currency})</label>
                    <input required type="number" step="0.01" min="0.01" placeholder="0.00" value={expenseForm.amount} onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                    <label>Date</label>
                    <input required type="date" value={expenseForm.date} onChange={e => setExpenseForm({...expenseForm, date: e.target.value})} />
                  </div>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', padding: '0.5rem 0' }}>
                  Amount will be split equally among all {group.members.length} members for the MVP.
                </div>
                <div className="flex gap-3" style={{ marginTop: '0.5rem' }}>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Save</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowAddExpense(false)}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {expenses.length === 0 ? (
              <div className="glass-panel text-center" style={{ padding: '3rem 2rem' }}>
                <Receipt size={40} style={{ color: 'var(--text-secondary)', margin: '0 auto 1rem', opacity: 0.5 }} />
                <p>No expenses yet. Go ahead and add one!</p>
              </div>
            ) : (
              expenses.map(expense => (
                <div key={expense.id} className="glass-panel flex justify-between items-center" style={{ padding: '1rem 1.5rem' }}>
                  <div className="flex items-center gap-4">
                    <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: '12px' }}>
                      <Receipt size={24} color="var(--primary-color)" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{expense.description}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {expense.paid_by.id === user.id ? 'You' : expense.paid_by.name} paid {currencySym}{parseFloat(expense.amount).toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    {/* MVP display: if you are involved, show your split */}
                    {(() => {
                      const yourSplit = expense.expense_splits.find(s => s.user.id === user.id);
                      const expenseAmount = parseFloat(expense.amount || 0);
                      const yourSplitAmount = parseFloat(yourSplit?.amount || 0);

                      if (!yourSplit && expense.paid_by.id !== user.id) {
                        return <div style={{ color: 'var(--text-secondary)' }}>Not involved</div>;
                      }

                      if (expense.paid_by.id === user.id) {
                        const lentAmount = Math.max(0, expenseAmount - yourSplitAmount);

                        if (lentAmount <= 0.01) {
                          return <div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>You spent</div>
                            <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{currencySym}{expenseAmount.toFixed(2)}</div>
                          </div>;
                        }

                        return <div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>You lent</div>
                          <div style={{ color: 'var(--success-color)', fontWeight: 600 }}>{currencySym}{lentAmount.toFixed(2)}</div>
                        </div>;
                      } else {
                        return <div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>You borrowed</div>
                          <div style={{ color: 'var(--danger-color)', fontWeight: 600 }}>{currencySym}{yourSplitAmount.toFixed(2)}</div>
                        </div>;
                      }
                    })()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column - Balances & Members */}
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="text-2xl font-bold" style={{ marginBottom: '1rem' }}>Balances</h2>
            <div className="flex flex-col gap-3">
              {balances.map(b => renderBalanceCard(b))}
            </div>
          </div>

          <div>
            <h2 className="text-xl font-bold flex justify-between items-center" style={{ marginBottom: '1rem' }}>
              Members ({group.members.length})
              <button
                className="btn btn-secondary"
                onClick={openAddMemberModal}
                disabled={!canManageMembers}
                title={canManageMembers ? 'Add member' : 'Only group admin can add members'}
                style={{ padding: '0.4rem 0.6rem', border: 'none', background: 'transparent', color: 'var(--primary-color)', opacity: canManageMembers ? 1 : 0.4, cursor: canManageMembers ? 'pointer' : 'not-allowed' }}
              >
                <UserPlus size={18} />
              </button>
            </h2>
            <div className="glass-panel flex flex-col gap-3" style={{ padding: '1rem 1.5rem' }}>
              {group.members.map(member => (
                <div key={member.id} className="flex items-center gap-3">
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>
                    {member.name.charAt(0)}
                  </div>
                  <span style={{ fontSize: '0.95rem' }}>{member.id === user.id ? 'You' : member.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showAddMember && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: 460 }}>
            <h3 style={{ marginBottom: '1rem' }}>Add Member</h3>
            <form onSubmit={handleAddMember} className="flex flex-col gap-3">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Email</label>
                <input
                  required
                  type="email"
                  placeholder="friend@example.com"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  autoFocus
                />
              </div>
              {addMemberError && <div className="error-text" style={{ margin: 0 }}>{addMemberError}</div>}
              <div className="flex gap-3" style={{ marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={addingMember}>
                  {addingMember ? 'Adding...' : 'Add Member'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddMember(false)}
                  disabled={addingMember}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Styles for dynamic text colors */}
      <style>{`
        .text-success { color: var(--success-color); }
        .text-danger { color: var(--danger-color); }
      `}</style>
    </div>
  );
};

export default GroupDetails;
