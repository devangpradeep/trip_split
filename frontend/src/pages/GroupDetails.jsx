import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api, { groupInvitesApi, groupMembersApi } from '../lib/api';
import { useAuth } from '../contexts/useAuth';
import { ArrowLeft, Plus, Receipt, UserPlus, Pencil, Trash2, CalendarDays } from 'lucide-react';

const todayISO = () => new Date().toISOString().split('T')[0];
const FRIEND_SUGGESTION_DEBOUNCE_MS = 220;

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());

const isValidISODate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const formatISODateForUI = (isoDate) => {
  if (!isValidISODate(isoDate)) return '';
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
};

const parseUIDateToISO = (displayDate) => {
  const normalized = (displayDate || '').trim();
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(normalized);
  if (!match) return null;

  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  const year = match[3];
  const isoDate = `${year}-${month}-${day}`;

  return isValidISODate(isoDate) ? isoDate : null;
};

const formatDateTimeForUI = (value) => {
  if (!value) return '--';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';

  return date.toLocaleString();
};

const buildDefaultExpenseForm = (members = []) => ({
  description: '',
  amount: '',
  date: todayISO(),
  split_type: 'equal',
  splits: members.map((member) => ({
    user_id: member.id,
    name: member.name,
    included: true,
    amount: '',
    percentage: ''
  }))
});

const CustomSelect = ({ value, options, onChange, disabled = false }) => {
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

const CustomDateInput = ({ value, onChange, required = false, disabled = false }) => {
  const [displayValue, setDisplayValue] = useState(formatISODateForUI(value));
  const proxyDateInputRef = useRef(null);

  useEffect(() => {
    setDisplayValue(formatISODateForUI(value));
  }, [value]);

  const commitValue = () => {
    const parsedDate = parseUIDateToISO(displayValue);
    if (parsedDate) {
      onChange(parsedDate);
      setDisplayValue(formatISODateForUI(parsedDate));
      return;
    }

    setDisplayValue(formatISODateForUI(value));
  };

  const openDatePicker = () => {
    if (disabled) return;

    if (typeof proxyDateInputRef.current?.showPicker === 'function') {
      proxyDateInputRef.current.showPicker();
      return;
    }

    proxyDateInputRef.current?.focus();
    proxyDateInputRef.current?.click();
  };

  return (
    <div className="custom-date-input">
      <input
        type="text"
        className="custom-date-text-input"
        inputMode="numeric"
        placeholder="DD/MM/YYYY"
        value={displayValue}
        onChange={(e) => setDisplayValue(e.target.value)}
        onBlur={commitValue}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commitValue();
          }
        }}
        required={required}
        disabled={disabled}
        maxLength={10}
        autoComplete="off"
      />
      <button
        type="button"
        className="custom-date-picker-btn"
        onClick={openDatePicker}
        disabled={disabled}
        aria-label="Open calendar"
      >
        <CalendarDays size={16} />
      </button>
      <input
        ref={proxyDateInputRef}
        type="date"
        className="custom-date-native-proxy"
        value={value || ''}
        onChange={(e) => {
          const nextValue = e.target.value;
          if (!nextValue) return;
          onChange(nextValue);
          setDisplayValue(formatISODateForUI(nextValue));
        }}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
};

const GroupDetails = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const appTitle = 'Tripsplit';
  
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [balances, setBalances] = useState([]);
  const [invites, setInvites] = useState([]);
  const [latestExpiredInvite, setLatestExpiredInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteExpiresHours, setInviteExpiresHours] = useState('48');
  const [inviteNoExpiry, setInviteNoExpiry] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [addMemberError, setAddMemberError] = useState('');
  const [addMemberSuccess, setAddMemberSuccess] = useState('');
  const [memberEmailInput, setMemberEmailInput] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [friendSuggestions, setFriendSuggestions] = useState([]);
  const [loadingFriendSuggestions, setLoadingFriendSuggestions] = useState(false);
  const [friendSuggestionError, setFriendSuggestionError] = useState('');
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [revokingInviteId, setRevokingInviteId] = useState(null);
  const [copiedInviteId, setCopiedInviteId] = useState(null);
  const [showEditExpense, setShowEditExpense] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [savingExpense, setSavingExpense] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState(null);
  const [mobileSection, setMobileSection] = useState('expenses');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteExpense, setPendingDeleteExpense] = useState(null);
  const [deleteExpenseError, setDeleteExpenseError] = useState('');
  const [addExpenseError, setAddExpenseError] = useState('');
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settlingPayment, setSettlingPayment] = useState(false);
  const [settleError, setSettleError] = useState('');
  const [settleForm, setSettleForm] = useState({
    to_user_id: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    note: ''
  });
  const [editExpenseError, setEditExpenseError] = useState('');
  const [editExpenseForm, setEditExpenseForm] = useState({
    description: '',
    amount: '',
    date: '',
    split_type: 'equal',
    paid_by_id: '',
    splits: []
  });
  const [expenseForm, setExpenseForm] = useState(() => buildDefaultExpenseForm());

  const fetchGroupData = useCallback(async () => {
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
  }, [id]);

  useEffect(() => {
    fetchGroupData();
  }, [fetchGroupData]);

  useEffect(() => {
    if (group?.name) {
      document.title = `${group.name} | ${appTitle}`;
      return () => {
        document.title = appTitle;
      };
    }

    document.title = appTitle;
  }, [group, appTitle]);

  useEffect(() => {
    if (!showAddExpense || !group) return;

    setExpenseForm((prev) => {
      const prevSplitsByUserId = new Map(prev.splits.map((split) => [split.user_id, split]));
      const nextSplits = group.members.map((member) => {
        const existing = prevSplitsByUserId.get(member.id);
        return existing
          ? { ...existing, name: member.name }
          : { user_id: member.id, name: member.name, included: true, amount: '', percentage: '' };
      });

      return { ...prev, splits: nextSplits };
    });
  }, [group, showAddExpense]);

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!expenseForm.amount || !expenseForm.description) return;
    if (!isValidISODate(expenseForm.date)) {
      setAddExpenseError('Please enter a valid date in DD/MM/YYYY format');
      return;
    }

    const totalAmount = parseFloat(expenseForm.amount || 0);
    if (!(totalAmount > 0)) {
      setAddExpenseError('Expense amount must be greater than zero');
      return;
    }

    const includedSplits = expenseForm.splits.filter((split) => split.included);
    if (includedSplits.length === 0) {
      setAddExpenseError('Select at least one participant for the split');
      return;
    }

    let splitsPayload = includedSplits.map((split) => ({ user_id: split.user_id }));

    if (expenseForm.split_type === 'amount') {
      const enteredAmountTotal = includedSplits.reduce((sum, split) => sum + (parseFloat(split.amount) || 0), 0);
      if (Math.abs(enteredAmountTotal - totalAmount) > 0.01) {
        setAddExpenseError('Split amounts must add up to the total expense amount');
        return;
      }

      splitsPayload = includedSplits.map((split) => ({
        user_id: split.user_id,
        amount: split.amount
      }));
    }

    if (expenseForm.split_type === 'percentage') {
      const enteredPercentageTotal = includedSplits.reduce((sum, split) => sum + (parseFloat(split.percentage) || 0), 0);
      if (Math.abs(enteredPercentageTotal - 100) > 0.01) {
        setAddExpenseError('Split percentages must add up to 100');
        return;
      }

      splitsPayload = includedSplits.map((split) => ({
        user_id: split.user_id,
        percentage: split.percentage
      }));
    }

    try {
      setAddExpenseError('');
      await api.post(`/groups/${id}/expenses`, {
        expense: {
          description: expenseForm.description,
          amount: expenseForm.amount,
          date: expenseForm.date,
          currency: group.currency,
          split_type: expenseForm.split_type,
          splits: splitsPayload
        }
      });
      
      setShowAddExpense(false);
      setExpenseForm(buildDefaultExpenseForm(group.members));
      fetchGroupData(); // Refresh all data
    } catch (error) {
      const serverError = error.response?.data?.errors?.join(', ');
      const fallbackError = error.response?.data?.error;
      setAddExpenseError(serverError || fallbackError || 'Failed to add expense');
    }
  };

  const updateAddSplit = (userId, field, value) => {
    setExpenseForm((prev) => ({
      ...prev,
      splits: prev.splits.map((split) =>
        split.user_id === userId ? { ...split, [field]: value } : split
      )
    }));
  };

  const toggleAddSplitParticipant = (userId, included) => {
    setExpenseForm((prev) => ({
      ...prev,
      splits: prev.splits.map((split) =>
        split.user_id === userId ? { ...split, included } : split
      )
    }));
  };

  const rebalanceAddSplitOnBlur = (editedUserId) => {
    setExpenseForm((prev) => {
      if (prev.split_type === 'equal') return prev;

      const includedSplits = prev.splits.filter((split) => split.included);
      if (includedSplits.length < 2) return prev;

      const preferredAutoSplit = includedSplits.find(
        (split) => split.user_id === user.id && split.user_id !== editedUserId
      );
      const fallbackAutoSplit = includedSplits.find(
        (split) => split.user_id !== editedUserId
      );
      const autoSplit = preferredAutoSplit || fallbackAutoSplit;
      if (!autoSplit) return prev;

      const targetTotal =
        prev.split_type === 'percentage'
          ? 100
          : (parseFloat(prev.amount) || 0);

      const sumExcludingAuto = includedSplits.reduce((sum, split) => {
        if (split.user_id === autoSplit.user_id) return sum;
        const value = prev.split_type === 'percentage'
          ? (parseFloat(split.percentage) || 0)
          : (parseFloat(split.amount) || 0);
        return sum + value;
      }, 0);

      const rawRemaining = targetTotal - sumExcludingAuto;
      const remaining = Math.max(0, rawRemaining);

      return {
        ...prev,
        splits: prev.splits.map((split) => {
          if (split.user_id !== autoSplit.user_id) return split;

          if (prev.split_type === 'percentage') {
            return { ...split, percentage: remaining.toFixed(2) };
          }

          return { ...split, amount: remaining.toFixed(2) };
        })
      };
    });
  };

  const toggleAddExpensePanel = () => {
    if (showAddExpense) {
      setShowAddExpense(false);
      setAddExpenseError('');
      return;
    }

    setAddExpenseError('');
    setExpenseForm(buildDefaultExpenseForm(group?.members || []));
    setShowAddExpense(true);
  };

  const fetchInvites = useCallback(async () => {
    try {
      setLoadingInvites(true);
      const response = await groupInvitesApi.list(id);
      const activeInvites = (response.data.invites || []).filter((invite) => invite.status === 'active');
      setInvites(activeInvites);
      setLatestExpiredInvite(response.data.latest_expired_invite || null);
    } catch (error) {
      const serverError = error.response?.data?.errors?.join(', ') || error.response?.data?.error;
      setInviteError(serverError || 'Failed to load invite links');
      setLatestExpiredInvite(null);
    } finally {
      setLoadingInvites(false);
    }
  }, [id]);

  const fetchFriendSuggestions = useCallback(async (query = '') => {
    try {
      setLoadingFriendSuggestions(true);
      setFriendSuggestionError('');
      const response = await groupMembersApi.suggestions(id, query, 10);
      setFriendSuggestions(response.data?.friends || []);
    } catch (error) {
      const serverError = error.response?.data?.errors?.join(', ') || error.response?.data?.error;
      setFriendSuggestionError(serverError || 'Failed to load friend suggestions');
      setFriendSuggestions([]);
    } finally {
      setLoadingFriendSuggestions(false);
    }
  }, [id]);

  const openInviteModal = () => {
    setInviteError('');
    setAddMemberError('');
    setAddMemberSuccess('');
    setMemberEmailInput('');
    setFriendSuggestionError('');
    setFriendSuggestions([]);
    setInviteExpiresHours('48');
    setInviteNoExpiry(false);
    setCopiedInviteId(null);
    setShowInviteModal(true);
    fetchInvites();
  };

  const closeInviteModal = () => {
    if (creatingInvite || revokingInviteId || addingMember) return;
    setShowInviteModal(false);
    setInviteError('');
    setAddMemberError('');
    setAddMemberSuccess('');
    setMemberEmailInput('');
    setFriendSuggestionError('');
    setFriendSuggestions([]);
    setCopiedInviteId(null);
  };

  useEffect(() => {
    if (!showInviteModal) return;

    const query = memberEmailInput.trim();
    if (!query) {
      setFriendSuggestions([]);
      setFriendSuggestionError('');
      setLoadingFriendSuggestions(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      fetchFriendSuggestions(query);
    }, FRIEND_SUGGESTION_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [showInviteModal, memberEmailInput, fetchFriendSuggestions]);

  const handleInviteModalBackdropClick = (event) => {
    if (event.target !== event.currentTarget) return;
    closeInviteModal();
  };

  const handleCreateInvite = async (e) => {
    e.preventDefault();
    const parsedHours = Number(inviteExpiresHours);

    if (!inviteNoExpiry && (!Number.isInteger(parsedHours) || parsedHours < 1 || parsedHours > 168)) {
      setInviteError('Expiry must be between 1 and 168 hours');
      return;
    }

    try {
      setCreatingInvite(true);
      setInviteError('');
      const response = await groupInvitesApi.create(id, {
        expiresInHours: parsedHours,
        noExpiry: inviteNoExpiry
      });
      const newInvite = response.data.invite;
      setInvites(newInvite ? [newInvite] : []);
      setLatestExpiredInvite(null);
      setCopiedInviteId(null);
    } catch (error) {
      const serverError = error.response?.data?.errors?.join(', ') || error.response?.data?.error;
      setInviteError(serverError || 'Failed to create invite link');
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleInviteNoExpiryChange = (checked) => {
    setInviteNoExpiry(checked);

    if (checked) {
      setInviteExpiresHours('');
      return;
    }

    setInviteExpiresHours((prev) => (prev?.toString().trim() ? prev : '48'));
  };

  const handleRevokeInvite = async (inviteId) => {
    try {
      setRevokingInviteId(inviteId);
      setInviteError('');
      await groupInvitesApi.revoke(id, inviteId);
      setInvites((prev) => prev.filter((invite) => invite.id !== inviteId));
      setLatestExpiredInvite(null);
      setCopiedInviteId((current) => (current === inviteId ? null : current));
    } catch (error) {
      const serverError = error.response?.data?.errors?.join(', ') || error.response?.data?.error;
      setInviteError(serverError || 'Failed to revoke invite');
    } finally {
      setRevokingInviteId(null);
    }
  };

  const handleCopyInvite = async (invite) => {
    try {
      await navigator.clipboard.writeText(invite.invite_url);
      setCopiedInviteId(invite.id);
      window.setTimeout(() => {
        setCopiedInviteId((current) => (current === invite.id ? null : current));
      }, 1500);
    } catch {
      setInviteError('Unable to copy invite link automatically');
    }
  };

  const handleAddMember = async (event, emailOverride = null) => {
    if (event) {
      event.preventDefault();
    }

    const normalizedEmail = (emailOverride ?? memberEmailInput).trim().toLowerCase();
    if (!normalizedEmail) {
      setAddMemberError('Please enter an email address');
      setAddMemberSuccess('');
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setAddMemberError('Please enter a valid email address');
      setAddMemberSuccess('');
      return;
    }

    const isAlreadyMember = group.members.some(
      (member) => member.email?.toLowerCase() === normalizedEmail
    );
    if (isAlreadyMember) {
      setAddMemberError('This user is already a member of this group');
      setAddMemberSuccess('');
      return;
    }

    try {
      setAddingMember(true);
      setAddMemberError('');
      setAddMemberSuccess('');

      const response = await groupMembersApi.add(id, normalizedEmail);
      const member = response.data?.member;

      if (member?.id) {
        setGroup((prevGroup) => {
          if (!prevGroup) return prevGroup;

          const alreadyExists = prevGroup.members.some((existingMember) => existingMember.id === member.id);
          if (alreadyExists) return prevGroup;

          return {
            ...prevGroup,
            members: [...prevGroup.members, member]
          };
        });
      }

      setMemberEmailInput('');
      setAddMemberSuccess(member?.name ? `${member.name} added to the group` : 'Member added successfully');
      setFriendSuggestions([]);
    } catch (error) {
      const serverError = error.response?.data?.errors?.join(', ') || error.response?.data?.error;
      setAddMemberError(serverError || 'Failed to add member');
      setAddMemberSuccess('');
    } finally {
      setAddingMember(false);
    }
  };

  const openEditExpenseModal = (expense) => {
    const totalAmount = parseFloat(expense.amount || 0);
    const uiSplitType = expense.split_type === 'exact' ? 'amount' : expense.split_type;
    const splitsByUserId = new Map(
      expense.expense_splits.map((split) => [split.user.id, split])
    );

    const formSplits = group.members.map((member) => {
      const existingSplit = splitsByUserId.get(member.id);
      const splitAmount = existingSplit ? parseFloat(existingSplit.amount || 0) : 0;
      const splitPercentage = totalAmount > 0 ? (splitAmount / totalAmount) * 100 : 0;

      return {
        user_id: member.id,
        name: member.name,
        included: Boolean(existingSplit),
        amount: splitAmount.toFixed(2),
        percentage: splitPercentage.toFixed(2)
      };
    });

    setEditExpenseError('');
    setEditingExpenseId(expense.id);
    setEditExpenseForm({
      description: expense.description || '',
      amount: parseFloat(expense.amount || 0).toFixed(2),
      date: expense.date || new Date().toISOString().split('T')[0],
      split_type: uiSplitType || 'equal',
      paid_by_id: expense.paid_by?.id || user.id,
      splits: formSplits
    });
    setShowEditExpense(true);
  };

  const updateEditSplit = (userId, field, value) => {
    setEditExpenseForm((prev) => ({
      ...prev,
      splits: prev.splits.map((split) =>
        split.user_id === userId ? { ...split, [field]: value } : split
      )
    }));
  };

  const toggleEditSplitParticipant = (userId, included) => {
    setEditExpenseForm((prev) => ({
      ...prev,
      splits: prev.splits.map((split) =>
        split.user_id === userId ? { ...split, included } : split
      )
    }));
  };

  const rebalanceSplitOnBlur = (editedUserId) => {
    setEditExpenseForm((prev) => {
      if (prev.split_type === 'equal') return prev;

      const includedSplits = prev.splits.filter((split) => split.included);
      if (includedSplits.length < 2) return prev;

      const preferredAutoSplit = includedSplits.find(
        (split) => split.user_id === user.id && split.user_id !== editedUserId
      );
      const fallbackAutoSplit = includedSplits.find(
        (split) => split.user_id !== editedUserId
      );
      const autoSplit = preferredAutoSplit || fallbackAutoSplit;
      if (!autoSplit) return prev;

      const targetTotal =
        prev.split_type === 'percentage'
          ? 100
          : (parseFloat(prev.amount) || 0);

      const sumExcludingAuto = includedSplits.reduce((sum, split) => {
        if (split.user_id === autoSplit.user_id) return sum;
        const value = prev.split_type === 'percentage'
          ? (parseFloat(split.percentage) || 0)
          : (parseFloat(split.amount) || 0);
        return sum + value;
      }, 0);

      const rawRemaining = targetTotal - sumExcludingAuto;
      const remaining = Math.max(0, rawRemaining);

      return {
        ...prev,
        splits: prev.splits.map((split) => {
          if (split.user_id !== autoSplit.user_id) return split;

          if (prev.split_type === 'percentage') {
            return { ...split, percentage: remaining.toFixed(2) };
          }

          return { ...split, amount: remaining.toFixed(2) };
        })
      };
    });
  };

  const handleUpdateExpense = async (e) => {
    e.preventDefault();
    if (!editingExpenseId) return;
    if (!isValidISODate(editExpenseForm.date)) {
      setEditExpenseError('Please enter a valid date in DD/MM/YYYY format');
      return;
    }

    const includedSplits = editExpenseForm.splits.filter((split) => split.included);
    if (includedSplits.length === 0) {
      setEditExpenseError('Select at least one participant for the split');
      return;
    }

    const splitsPayload = includedSplits.map((split) => {
      if (editExpenseForm.split_type === 'percentage') {
        return { user_id: split.user_id, percentage: split.percentage };
      }
      if (editExpenseForm.split_type === 'amount') {
        return { user_id: split.user_id, amount: split.amount };
      }
      return { user_id: split.user_id };
    });

    try {
      setSavingExpense(true);
      setEditExpenseError('');
      await api.patch(`/groups/${id}/expenses/${editingExpenseId}`, {
        expense: {
          description: editExpenseForm.description,
          amount: editExpenseForm.amount,
          date: editExpenseForm.date,
          currency: group.currency,
          paid_by_id: editExpenseForm.paid_by_id,
          split_type: editExpenseForm.split_type,
          splits: splitsPayload
        }
      });

      setShowEditExpense(false);
      setEditingExpenseId(null);
      fetchGroupData();
    } catch (error) {
      const serverError = error.response?.data?.errors?.join(', ');
      const fallbackError = error.response?.data?.error;
      setEditExpenseError(serverError || fallbackError || 'Failed to update expense');
    } finally {
      setSavingExpense(false);
    }
  };

  const openDeleteExpenseConfirm = (expense) => {
    setDeleteExpenseError('');
    setPendingDeleteExpense(expense);
    setShowDeleteConfirm(true);
  };

  const handleDeleteExpense = async () => {
    if (!pendingDeleteExpense) return;
    const expenseId = pendingDeleteExpense.id;

    try {
      setDeletingExpenseId(expenseId);
      setDeleteExpenseError('');
      await api.delete(`/groups/${id}/expenses/${expenseId}`);

      if (editingExpenseId === expenseId) {
        setShowEditExpense(false);
        setEditingExpenseId(null);
      }

      setShowDeleteConfirm(false);
      setPendingDeleteExpense(null);
      fetchGroupData();
    } catch (error) {
      setDeleteExpenseError(error.response?.data?.error || 'Failed to delete expense');
    } finally {
      setDeletingExpenseId(null);
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
          <button
            className="btn btn-secondary"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
            onClick={openSettleModal}
            disabled={settlementCandidates.length === 0}
            title={settlementCandidates.length === 0 ? 'No members are currently owed money' : 'Settle up'}
          >
            Settle
          </button>
        )}
      </div>
    );
  };

  if (loading) return <div className="container text-center pt-20">Loading group details...</div>;
  if (!group) return <div className="container text-center pt-20">Group not found</div>;

  const currencySym = group.currency === 'INR' ? '₹' : (group.currency === 'USD' ? '$' : '€');
  const isGroupAdmin = group.created_by_id === user.id;
  const canManageMembers = isGroupAdmin;
  const canEditExpense = (expense) => isGroupAdmin || expense.paid_by.id === user.id;
  const canDeleteExpense = (expense) => isGroupAdmin || expense.paid_by.id === user.id;
  const includedEditSplits = editExpenseForm.splits.filter((split) => split.included);
  const orderedBalances = [
    ...balances.filter((balance) => balance.user.id !== user.id),
    ...balances.filter((balance) => balance.user.id === user.id)
  ];
  const orderedMembers = [
    ...group.members.filter((member) => member.id !== user.id),
    ...group.members.filter((member) => member.id === user.id)
  ];
  const existingMemberEmails = new Set(
    group.members.map((member) => member.email?.trim().toLowerCase()).filter(Boolean)
  );
  const filteredFriendSuggestions = friendSuggestions.filter((person) => {
    if (!person.email) return false;
    return !existingMemberEmails.has(person.email.toLowerCase());
  });
  const currentUserBalanceEntry = balances.find((entry) => entry.user.id === user.id);
  const currentUserDebt = Math.max(0, -(parseFloat(currentUserBalanceEntry?.balance || 0)));
  const settlementCandidates = balances
    .filter((entry) => entry.user.id !== user.id && parseFloat(entry.balance || 0) > 0.01)
    .sort((a, b) => parseFloat(b.balance || 0) - parseFloat(a.balance || 0));

  const maxPayableToUser = (recipientId) => {
    const recipient = settlementCandidates.find((entry) => entry.user.id === recipientId);
    if (!recipient) return 0;

    const recipientOwed = Math.max(0, parseFloat(recipient.balance || 0));
    return Math.max(0, Math.min(currentUserDebt, recipientOwed));
  };

  const openSettleModal = () => {
    if (currentUserDebt <= 0 || settlementCandidates.length === 0) return;

    const defaultRecipientId = settlementCandidates[0].user.id;
    const defaultMax = maxPayableToUser(defaultRecipientId);

    setSettleError('');
    setSettleForm({
      to_user_id: defaultRecipientId,
      amount: defaultMax > 0 ? defaultMax.toFixed(2) : '',
      date: new Date().toISOString().split('T')[0],
      note: ''
    });
    setShowSettleModal(true);
  };

  const updateSettleRecipient = (recipientId) => {
    const nextMax = maxPayableToUser(recipientId);

    setSettleForm((prev) => {
      const currentAmount = parseFloat(prev.amount || 0);
      const nextAmount =
        currentAmount > 0 && currentAmount <= nextMax
          ? currentAmount.toFixed(2)
          : (nextMax > 0 ? nextMax.toFixed(2) : '');

      return { ...prev, to_user_id: recipientId, amount: nextAmount };
    });
  };

  const handleSettlePayment = async (e) => {
    e.preventDefault();
    const recipientId = settleForm.to_user_id;
    const amount = parseFloat(settleForm.amount || 0);
    const maxAmount = maxPayableToUser(recipientId);

    if (!recipientId) {
      setSettleError('Please choose a member to settle with');
      return;
    }

    if (!(amount > 0)) {
      setSettleError('Settlement amount must be greater than zero');
      return;
    }

    if (amount > maxAmount + 0.001) {
      setSettleError(`Amount cannot exceed ${currencySym}${maxAmount.toFixed(2)}`);
      return;
    }
    if (!isValidISODate(settleForm.date)) {
      setSettleError('Please enter a valid date in DD/MM/YYYY format');
      return;
    }

    try {
      setSettlingPayment(true);
      setSettleError('');
      await api.post(`/groups/${id}/settlements`, {
        settlement: {
          to_user_id: recipientId,
          amount: amount.toFixed(2),
          date: settleForm.date,
          note: settleForm.note
        }
      });

      setShowSettleModal(false);
      fetchGroupData();
    } catch (error) {
      const serverErrors = error.response?.data?.errors;
      setSettleError(
        Array.isArray(serverErrors) ? serverErrors.join(', ') : (error.response?.data?.error || 'Failed to record settlement')
      );
    } finally {
      setSettlingPayment(false);
    }
  };

  const settleRecipientMaxAmount = settleForm.to_user_id ? maxPayableToUser(settleForm.to_user_id) : 0;
  const splitTypeOptions = [
    { value: 'equal', label: 'Equal' },
    { value: 'amount', label: 'Amount' },
    { value: 'percentage', label: 'Percentage' }
  ];
  const settlementRecipientOptions = settlementCandidates.map((entry) => ({
    value: entry.user.id,
    label: `${entry.user.name} (owed ${currencySym}${Math.max(0, parseFloat(entry.balance || 0)).toFixed(2)})`
  }));
  const includedAddSplits = expenseForm.splits.filter((split) => split.included);
  const addEnteredSplitTotal = includedAddSplits.reduce((sum, split) => {
    if (expenseForm.split_type === 'percentage') {
      return sum + (parseFloat(split.percentage) || 0);
    }
    if (expenseForm.split_type === 'amount') {
      return sum + (parseFloat(split.amount) || 0);
    }
    return sum;
  }, 0);
  const enteredSplitTotal = includedEditSplits.reduce((sum, split) => {
    if (editExpenseForm.split_type === 'percentage') {
      return sum + (parseFloat(split.percentage) || 0);
    }
    if (editExpenseForm.split_type === 'amount') {
      return sum + (parseFloat(split.amount) || 0);
    }
    return sum;
  }, 0);

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

      <div className="group-mobile-sections">
        <button
          type="button"
          className={`group-mobile-section-btn ${mobileSection === 'expenses' ? 'active' : ''}`}
          onClick={() => setMobileSection('expenses')}
        >
          Expenses ({expenses.length})
        </button>
        <button
          type="button"
          className={`group-mobile-section-btn ${mobileSection === 'balances' ? 'active' : ''}`}
          onClick={() => setMobileSection('balances')}
        >
          Balances
        </button>
        <button
          type="button"
          className={`group-mobile-section-btn ${mobileSection === 'members' ? 'active' : ''}`}
          onClick={() => setMobileSection('members')}
        >
          Members ({group.members.length})
        </button>
      </div>

      <div className="group-details-layout">
        {/* Left Column - Expenses */}
        <div className={`flex flex-col gap-4 group-section ${mobileSection === 'expenses' ? 'active' : ''}`}>
          <div className="group-details-expense-header">
            <h2 className="text-2xl font-bold">Expenses</h2>
            <div className="group-details-expense-actions">
              <button className="btn btn-primary" onClick={toggleAddExpensePanel}>
                <Plus size={18} /> Add Expense
              </button>
            </div>
          </div>

          {showAddExpense && (
            <div className="glass-panel animate-fade-in">
              <h3 style={{ marginBottom: '1rem' }}>Add New Expense</h3>
              <form onSubmit={handleAddExpense} className="flex flex-col gap-3">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Description</label>
                  <input
                    required
                    placeholder="e.g. Dinner at Cafe"
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm((prev) => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                <div className="expense-form-fields-row">
                  <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                    <label>Amount ({group.currency})</label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      value={expenseForm.amount}
                      onChange={(e) => setExpenseForm((prev) => ({ ...prev, amount: e.target.value }))}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                    <label>Date</label>
                    <CustomDateInput
                      required
                      value={expenseForm.date}
                      onChange={(nextDate) => setExpenseForm((prev) => ({ ...prev, date: nextDate }))}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                    <label>Split Type</label>
                    <CustomSelect
                      value={expenseForm.split_type}
                      options={splitTypeOptions}
                      onChange={(nextValue) => setExpenseForm((prev) => ({ ...prev, split_type: nextValue }))}
                    />
                  </div>
                </div>

                <div style={{ marginTop: '0.5rem' }}>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>
                    Choose participants and split values:
                  </div>
                  <div className="flex flex-col gap-2">
                    {expenseForm.splits.map((split) => (
                      <div key={split.user_id} className="split-row">
                        <input
                          className="split-check"
                          type="checkbox"
                          checked={split.included}
                          onChange={(e) => toggleAddSplitParticipant(split.user_id, e.target.checked)}
                        />
                        <span className="split-member-name">{split.user_id === user.id ? 'You' : split.name}</span>
                        {expenseForm.split_type !== 'equal' && split.included ? (
                          <input
                            className="split-value-input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={expenseForm.split_type === 'percentage' ? split.percentage : split.amount}
                            onChange={(e) => updateAddSplit(
                              split.user_id,
                              expenseForm.split_type === 'percentage' ? 'percentage' : 'amount',
                              e.target.value
                            )}
                            onBlur={() => rebalanceAddSplitOnBlur(split.user_id)}
                          />
                        ) : (
                          <span className="split-auto-value">
                            {expenseForm.split_type === 'equal' ? 'Auto' : '--'}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {expenseForm.split_type !== 'equal' && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {expenseForm.split_type === 'percentage'
                      ? `Entered percentage total: ${addEnteredSplitTotal.toFixed(2)}% (must be 100%)`
                      : `Entered amount total: ${currencySym}${addEnteredSplitTotal.toFixed(2)} (must match expense amount)`
                    }
                  </div>
                )}

                {addExpenseError && <div className="error-text" style={{ margin: 0 }}>{addExpenseError}</div>}

                <div className="flex gap-3" style={{ marginTop: '0.5rem' }}>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Save</button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowAddExpense(false);
                      setAddExpenseError('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="flex flex-col gap-3 expense-list expense-list-compact">
            {expenses.length === 0 ? (
              <div className="glass-panel text-center" style={{ padding: '3rem 2rem' }}>
                <Receipt size={40} style={{ color: 'var(--text-secondary)', margin: '0 auto 1rem', opacity: 0.5 }} />
                <p>No expenses yet. Go ahead and add one!</p>
              </div>
            ) : (
              expenses.map(expense => (
                <div key={expense.id} className="glass-panel expense-row expense-row-compact">
                  <div className="flex items-center gap-4 expense-main">
                    <div className="expense-icon-wrap">
                      <Receipt size={24} color="var(--primary-color)" />
                    </div>
                    <div>
                      <div className="expense-title">{expense.description}</div>
                      <div className="expense-subtitle">
                        {expense.paid_by.id === user.id ? 'You' : expense.paid_by.name} paid {currencySym}{parseFloat(expense.amount).toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right expense-side">
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
                    <div className="expense-action-stack">
                      {canEditExpense(expense) && (
                        <button
                          className="btn btn-secondary expense-action-btn"
                          onClick={() => openEditExpenseModal(expense)}
                          disabled={deletingExpenseId === expense.id}
                        >
                          <Pencil size={14} /> Edit
                        </button>
                      )}
                      {canDeleteExpense(expense) && (
                        <button
                          className="btn btn-danger expense-action-btn"
                          onClick={() => openDeleteExpenseConfirm(expense)}
                          disabled={deletingExpenseId === expense.id}
                        >
                          <Trash2 size={14} /> {deletingExpenseId === expense.id ? 'Deleting...' : 'Delete'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column - Balances & Members */}
        <div className="group-side-panels">
          <div className={`group-section ${mobileSection === 'balances' ? 'active' : ''}`}>
            <h2 className="text-2xl font-bold" style={{ marginBottom: '1rem' }}>Balances</h2>
            <div className="flex flex-col gap-3">
              {orderedBalances.map(b => renderBalanceCard(b))}
            </div>
          </div>

          <div className={`group-section ${mobileSection === 'members' ? 'active' : ''}`}>
            <h2 className="text-xl font-bold flex justify-between items-center" style={{ marginBottom: '1rem' }}>
              Members ({group.members.length})
              <button
                className="btn btn-secondary"
                onClick={openInviteModal}
                disabled={!canManageMembers}
                title={canManageMembers ? 'Invite member via link' : 'Only group admin can invite members'}
                style={{ padding: '0.4rem 0.6rem', border: 'none', background: 'transparent', color: 'var(--primary-color)', opacity: canManageMembers ? 1 : 0.4, cursor: canManageMembers ? 'pointer' : 'not-allowed' }}
              >
                <UserPlus size={18} />
              </button>
            </h2>
            <div className="glass-panel flex flex-col gap-3" style={{ padding: '1rem 1.5rem' }}>
              {orderedMembers.map(member => (
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

      {showEditExpense && (
        <div className="modal-overlay">
          <div className="glass-panel animate-fade-in modal-card" style={{ width: '100%', maxWidth: 760, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: '1rem' }}>Edit Expense</h3>
            <form onSubmit={handleUpdateExpense} className="flex flex-col gap-3">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Description</label>
                <input
                  required
                  value={editExpenseForm.description}
                  onChange={(e) => setEditExpenseForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div className="expense-form-fields-row">
                <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                  <label>Amount ({group.currency})</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={editExpenseForm.amount}
                    onChange={(e) => setEditExpenseForm((prev) => ({ ...prev, amount: e.target.value }))}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                  <label>Date</label>
                  <CustomDateInput
                    required
                    value={editExpenseForm.date}
                    onChange={(nextDate) => setEditExpenseForm((prev) => ({ ...prev, date: nextDate }))}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                  <label>Split Type</label>
                  <CustomSelect
                    value={editExpenseForm.split_type}
                    options={splitTypeOptions}
                    onChange={(nextValue) => setEditExpenseForm((prev) => ({ ...prev, split_type: nextValue }))}
                  />
                </div>
              </div>

              <div style={{ marginTop: '0.5rem' }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>
                  Choose participants and split values:
                </div>
                <div className="flex flex-col gap-2">
                  {editExpenseForm.splits.map((split) => (
                    <div key={split.user_id} className="split-row">
                      <input
                        className="split-check"
                        type="checkbox"
                        checked={split.included}
                        onChange={(e) => toggleEditSplitParticipant(split.user_id, e.target.checked)}
                      />
                      <span className="split-member-name">{split.user_id === user.id ? 'You' : split.name}</span>
                      {editExpenseForm.split_type !== 'equal' && split.included ? (
                        <input
                          className="split-value-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={editExpenseForm.split_type === 'percentage' ? split.percentage : split.amount}
                          onChange={(e) => updateEditSplit(
                            split.user_id,
                            editExpenseForm.split_type === 'percentage' ? 'percentage' : 'amount',
                            e.target.value
                          )}
                          onBlur={() => rebalanceSplitOnBlur(split.user_id)}
                        />
                      ) : (
                        <span className="split-auto-value">
                          {editExpenseForm.split_type === 'equal' ? 'Auto' : '--'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {editExpenseForm.split_type !== 'equal' && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {editExpenseForm.split_type === 'percentage'
                    ? `Entered percentage total: ${enteredSplitTotal.toFixed(2)}% (must be 100%)`
                    : `Entered amount total: ${currencySym}${enteredSplitTotal.toFixed(2)} (must match expense amount)`
                  }
                </div>
              )}

              {editExpenseError && <div className="error-text" style={{ margin: 0 }}>{editExpenseError}</div>}

              <div className="flex gap-3" style={{ marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={savingExpense}>
                  {savingExpense ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowEditExpense(false)}
                  disabled={savingExpense}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showInviteModal && (
        <div className="modal-overlay" onClick={handleInviteModalBackdropClick}>
          <div className="glass-panel animate-fade-in modal-card" style={{ width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: '0.5rem' }}>Invite Members</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginBottom: '1rem' }}>
              Type a name to search people you already traveled with, then add them to this group.
            </p>

            <div className="glass-panel" style={{ padding: '0.95rem 1rem', marginBottom: '1rem' }}>
              <h4 style={{ marginBottom: '0.6rem', fontSize: '1rem' }}>Add Friends</h4>
              <form onSubmit={handleAddMember} autoComplete="off" className="flex gap-2 items-center" style={{ flexWrap: 'wrap' }}>
                <input
                  type="text"
                  name="friend_search"
                  value={memberEmailInput}
                  onChange={(e) => setMemberEmailInput(e.target.value)}
                  placeholder="Type name or email (e.g., Test)"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  inputMode="search"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  data-form-type="other"
                  style={{
                    flex: 1,
                    minWidth: '230px',
                    background: 'rgba(15, 23, 42, 0.4)',
                    border: '1px solid var(--surface-border)',
                    borderRadius: '10px',
                    padding: '0.62rem 0.78rem',
                    color: 'var(--text-primary)'
                  }}
                  disabled={addingMember}
                />
                <button type="submit" className="btn btn-primary" disabled={addingMember}>
                  {addingMember ? 'Adding...' : 'Add Member'}
                </button>
              </form>

              {loadingFriendSuggestions ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', marginTop: '0.7rem' }}>
                  Searching friends...
                </p>
              ) : filteredFriendSuggestions.length > 0 ? (
                <div style={{ marginTop: '0.75rem' }}>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.45rem' }}>
                    Friend suggestions
                  </div>
                  <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                    {filteredFriendSuggestions.map((person) => (
                      <button
                        key={person.id || person.email}
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.4rem 0.65rem', fontSize: '0.82rem' }}
                        onClick={(event) => handleAddMember(event, person.email)}
                        disabled={addingMember}
                        title={person.email}
                      >
                        {person.name ? `${person.name} (${person.email})` : person.email}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                memberEmailInput.trim() && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', marginTop: '0.7rem' }}>
                    No matching friends found for this search.
                  </p>
                )
              )}

              {addMemberError && <div className="error-text" style={{ marginTop: '0.7rem' }}>{addMemberError}</div>}
              {addMemberSuccess && <div style={{ marginTop: '0.7rem', color: 'var(--success-color)', fontSize: '0.9rem' }}>{addMemberSuccess}</div>}
              {friendSuggestionError && <div className="error-text" style={{ marginTop: '0.7rem' }}>{friendSuggestionError}</div>}
            </div>

            <div style={{ borderTop: '1px solid var(--surface-border)', margin: '0 0 1rem', opacity: 0.65 }} />

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.85rem' }}>
              Invite link mode: any signed-in user with an active link can join this group.
              Generating a new link revokes the previous active link.
            </p>
            <form onSubmit={handleCreateInvite} className="flex flex-col gap-3">
              <label className="split-row">
                <input
                  type="checkbox"
                  checked={inviteNoExpiry}
                  onChange={(e) => handleInviteNoExpiryChange(e.target.checked)}
                  disabled={creatingInvite}
                />
                <span>No expiry</span>
              </label>

              {!inviteNoExpiry && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Expiry (hours)</label>
                  <input
                    type="number"
                    min="1"
                    max="168"
                    step="1"
                    value={inviteExpiresHours}
                    onChange={(e) => setInviteExpiresHours(e.target.value)}
                    placeholder="48"
                  />
                </div>
              )}

              <div className="flex gap-3" style={{ marginTop: '0.3rem', flexWrap: 'wrap' }}>
                <button type="submit" className="btn btn-primary" disabled={creatingInvite}>
                  {creatingInvite ? 'Generating...' : invites.length > 0 ? 'Regenerate Invite Link' : 'Generate Invite Link'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={closeInviteModal} disabled={creatingInvite || Boolean(revokingInviteId) || addingMember}>
                  Close
                </button>
              </div>
            </form>

            {inviteError && <div className="error-text" style={{ marginTop: '0.8rem' }}>{inviteError}</div>}

            <div style={{ marginTop: '1.15rem' }}>
              <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Active Invite Links</h4>

              {loadingInvites ? (
                <p style={{ color: 'var(--text-secondary)' }}>Loading invites...</p>
              ) : invites.length === 0 ? (
                latestExpiredInvite ? (
                  <div className="glass-panel" style={{ padding: '0.9rem 1rem' }}>
                    <div className="flex justify-between items-center" style={{ marginBottom: '0.55rem' }}>
                      <span style={{ fontSize: '0.86rem', fontWeight: 600, textTransform: 'capitalize' }}>
                        Status: expired
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Expired: {formatDateTimeForUI(latestExpiredInvite.expires_at)}
                      </span>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                      Your previous invite link has expired. Generate a new invite link to continue inviting members.
                    </p>
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-secondary)' }}>No active invite link. Generate one to invite members.</p>
                )
              ) : (
                <div className="flex flex-col gap-3">
                  {invites.map((invite) => (
                    <div key={invite.id} className="glass-panel" style={{ padding: '0.9rem 1rem' }}>
                      <div className="flex justify-between items-center" style={{ marginBottom: '0.55rem' }}>
                        <span style={{ fontSize: '0.86rem', fontWeight: 600, textTransform: 'capitalize' }}>
                          Status: {invite.status}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          Expires: {formatDateTimeForUI(invite.expires_at)}
                        </span>
                      </div>

                      <div className="flex gap-2 items-center" style={{ flexWrap: 'wrap' }}>
                        <input
                          readOnly
                          value={invite.invite_url}
                          style={{
                            flex: 1,
                            minWidth: '220px',
                            background: 'rgba(15, 23, 42, 0.4)',
                            border: '1px solid var(--surface-border)',
                            borderRadius: '10px',
                            padding: '0.62rem 0.78rem',
                            color: 'var(--text-primary)'
                          }}
                        />
                        <button type="button" className="btn btn-secondary" onClick={() => handleCopyInvite(invite)}>
                          {copiedInviteId === invite.id ? 'Copied' : 'Copy'}
                        </button>
                        {invite.status === 'active' && (
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => handleRevokeInvite(invite.id)}
                            disabled={revokingInviteId === invite.id}
                          >
                            {revokingInviteId === invite.id ? 'Revoking...' : 'Revoke'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && pendingDeleteExpense && (
        <div className="modal-overlay">
          <div className="glass-panel animate-fade-in modal-card" style={{ width: '100%', maxWidth: 460 }}>
            <h3 style={{ marginBottom: '0.8rem' }}>Delete Expense</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.35rem' }}>
              Are you sure you want to delete <strong style={{ color: 'var(--text-primary)' }}>{pendingDeleteExpense.description}</strong>?
            </p>
            <p style={{ color: 'var(--danger-color)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              This action cannot be undone.
            </p>

            {deleteExpenseError && <div className="error-text" style={{ margin: 0 }}>{deleteExpenseError}</div>}

            <div className="flex gap-3" style={{ marginTop: '0.8rem' }}>
              <button
                type="button"
                className="btn btn-danger"
                style={{ flex: 1 }}
                onClick={handleDeleteExpense}
                disabled={deletingExpenseId === pendingDeleteExpense.id}
              >
                {deletingExpenseId === pendingDeleteExpense.id ? 'Deleting...' : 'Delete Expense'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (deletingExpenseId) return;
                  setShowDeleteConfirm(false);
                  setPendingDeleteExpense(null);
                  setDeleteExpenseError('');
                }}
                disabled={Boolean(deletingExpenseId)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettleModal && (
        <div className="modal-overlay">
          <div className="glass-panel animate-fade-in modal-card" style={{ width: '100%', maxWidth: 500 }}>
            <h3 style={{ marginBottom: '0.8rem' }}>Settle Up</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Record a full or partial payment. Your current total due is <strong style={{ color: 'var(--text-primary)' }}>{currencySym}{currentUserDebt.toFixed(2)}</strong>.
            </p>

            <form onSubmit={handleSettlePayment} className="flex flex-col gap-3">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Pay To</label>
                <CustomSelect
                  value={settleForm.to_user_id}
                  options={settlementRecipientOptions}
                  onChange={(nextValue) => updateSettleRecipient(nextValue)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Amount ({group.currency})</label>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={settleForm.amount}
                  onChange={(e) => setSettleForm((prev) => ({ ...prev, amount: e.target.value }))}
                />
              </div>

              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Maximum you can settle with this member right now: {currencySym}{settleRecipientMaxAmount.toFixed(2)}
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Date</label>
                <CustomDateInput
                  required
                  value={settleForm.date}
                  onChange={(nextDate) => setSettleForm((prev) => ({ ...prev, date: nextDate }))}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Note (Optional)</label>
                <textarea
                  rows={3}
                  value={settleForm.note}
                  onChange={(e) => setSettleForm((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder="UPI / cash / bank reference..."
                />
              </div>

              {settleError && <div className="error-text" style={{ margin: 0 }}>{settleError}</div>}

              <div className="flex gap-3" style={{ marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={settlingPayment}>
                  {settlingPayment ? 'Recording...' : 'Record Settlement'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    if (settlingPayment) return;
                    setShowSettleModal(false);
                    setSettleError('');
                  }}
                  disabled={settlingPayment}
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
