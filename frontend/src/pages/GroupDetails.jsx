import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api, { groupInvitesApi, groupMembersApi, groupsApi } from '../lib/api';
import { useAuth } from '../contexts/useAuth';
import {
  ArrowLeft,
  Plus,
  Receipt,
  UserPlus,
  Pencil,
  Trash2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Settings,
  Archive,
  RotateCcw,
  Camera,
  X,
  Image,
  ChevronDown,
  Mail,
  Phone
} from 'lucide-react';
import NotificationBell from '../components/NotificationBell';

const todayISO = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};
const FRIEND_SUGGESTION_DEBOUNCE_MS = 220;
const GROUP_DATA_POLL_INTERVAL_MS = 10000;

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
const normalizeGroupPayload = (payload) => payload?.group || payload?.data || payload || null;
const serverErrorMessage = (error, fallback) => {
  const errors = error.response?.data?.errors;
  if (Array.isArray(errors) && errors.length > 0) return errors.join(', ');

  return error.response?.data?.error || fallback;
};

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

const monthLabelFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const weekdayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const isoDateToLocalDate = (isoDate) => {
  if (!isValidISODate(isoDate)) return new Date();

  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const localDateToISO = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const formatExpenseDateLabel = (isoDate) => {
  if (!isValidISODate(isoDate)) return '';

  const expenseDate = isoDateToLocalDate(isoDate);
  const today = isoDateToLocalDate(todayISO());
  const dayDiff = Math.round((today - expenseDate) / 86400000);

  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff > 1 && dayDiff < 7) {
    return expenseDate.toLocaleDateString('en-US', { weekday: 'long' });
  }

  return expenseDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: expenseDate.getFullYear() === today.getFullYear() ? undefined : 'numeric'
  });
};

const buildCalendarDays = (viewDate) => {
  const firstOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const calendarStart = new Date(firstOfMonth);
  calendarStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_item, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    return date;
  });
};

const formatDateTimeForUI = (value) => {
  if (!value) return '--';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';

  return date.toLocaleString();
};

const orderMembersWithUserLast = (members = [], currentUserId = '') => [
  ...members.filter((member) => member.id !== currentUserId),
  ...members.filter((member) => member.id === currentUserId)
];

const findRemainderSplit = (includedSplits, editedUserId) => (
  [...includedSplits].reverse().find((split) => split.user_id !== editedUserId)
);

const buildDefaultExpenseForm = (members = [], paidById = '') => ({
  description: '',
  amount: '',
  date: todayISO(),
  paid_by_id: paidById,
  split_type: 'equal',
  splits: orderMembersWithUserLast(members, paidById).map((member) => ({
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
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(isoDateToLocalDate(value));
  const rootRef = useRef(null);
  const selectedISODate = isValidISODate(value) ? value : '';
  const viewMonth = viewDate.getMonth();

  useEffect(() => {
    setDisplayValue(formatISODateForUI(value));
    setViewDate(isoDateToLocalDate(value));
  }, [value]);

  useEffect(() => {
    const handleDocumentClick = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    document.addEventListener('touchstart', handleDocumentClick);

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      document.removeEventListener('touchstart', handleDocumentClick);
    };
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

  const commitValue = () => {
    const parsedDate = parseUIDateToISO(displayValue);
    if (parsedDate) {
      onChange(parsedDate);
      setDisplayValue(formatISODateForUI(parsedDate));
      setViewDate(isoDateToLocalDate(parsedDate));
      return;
    }

    setDisplayValue(formatISODateForUI(value));
  };

  const openDatePicker = () => {
    if (disabled) return;
    setOpen((prev) => !prev);
  };

  const changeMonth = (offset) => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  const selectDate = (date) => {
    const nextDate = localDateToISO(date);
    onChange(nextDate);
    setDisplayValue(formatISODateForUI(nextDate));
    setViewDate(date);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="custom-date-input">
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
            e.preventDefault();
            commitValue();
            setOpen(false);
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
      {open && (
        <div className="custom-date-calendar" role="dialog" aria-label="Choose date">
          <div className="custom-date-calendar-header">
            <button type="button" className="custom-date-nav-btn" onClick={() => changeMonth(-1)} aria-label="Previous month">
              <ChevronLeft size={17} />
            </button>
            <div className="custom-date-month-label">{monthLabelFormatter.format(viewDate)}</div>
            <button type="button" className="custom-date-nav-btn" onClick={() => changeMonth(1)} aria-label="Next month">
              <ChevronRight size={17} />
            </button>
          </div>
          <div className="custom-date-weekdays" aria-hidden="true">
            {weekdayLabels.map((label, index) => (
              <span key={`${label}-${index}`}>{label}</span>
            ))}
          </div>
          <div className="custom-date-grid">
            {buildCalendarDays(viewDate).map((date) => {
              const isoDate = localDateToISO(date);
              const isSelected = isoDate === selectedISODate;
              const isToday = isoDate === todayISO();
              const isOutsideMonth = date.getMonth() !== viewMonth;

              return (
                <button
                  key={isoDate}
                  type="button"
                  className={`custom-date-day ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${isOutsideMonth ? 'muted' : ''}`}
                  onClick={() => selectDate(date)}
                  aria-pressed={isSelected}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <div className="custom-date-calendar-footer">
            <button type="button" className="custom-date-footer-btn" onClick={() => selectDate(new Date())}>
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const GroupDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const appTitle = 'Tripsplit';
  const currencyOptions = [
    { value: 'INR', label: 'INR (₹)' },
    { value: 'USD', label: 'USD ($)' },
    { value: 'EUR', label: 'EUR (€)' }
  ];
  
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [balances, setBalances] = useState([]);
  const [suggestedSettlements, setSuggestedSettlements] = useState([]);
  const [guestSettlementSuggestions, setGuestSettlementSuggestions] = useState([]);
  const [invites, setInvites] = useState([]);
  const [latestExpiredInvite, setLatestExpiredInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [groupSettingsForm, setGroupSettingsForm] = useState({
    name: '',
    description: '',
    currency: 'INR',
    simplify_debts: false
  });
  const [groupSettingsError, setGroupSettingsError] = useState('');
  const [groupSettingsSuccess, setGroupSettingsSuccess] = useState('');
  const [savingGroupSettings, setSavingGroupSettings] = useState(false);
  const [archivingGroup, setArchivingGroup] = useState(false);
  const [restoringGroup, setRestoringGroup] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [deleteGroupConfirmInput, setDeleteGroupConfirmInput] = useState('');
  
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [creatingExpense, setCreatingExpense] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteExpiresHours, setInviteExpiresHours] = useState('48');
  const [inviteNoExpiry, setInviteNoExpiry] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [addMemberError, setAddMemberError] = useState('');
  const [addMemberSuccess, setAddMemberSuccess] = useState('');
  const [memberEmailInput, setMemberEmailInput] = useState('');
  const [memberPhoneInput, setMemberPhoneInput] = useState('');
  const [memberAddMode, setMemberAddMode] = useState('email'); // 'email' | 'phone'
  const [memberGuestName, setMemberGuestName] = useState('');
  const [selectedSuggestedFriend, setSelectedSuggestedFriend] = useState(null);
  const [addingMember, setAddingMember] = useState(false);
  const [pendingRemoveMember, setPendingRemoveMember] = useState(null);
  const [removingMemberId, setRemovingMemberId] = useState(null);
  const [removeMemberError, setRemoveMemberError] = useState('');
  const [removeMemberSuccess, setRemoveMemberSuccess] = useState('');
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
    from_user_id: null,
    to_user_id: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    note: ''
  });
  const [upiPaymentFired, setUpiPaymentFired] = useState(false);
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
  const [receiptFile, setReceiptFile] = useState(null);
  const [editReceiptFile, setEditReceiptFile] = useState(null);
  const [receiptLightbox, setReceiptLightbox] = useState(null);
  const receiptInputRef = useRef(null);
  const editReceiptInputRef = useRef(null);
  const expenseCreationInFlightRef = useRef(false);
  const [settlements, setSettlements] = useState([]);
  const [showSettlementHistory, setShowSettlementHistory] = useState(false);
  const [expandedBalanceId, setExpandedBalanceId] = useState(null);
  const groupDataFetchInFlightRef = useRef(false);

  const fetchGroupData = useCallback(async () => {
    if (groupDataFetchInFlightRef.current) return;

    try {
      groupDataFetchInFlightRef.current = true;
      const [groupRes, expensesRes, balancesRes, settlementsRes] = await Promise.all([
        api.get(`/groups/${id}`),
        api.get(`/groups/${id}/expenses`),
        api.get(`/groups/${id}/balances`),
        api.get(`/groups/${id}/settlements`)
      ]);
      setGroup(normalizeGroupPayload(groupRes.data));
      const expensesData = expensesRes.data;
      setExpenses(Array.isArray(expensesData) ? expensesData : (expensesData.expenses || expensesData.data || []));
      setBalances(balancesRes.data.balances || []);
      setSuggestedSettlements(balancesRes.data.suggested_settlements || []);
      setGuestSettlementSuggestions(balancesRes.data.guest_settlement_suggestions || []);
      const settlementsData = settlementsRes.data;
      setSettlements(Array.isArray(settlementsData) ? settlementsData : (settlementsData.settlements || settlementsData.data || []));
    } catch (error) {
      console.error('Failed to fetch group data', error);
    } finally {
      groupDataFetchInFlightRef.current = false;
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchGroupData();

    const refreshGroupData = () => {
      fetchGroupData();
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;

      refreshGroupData();
    }, GROUP_DATA_POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshGroupData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', refreshGroupData);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', refreshGroupData);
    };
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
    const groupIsArchived = group?.status === 'archived' || Boolean(group?.archived_at);
    if (!groupIsArchived) return;

    setShowAddExpense(false);
    setShowEditExpense(false);
    setShowInviteModal(false);
    setShowSettleModal(false);
  }, [group?.archived_at, group?.status]);

  useEffect(() => {
    if (!showAddExpense || !group) return;

    setExpenseForm((prev) => {
      const prevSplitsByUserId = new Map(prev.splits.map((split) => [split.user_id, split]));
      const nextSplits = orderMembersWithUserLast(group.members, user.id).map((member) => {
        const existing = prevSplitsByUserId.get(member.id);
        return existing
          ? { ...existing, name: member.name }
          : { user_id: member.id, name: member.name, included: true, amount: '', percentage: '' };
      });

      return { ...prev, splits: nextSplits };
    });
  }, [group, showAddExpense, user.id]);

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (expenseCreationInFlightRef.current) return;
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
      expenseCreationInFlightRef.current = true;
      setCreatingExpense(true);
      setAddExpenseError('');

      const expenseData = {
        description: expenseForm.description,
        amount: expenseForm.amount,
        date: expenseForm.date,
        currency: group.currency,
        paid_by_id: expenseForm.paid_by_id || user.id,
        split_type: expenseForm.split_type,
        splits: splitsPayload
      };

      if (receiptFile) {
        const formData = new FormData();
        Object.entries(expenseData).forEach(([key, value]) => {
          if (key === 'splits') {
            value.forEach((split) => {
              Object.entries(split).forEach(([sk, sv]) => {
                formData.append(`expense[splits][][${sk}]`, sv);
              });
            });
          } else {
            formData.append(`expense[${key}]`, value);
          }
        });
        formData.append('expense[receipt]', receiptFile);
        await api.post(`/groups/${id}/expenses`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        await api.post(`/groups/${id}/expenses`, { expense: expenseData });
      }
      
      setShowAddExpense(false);
      setExpenseForm(buildDefaultExpenseForm(group.members, user.id));
      setReceiptFile(null);
      fetchGroupData(); // Refresh all data
    } catch (error) {
      const serverError = error.response?.data?.errors?.join(', ');
      const fallbackError = error.response?.data?.error;
      setAddExpenseError(serverError || fallbackError || 'Failed to add expense');
    } finally {
      expenseCreationInFlightRef.current = false;
      setCreatingExpense(false);
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

      const autoSplit = findRemainderSplit(includedSplits, editedUserId);
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
    setExpenseForm(buildDefaultExpenseForm(group?.members || [], user.id));
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
    setMemberPhoneInput('');
    setMemberAddMode('email');
    setSelectedSuggestedFriend(null);
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
    setMemberPhoneInput('');
    setMemberGuestName('');
    setSelectedSuggestedFriend(null);
    setFriendSuggestionError('');
    setFriendSuggestions([]);
    setCopiedInviteId(null);
  };

  const openGroupSettings = () => {
    if (!group) return;

    setGroupSettingsForm({
      name: group.name || '',
      description: group.description || '',
      currency: group.currency || 'INR',
      simplify_debts: Boolean(group.simplify_debts)
    });
    setGroupSettingsError('');
    setGroupSettingsSuccess('');
    setDeleteGroupConfirmInput('');
    setShowGroupSettings(true);
  };

  const closeGroupSettings = () => {
    if (savingGroupSettings || archivingGroup || restoringGroup || deletingGroup) return;

    setShowGroupSettings(false);
    setGroupSettingsError('');
    setGroupSettingsSuccess('');
    setDeleteGroupConfirmInput('');
  };

  const handleGroupSettingsBackdropClick = (event) => {
    if (event.target !== event.currentTarget) return;
    closeGroupSettings();
  };

  const handleUpdateGroup = async (event) => {
    event.preventDefault();
    if (!groupSettingsForm.name.trim()) {
      setGroupSettingsError('Group name is required');
      return;
    }

    try {
      setSavingGroupSettings(true);
      setGroupSettingsError('');
      setGroupSettingsSuccess('');
      const response = await groupsApi.update(id, {
        name: groupSettingsForm.name.trim(),
        description: groupSettingsForm.description.trim(),
        currency: groupSettingsForm.currency,
        simplify_debts: groupSettingsForm.simplify_debts
      });

      setGroup(normalizeGroupPayload(response.data));
      await fetchGroupData();
      setGroupSettingsSuccess('Group details updated');
    } catch (error) {
      setGroupSettingsError(serverErrorMessage(error, 'Failed to update group'));
    } finally {
      setSavingGroupSettings(false);
    }
  };

  const handleArchiveGroup = async () => {
    try {
      setArchivingGroup(true);
      setGroupSettingsError('');
      setGroupSettingsSuccess('');
      const response = await groupsApi.archive(id);
      setGroup(normalizeGroupPayload(response.data));
      setGroupSettingsSuccess('Group archived');
    } catch (error) {
      setGroupSettingsError(serverErrorMessage(error, 'Failed to archive group'));
    } finally {
      setArchivingGroup(false);
    }
  };

  const handleRestoreGroup = async () => {
    try {
      setRestoringGroup(true);
      setGroupSettingsError('');
      setGroupSettingsSuccess('');
      const response = await groupsApi.restore(id);
      setGroup(normalizeGroupPayload(response.data));
      setGroupSettingsSuccess('Group restored');
    } catch (error) {
      setGroupSettingsError(serverErrorMessage(error, 'Failed to restore group'));
    } finally {
      setRestoringGroup(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (deleteGroupConfirmInput !== group.name) {
      setGroupSettingsError('Type the group name exactly to delete it');
      return;
    }

    try {
      setDeletingGroup(true);
      setGroupSettingsError('');
      await groupsApi.delete(id);
      navigate('/', { replace: true });
    } catch (error) {
      setGroupSettingsError(serverErrorMessage(error, 'Failed to delete group'));
      setDeletingGroup(false);
    }
  };

  useEffect(() => {
    if (!showInviteModal) return;

    const query = memberEmailInput.trim();
    const normalizedQuery = query.toLowerCase();

    if (selectedSuggestedFriend) {
      const selectedName = (selectedSuggestedFriend.name || '').trim().toLowerCase();
      const selectedEmail = (selectedSuggestedFriend.email || '').trim().toLowerCase();

      if (normalizedQuery === selectedName || normalizedQuery === selectedEmail) {
        setFriendSuggestions([]);
        setFriendSuggestionError('');
        setLoadingFriendSuggestions(false);
        return;
      }
    }

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
  }, [showInviteModal, memberEmailInput, selectedSuggestedFriend, fetchFriendSuggestions]);

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

  const handleSelectSuggestedFriend = (friend) => {
    if (!friend?.email) return;

    setSelectedSuggestedFriend(friend);
    setMemberEmailInput(friend.name || friend.email);
    setFriendSuggestions([]);
    setAddMemberError('');
    setAddMemberSuccess('');
  };

  const openRemoveMemberConfirm = (member) => {
    setPendingRemoveMember(member);
    setRemoveMemberError('');
    setRemoveMemberSuccess('');
  };

  const closeRemoveMemberConfirm = () => {
    if (removingMemberId) return;

    setPendingRemoveMember(null);
    setRemoveMemberError('');
  };

  const handleAddMember = async (event) => {
    if (event) event.preventDefault();

    if (memberAddMode === 'phone') {
      // ── Phone mode ──────────────────────────────────────────────────────────
      const digits = memberPhoneInput.replace(/\D/g, '').slice(0, 10);
      if (!digits || digits.length !== 10) {
        setAddMemberError('Please enter a valid 10-digit phone number');
        setAddMemberSuccess('');
        return;
      }

      const isAlreadyMember = group.members.some(
        (m) => m.phone === digits || m.phone === memberPhoneInput.trim()
      );
      if (isAlreadyMember) {
        setAddMemberError('A member with this phone number is already in this group');
        setAddMemberSuccess('');
        return;
      }

      try {
        setAddingMember(true);
        setAddMemberError('');
        setAddMemberSuccess('');

        const response = await groupMembersApi.add(id, {
          phone: digits,
          name: memberGuestName.trim() || undefined
        });
        const member = response.data?.member;

        if (member?.id) {
          setGroup((prev) => {
            if (!prev) return prev;
            const exists = prev.members.some((m) => m.id === member.id);
            if (exists) return prev;
            return { ...prev, members: [...prev.members, member] };
          });
        }

        setMemberPhoneInput('');
        setMemberGuestName('');
        setAddMemberSuccess(member?.name ? `${member.name} added to the group` : 'Member added successfully');
      } catch (error) {
        const serverError = error.response?.data?.errors?.join(', ') || error.response?.data?.error;
        setAddMemberError(serverError || 'Failed to add member');
        setAddMemberSuccess('');
      } finally {
        setAddingMember(false);
      }
      return;
    }

    // ── Email mode (existing behaviour) ──────────────────────────────────────
    const normalizedEmail = (selectedSuggestedFriend?.email || memberEmailInput).trim().toLowerCase();
    if (!normalizedEmail) {
      setAddMemberError('Type a name and select a user, or enter an email address');
      setAddMemberSuccess('');
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setAddMemberError('Select a user from suggestions or enter a valid email address');
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

      const response = await groupMembersApi.add(id, {
        email: normalizedEmail,
        name: memberGuestName.trim() || undefined
      });
      const member = response.data?.member;

      if (member?.id) {
        setGroup((prevGroup) => {
          if (!prevGroup) return prevGroup;
          const alreadyExists = prevGroup.members.some((m) => m.id === member.id);
          if (alreadyExists) return prevGroup;
          return { ...prevGroup, members: [...prevGroup.members, member] };
        });
      }

      setMemberEmailInput('');
      setMemberGuestName('');
      setSelectedSuggestedFriend(null);
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

  const handleRemoveMember = async () => {
    if (!pendingRemoveMember?.id) return;

    try {
      setRemovingMemberId(pendingRemoveMember.id);
      setRemoveMemberError('');
      setRemoveMemberSuccess('');

      await groupMembersApi.remove(id, pendingRemoveMember.id);

      const removedMemberName = pendingRemoveMember.name;
      const nextMembers = (group?.members || []).filter((member) => member.id !== pendingRemoveMember.id);
      setGroup((prevGroup) => {
        if (!prevGroup) return prevGroup;

        return {
          ...prevGroup,
          members: nextMembers
        };
      });
      setExpenseForm(buildDefaultExpenseForm(nextMembers, user.id));
      setEditExpenseForm((prevForm) => ({
        ...prevForm,
        splits: prevForm.splits.filter((split) => split.user_id !== pendingRemoveMember.id),
        paid_by_id: prevForm.paid_by_id === pendingRemoveMember.id ? user.id : prevForm.paid_by_id
      }));

      setPendingRemoveMember(null);
      setRemoveMemberSuccess(`${removedMemberName || 'Member'} removed from the group`);
    } catch (error) {
      setRemoveMemberError(serverErrorMessage(error, 'Failed to remove member'));
      setRemoveMemberSuccess('');
    } finally {
      setRemovingMemberId(null);
    }
  };

  const openEditExpenseModal = (expense) => {
    const totalAmount = parseFloat(expense.amount || 0);
    const uiSplitType = expense.split_type === 'exact' ? 'amount' : expense.split_type;
    const splitsByUserId = new Map(
      expense.expense_splits.map((split) => [split.user.id, split])
    );

    const formSplits = orderMembersWithUserLast(group.members, user.id).map((member) => {
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
    setEditReceiptFile(null);
    setEditExpenseForm({
      description: expense.description || '',
      amount: parseFloat(expense.amount || 0).toFixed(2),
      date: expense.date || new Date().toISOString().split('T')[0],
      split_type: uiSplitType || 'equal',
      paid_by_id: expense.paid_by?.id || user.id,
      splits: formSplits,
      receipt_url: expense.receipt_url || null
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

      const autoSplit = findRemainderSplit(includedSplits, editedUserId);
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

      const expenseData = {
        description: editExpenseForm.description,
        amount: editExpenseForm.amount,
        date: editExpenseForm.date,
        currency: group.currency,
        paid_by_id: editExpenseForm.paid_by_id,
        split_type: editExpenseForm.split_type,
        splits: splitsPayload
      };

      if (editReceiptFile) {
        const formData = new FormData();
        Object.entries(expenseData).forEach(([key, value]) => {
          if (key === 'splits') {
            value.forEach((split) => {
              Object.entries(split).forEach(([sk, sv]) => {
                formData.append(`expense[splits][][${sk}]`, sv);
              });
            });
          } else {
            formData.append(`expense[${key}]`, value);
          }
        });
        formData.append('expense[receipt]', editReceiptFile);
        await api.patch(`/groups/${id}/expenses/${editingExpenseId}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        await api.patch(`/groups/${id}/expenses/${editingExpenseId}`, { expense: expenseData });
      }

      setShowEditExpense(false);
      setEditingExpenseId(null);
      setEditReceiptFile(null);
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

  const openSettleForGuestModal = (guestBalanceEntry) => {
    if (isArchived) return;

    // Use backend's suggested settlement for this guest
    const guestSuggested = guestSettlementSuggestions.filter(s => s.from.id === guestBalanceEntry.user.id);
    const first = guestSuggested[0];

    setSettleError('');
    setUpiPaymentFired(false);
    setSettleForm({
      from_user_id: guestBalanceEntry.user.id,
      to_user_id: first?.to.id || '',
      amount: first ? first.amount.toFixed(2) : '',
      date: new Date().toISOString().split('T')[0],
      note: ''
    });
    setShowSettleModal(true);
  };

  const renderBalanceCard = (balanceData) => {
    const isCurrentUser = balanceData.user.id === user.id;
    const isGuest = balanceData.user.is_guest;
    const netBalance = parseFloat(balanceData.balance || 0);
    const currencySym = group?.currency === 'INR' ? '₹' : (group?.currency === 'USD' ? '$' : '€');
    const outgoingSuggestions = (isGuest ? guestSettlementSuggestions : suggestedSettlements)
      .filter((settlement) => settlement.from.id === balanceData.user.id);
    const incomingSuggestions = suggestedSettlements
      .filter((settlement) => settlement.to.id === balanceData.user.id);
    const outgoingTotal = outgoingSuggestions.reduce((sum, settlement) => sum + settlement.amount, 0);
    const incomingTotal = incomingSuggestions.reduce((sum, settlement) => sum + settlement.amount, 0);
    const transferCount = outgoingSuggestions.length + incomingSuggestions.length;
    const canShowBreakdown = !group.simplify_debts && transferCount > 0;
    const isBreakdownOpen = expandedBalanceId === balanceData.user.id;

    let statusClass = 'text-secondary';
    let statusText = 'Settled up';

    if (netBalance > 0.01) {
      statusClass = 'text-success';
      statusText = isCurrentUser
        ? `You are owed ${currencySym}${netBalance.toFixed(2)} overall`
        : `Gets back ${currencySym}${netBalance.toFixed(2)} overall`;
    } else if (netBalance < -0.01) {
      statusClass = 'text-danger';
      statusText = isCurrentUser
        ? `You owe ${currencySym}${Math.abs(netBalance).toFixed(2)} overall`
        : `Owes ${currencySym}${Math.abs(netBalance).toFixed(2)} overall`;
    }

    return (
      <div
        key={balanceData.user.id}
        className={`glass-panel balance-card ${isBreakdownOpen ? 'expanded' : ''}`}
      >
        <div className="balance-card-main">
          <div className="balance-card-person">
            <div className="balance-card-avatar">{balanceData.user.name.charAt(0)}</div>
            <div className="balance-card-copy">
              <div className="balance-card-name">
                {isCurrentUser ? 'You' : balanceData.user.name}
                {isGuest && <span className="guest-badge">Guest</span>}
              </div>
              <div className={`balance-card-net ${statusClass}`}>{statusText}</div>
              {canShowBreakdown && (
                <button
                  type="button"
                  className="balance-breakdown-toggle"
                  aria-expanded={isBreakdownOpen}
                  aria-controls={`balance-breakdown-${balanceData.user.id}`}
                  onClick={() => setExpandedBalanceId((currentId) => (
                    currentId === balanceData.user.id ? null : balanceData.user.id
                  ))}
                >
                  <span>{isBreakdownOpen ? 'Hide breakdown' : `View ${transferCount} direct ${transferCount === 1 ? 'balance' : 'balances'}`}</span>
                  <ChevronDown size={14} className={isBreakdownOpen ? 'open' : ''} />
                </button>
              )}
            </div>
          </div>

          <div className="balance-card-actions">
            {outgoingTotal > 0.01 && isCurrentUser && group?.status !== 'archived' && !group?.archived_at && (
              <button
                className="btn btn-secondary balance-settle-btn"
                onClick={openSettleModal}
                title={group.simplify_debts ? 'Settle simplified balance' : 'Settle direct payments'}
              >
                Settle
              </button>
            )}
            {outgoingTotal > 0.01 && !isCurrentUser && isGuest && isAdmin && !isArchived && (
              <button
                className="btn btn-secondary guest-settle-btn balance-settle-btn"
                onClick={() => openSettleForGuestModal(balanceData)}
                title={`Settle on behalf of ${balanceData.user.name}`}
              >
                Settle for them
              </button>
            )}
          </div>
        </div>

        {canShowBreakdown && isBreakdownOpen && (
          <div
            id={`balance-breakdown-${balanceData.user.id}`}
            className="balance-breakdown"
          >
            {outgoingSuggestions.length > 0 && (
              <div className="balance-breakdown-group">
                <div className="balance-breakdown-heading">
                  <span>To pay</span>
                  <strong>{currencySym}{outgoingTotal.toFixed(2)}</strong>
                </div>
                {outgoingSuggestions.map((settlement) => (
                  <div
                    key={`outgoing-${settlement.to.id}`}
                    className="balance-breakdown-row outgoing"
                  >
                    <span className="balance-breakdown-direction">→</span>
                    <span>{settlement.to.id === user.id ? 'You' : settlement.to.name}</span>
                    <strong>{currencySym}{settlement.amount.toFixed(2)}</strong>
                  </div>
                ))}
              </div>
            )}

            {incomingSuggestions.length > 0 && (
              <div className="balance-breakdown-group">
                <div className="balance-breakdown-heading">
                  <span>To receive</span>
                  <strong>{currencySym}{incomingTotal.toFixed(2)}</strong>
                </div>
                {incomingSuggestions.map((settlement) => (
                  <div
                    key={`incoming-${settlement.from.id}`}
                    className="balance-breakdown-row incoming"
                  >
                    <span className="balance-breakdown-direction">←</span>
                    <span>{settlement.from.id === user.id ? 'You' : settlement.from.name}</span>
                    <strong>{currencySym}{settlement.amount.toFixed(2)}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading) return <div className="container text-center pt-20">Loading group details...</div>;
  if (!group) return <div className="container text-center pt-20">Group not found</div>;

  const currencySym = group.currency === 'INR' ? '₹' : (group.currency === 'USD' ? '$' : '€');
  const totalGroupExpense = expenses.reduce((sum, expense) => sum + (parseFloat(expense.amount) || 0), 0);
  const isArchived = group.status === 'archived' || Boolean(group.archived_at);
  const isGroupOwner = group.created_by_id === user.id;
  const isAdmin = isGroupOwner || group.members?.find(m => m.id === user.id)?.role === 'admin';
  const canManageMembers = isGroupOwner && !isArchived;
  const canManageGroupSettings = group.can_update || group.can_restore || group.can_delete || isGroupOwner;
  const canEditGroupDetails = Boolean(group.can_update);
  const hasFinancialActivity = (group.expense_count || 0) + (group.settlement_count || 0) > 0;
  const canEditGroupCurrency = canEditGroupDetails && !hasFinancialActivity;
  const balancesSettled = Boolean(group.balances_settled);
  const canEditExpense = (expense) => !isArchived && (
    isGroupOwner ||
    expense.paid_by.id === user.id ||
    expense.created_by?.id === user.id
  );
  const canDeleteExpense = (expense) => !isArchived && (isGroupOwner || expense.paid_by.id === user.id);
  const includedEditSplits = editExpenseForm.splits.filter((split) => split.included);
  const orderedBalances = [
    ...balances.filter((balance) => balance.user.id !== user.id),
    ...balances.filter((balance) => balance.user.id === user.id)
  ];
  const orderedMembers = [
    ...group.members.filter((member) => member.id !== user.id),
    ...group.members.filter((member) => member.id === user.id)
  ];
  const expenseShareTotalsByUserId = expenses.reduce((totals, expense) => {
    (expense.expense_splits || []).forEach((split) => {
      const splitUserId = split.user?.id || split.user_id;
      if (!splitUserId) return;

      totals[splitUserId] = (totals[splitUserId] || 0) + (parseFloat(split.amount) || 0);
    });

    return totals;
  }, {});
  const expenseShares = orderedMembers.map((member) => ({
    ...member,
    share: expenseShareTotalsByUserId[member.id] || 0
  }));
  const existingMemberEmails = new Set(
    group.members.map((member) => member.email?.trim().toLowerCase()).filter(Boolean)
  );
  const payerOptions = group.members.map((member) => ({
    value: member.id,
    label: member.id === user.id ? 'You' : member.name
  }));
  const filteredFriendSuggestions = friendSuggestions.filter((person) => {
    if (!person.email) return false;
    return !existingMemberEmails.has(person.email.toLowerCase());
  });
  const currentUserSettlementSuggestions = suggestedSettlements
    .filter((settlement) => settlement.from.id === user.id);
  // Amount the current user can pay to a specific recipient, from backend's suggested list.
  const maxPayableToUser = (recipientId) => {
    const s = suggestedSettlements.find(
      s => s.from.id === user.id && s.to.id === recipientId
    );
    return s ? s.amount : 0;
  };

  // Amount a guest can pay to a specific recipient, from backend's suggested list.
  const maxGuestPayableToUser = (guestId, recipientId) => {
    const s = guestSettlementSuggestions.find(
      s => s.from.id === guestId && s.to.id === recipientId
    );
    return s ? s.amount : 0;
  };

  const openSettleModal = () => {
    if (isArchived) return;
    // Use the backend's first suggested settlement for the current user
    if (currentUserSettlementSuggestions.length === 0) return;

    const first = currentUserSettlementSuggestions[0];
    setSettleError('');
    setUpiPaymentFired(false);
    setSettleForm({
      from_user_id: null,
      to_user_id: first.to.id,
      amount: first.amount.toFixed(2),
      date: new Date().toISOString().split('T')[0],
      note: ''
    });
    setShowSettleModal(true);
  };

  const updateSettleRecipient = (recipientId) => {
    const nextMax = settleForm.from_user_id
      ? maxGuestPayableToUser(settleForm.from_user_id, recipientId)
      : maxPayableToUser(recipientId);
    setUpiPaymentFired(false);
    setSettleForm((prev) => ({
      ...prev,
      to_user_id: recipientId,
      amount: nextMax > 0 ? nextMax.toFixed(2) : ''
    }));
  };

  const buildUpiLink = (recipientUpiId, amount, note, recipientName) => {
    const params = new URLSearchParams({
      pa: recipientUpiId,
      pn: recipientName,
      am: parseFloat(amount).toFixed(2),
      cu: 'INR',
      tn: note?.trim() || `TripSplit: ${group?.name || 'settlement'}`
    });
    return `upi://pay?${params.toString()}`;
  };

  const handleOpenUpiApp = () => {
    // Find recipient from the backend's suggested settlements (has UPI ID)
    const suggestion = suggestedSettlements.find(s =>
      s.from.id === user.id && s.to.id === settleForm.to_user_id
    );
    const recipientUpiId = suggestion?.to?.upi_id;
    const recipientName = suggestion?.to?.name;
    if (!recipientUpiId) return;
    const link = buildUpiLink(
      recipientUpiId,
      settleForm.amount,
      settleForm.note,
      recipientName
    );
    window.location.href = link;
    setTimeout(() => setUpiPaymentFired(true), 1200);
  };

  const handleSettlePayment = async (e) => {
    e.preventDefault();
    const recipientId = settleForm.to_user_id;
    const fromUserId = settleForm.from_user_id || null; // null = current user
    const amount = parseFloat(settleForm.amount || 0);
    // Max comes from the backend's suggested settlement list — no frontend math needed.
    const payerIdForMax = fromUserId || user.id;
    const availableSuggestions = fromUserId ? guestSettlementSuggestions : suggestedSettlements;
    const maxSuggestion = availableSuggestions.find(
      s => s.from.id === payerIdForMax && s.to.id === recipientId
    );
    const maxAmount = maxSuggestion ? maxSuggestion.amount : 0;

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
          ...(fromUserId ? { from_user_id: fromUserId } : {}),
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

  const splitTypeOptions = [
    { value: 'equal', label: 'Equal' },
    { value: 'amount', label: 'Amount' },
    { value: 'percentage', label: 'Percentage' }
  ];
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
      <div className="group-header-row">
        <div className="group-header-main">
          <Link to="/" className="btn btn-secondary group-back-btn" aria-label="Back to groups">
            <ArrowLeft size={20} />
          </Link>
          <div className="group-header-copy">
            <div className="group-title-line">
              <h1 className="text-title group-title">{group.name}</h1>
              {isArchived && <span className="archive-status-badge"><Archive size={13} /> Archived</span>}
            </div>
            <div className="group-header-meta">
              <span>{group.members.length} members</span>
              <span>{group.currency}</span>
              <span>{currencySym}{totalGroupExpense.toFixed(2)} total</span>
            </div>
          </div>
        </div>
        <div className="group-header-actions">
          <NotificationBell />
          {canManageGroupSettings && (
            <button type="button" className="btn btn-secondary group-settings-btn" onClick={openGroupSettings} aria-label="Group settings" title="Group settings">
              <Settings size={18} />
              <span className="group-settings-label">Settings</span>
            </button>
          )}
        </div>
      </div>

      {isArchived && (
        <div className="glass-panel archived-group-banner">
          <Archive size={20} />
          <div>
            <strong>This group is archived.</strong>
            <p className="text-secondary">Expenses, settlements, invites, and member changes are read-only until the owner restores it.</p>
          </div>
        </div>
      )}

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
              <button
                className="btn btn-primary"
                onClick={toggleAddExpensePanel}
                disabled={isArchived}
                title={isArchived ? 'Restore this group before adding expenses' : 'Add expense'}
              >
                <Plus size={18} /> Add Expense
              </button>
            </div>
          </div>

          {showAddExpense && (
            <div className="glass-panel animate-fade-in">
              <h3 style={{ marginBottom: '1rem' }}>Add New Expense</h3>
              <form onSubmit={handleAddExpense} className="flex flex-col expense-form-panel">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Description</label>
                  <input
                    required
                    placeholder="e.g. Dinner at Cafe"
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm((prev) => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                <div className="form-group expense-paid-by-field" style={{ marginBottom: 0 }}>
                  <label>Who paid?</label>
                  <CustomSelect
                    value={expenseForm.paid_by_id || user.id}
                    options={payerOptions}
                    onChange={(nextValue) => setExpenseForm((prev) => ({ ...prev, paid_by_id: nextValue }))}
                  />
                </div>
                <div className="expense-form-fields-row expense-form-details-row">
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

                <div className="expense-splits-section">
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

                <div className="receipt-upload-section">
                  <input
                    ref={receiptInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setReceiptFile(file);
                      e.target.value = '';
                    }}
                  />
                  {receiptFile ? (
                    <div className="receipt-preview">
                      <img
                        src={URL.createObjectURL(receiptFile)}
                        alt="Receipt preview"
                        className="receipt-preview-img"
                        onClick={() => setReceiptLightbox(URL.createObjectURL(receiptFile))}
                      />
                      <div className="receipt-preview-info">
                        <span className="receipt-preview-name">{receiptFile.name}</span>
                        <button
                          type="button"
                          className="receipt-remove-btn"
                          onClick={() => setReceiptFile(null)}
                        >
                          <X size={14} /> Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary receipt-upload-btn"
                      onClick={() => receiptInputRef.current?.click()}
                    >
                      <Camera size={16} /> Attach Receipt
                    </button>
                  )}
                </div>

                <div className="flex gap-3" style={{ marginTop: '0.5rem' }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    disabled={creatingExpense}
                  >
                    {creatingExpense ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowAddExpense(false);
                      setAddExpenseError('');
                      setReceiptFile(null);
                    }}
                    disabled={creatingExpense}
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
                      <div className="expense-subtitle expense-date-meta">
                        {formatExpenseDateLabel(expense.date)}
                        {expense.created_by && (
                          <>
                            <span aria-hidden="true">•</span>
                            Added by {expense.created_by.id === user.id ? 'You' : expense.created_by.name}
                          </>
                        )}
                      </div>
                      {expense.receipt_url && (
                        <button
                          type="button"
                          className="expense-receipt-badge"
                          onClick={() => setReceiptLightbox(expense.receipt_url)}
                          title="View receipt"
                        >
                          <Image size={13} /> Receipt
                        </button>
                      )}
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

            <div className="expense-shares-panel">
              <div className="expense-shares-header">
                <h3>Expense shares</h3>
                <span>Based on all splits</span>
              </div>
              <div className="expense-share-list">
                {expenseShares.map((member) => (
                  <div key={member.id} className="expense-share-row">
                    <div className="expense-share-person">
                      <div className="expense-share-avatar">{member.name.charAt(0)}</div>
                      <span>{member.id === user.id ? 'You' : member.name}</span>
                    </div>
                    <strong>{currencySym}{member.share.toFixed(2)}</strong>
                  </div>
                ))}
              </div>
            </div>

            {/* Settlement History */}
            <div className="settlement-history-panel">
              <button
                type="button"
                className="settlement-history-toggle"
                onClick={() => setShowSettlementHistory(prev => !prev)}
              >
                <div className="settlement-history-toggle-left">
                  <h3>Settlement History</h3>
                  {settlements.length > 0 && (
                    <span className="settlement-history-count">{settlements.length}</span>
                  )}
                </div>
                <ChevronDown
                  size={16}
                  className={`settlement-history-chevron ${showSettlementHistory ? 'open' : ''}`}
                />
              </button>

              {showSettlementHistory && (
                <div className="settlement-history-list animate-fade-in">
                  {settlements.length === 0 ? (
                    <div className="settlement-history-empty">No settlements recorded yet</div>
                  ) : (
                    settlements.map(s => (
                      <div key={s.id} className="settlement-history-row">
                        <div className="settlement-history-info">
                          <div className="settlement-history-who">
                            <span className="settlement-history-from">
                              {s.from_user.id === user.id ? 'You' : s.from_user.name}
                            </span>
                            <span className="settlement-history-arrow">→</span>
                            <span className="settlement-history-to">
                              {s.to_user.id === user.id ? 'You' : s.to_user.name}
                            </span>
                          </div>
                          <div className="settlement-history-meta">
                            <span className="settlement-history-amount">
                              {currencySym}{parseFloat(s.amount).toFixed(2)}
                            </span>
                            <span className="settlement-history-dot">•</span>
                            <span className="settlement-history-date">
                              {formatExpenseDateLabel(s.date)}
                            </span>
                          </div>
                          {s.note && (
                            <div className="settlement-history-note">"{s.note}"</div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className={`group-section ${mobileSection === 'members' ? 'active' : ''}`}>
            <h2 className="text-xl font-bold flex justify-between items-center" style={{ marginBottom: '1rem' }}>
              Members ({group.members.length})
              <button
                className="btn btn-secondary"
                onClick={openInviteModal}
                disabled={!canManageMembers}
                title={canManageMembers ? 'Invite member via link' : 'Only the group owner can invite members'}
                style={{ padding: '0.4rem 0.6rem', border: 'none', background: 'transparent', color: 'var(--primary-color)', opacity: canManageMembers ? 1 : 0.4, cursor: canManageMembers ? 'pointer' : 'not-allowed' }}
              >
                <UserPlus size={18} />
              </button>
            </h2>
            <div className="glass-panel group-members-card">
              {removeMemberSuccess && <div className="settings-success-text" style={{ margin: 0 }}>{removeMemberSuccess}</div>}
              {removeMemberError && !pendingRemoveMember && (
                <div className="error-text" style={{ margin: 0 }}>{removeMemberError}</div>
              )}
              {orderedMembers.map(member => (
                <div key={member.id} className="group-member-row">
                  <div className="group-member-person">
                    <div className="group-member-avatar">{member.name.charAt(0)}</div>
                    <span>{member.id === user.id ? 'You' : member.name}</span>
                    {member.is_guest && <span className="guest-badge">Guest</span>}
                  </div>
                  {member.can_remove && (
                    <button
                      type="button"
                      className="btn btn-danger group-member-remove-btn"
                      onClick={() => openRemoveMemberConfirm(member)}
                      title={`Remove ${member.name} from group`}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
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
            <form onSubmit={handleUpdateExpense} className="flex flex-col expense-form-panel">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Description</label>
                <input
                  required
                  value={editExpenseForm.description}
                  onChange={(e) => setEditExpenseForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div className="form-group expense-paid-by-field" style={{ marginBottom: 0 }}>
                <label>Who paid?</label>
                <CustomSelect
                  value={editExpenseForm.paid_by_id || user.id}
                  options={payerOptions}
                  onChange={(nextValue) => setEditExpenseForm((prev) => ({ ...prev, paid_by_id: nextValue }))}
                />
              </div>

              <div className="expense-form-fields-row expense-form-details-row">
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

              <div className="expense-splits-section">
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

              <div className="receipt-upload-section">
                <input
                  ref={editReceiptInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setEditReceiptFile(file);
                    e.target.value = '';
                  }}
                />
                {editReceiptFile ? (
                  <div className="receipt-preview">
                    <img
                      src={URL.createObjectURL(editReceiptFile)}
                      alt="Receipt preview"
                      className="receipt-preview-img"
                      onClick={() => setReceiptLightbox(URL.createObjectURL(editReceiptFile))}
                    />
                    <div className="receipt-preview-info">
                      <span className="receipt-preview-name">{editReceiptFile.name}</span>
                      <button
                        type="button"
                        className="receipt-remove-btn"
                        onClick={() => setEditReceiptFile(null)}
                      >
                        <X size={14} /> Remove
                      </button>
                    </div>
                  </div>
                ) : editExpenseForm.receipt_url ? (
                  <div className="receipt-preview">
                    <img
                      src={editExpenseForm.receipt_url}
                      alt="Current receipt"
                      className="receipt-preview-img"
                      onClick={() => setReceiptLightbox(editExpenseForm.receipt_url)}
                    />
                    <div className="receipt-preview-info">
                      <span className="receipt-preview-name">Current receipt</span>
                      <button
                        type="button"
                        className="receipt-remove-btn"
                        onClick={async () => {
                          try {
                            await api.delete(`/groups/${id}/expenses/${editingExpenseId}/remove_receipt`);
                            setEditExpenseForm((prev) => ({ ...prev, receipt_url: null }));
                            fetchGroupData();
                          } catch {
                            setEditExpenseError('Failed to remove receipt');
                          }
                        }}
                      >
                        <X size={14} /> Remove receipt
                      </button>
                      <button
                        type="button"
                        className="receipt-replace-btn"
                        onClick={() => editReceiptInputRef.current?.click()}
                      >
                        <Camera size={14} /> Replace
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary receipt-upload-btn"
                    onClick={() => editReceiptInputRef.current?.click()}
                  >
                    <Camera size={16} /> Attach Receipt
                  </button>
                )}
              </div>

              <div className="flex gap-3" style={{ marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={savingExpense}>
                  {savingExpense ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowEditExpense(false);
                    setEditReceiptFile(null);
                  }}
                  disabled={savingExpense}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showGroupSettings && (
        <div className="modal-overlay" onClick={handleGroupSettingsBackdropClick}>
          <div className="glass-panel animate-fade-in modal-card group-settings-modal">
            <div className="group-settings-modal-header">
              <div>
                <h3>Group Settings</h3>
                <p className="text-secondary">Manage group details and lifecycle.</p>
              </div>
              {isArchived && <span className="archive-status-badge"><Archive size={13} /> Archived</span>}
            </div>

            <form onSubmit={handleUpdateGroup} className="flex flex-col gap-3">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Name</label>
                <input
                  required
                  value={groupSettingsForm.name}
                  onChange={(e) => setGroupSettingsForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={!canEditGroupDetails || savingGroupSettings}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>
                  Description <span className="field-optional">Optional</span>
                </label>
                <textarea
                  rows={3}
                  value={groupSettingsForm.description}
                  onChange={(e) => setGroupSettingsForm((prev) => ({ ...prev, description: e.target.value }))}
                  disabled={!canEditGroupDetails || savingGroupSettings}
                  placeholder="Optional note about this trip or group"
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Currency</label>
                <CustomSelect
                  value={groupSettingsForm.currency}
                  options={currencyOptions}
                  onChange={(nextValue) => setGroupSettingsForm((prev) => ({ ...prev, currency: nextValue }))}
                  disabled={!canEditGroupCurrency || savingGroupSettings}
                />
                {hasFinancialActivity && (
                  <p className="settings-help-text">
                    Currency is locked because this group already has expenses or settlements.
                  </p>
                )}
              </div>

              <fieldset
                className="settlement-mode-setting"
                aria-labelledby="settlement-mode-heading"
                disabled={!canEditGroupDetails || savingGroupSettings || group.settlement_mode_locked}
              >
                <div className="settlement-mode-heading">
                  <div>
                    <h4 id="settlement-mode-heading">Settlement method</h4>
                    <p>Choose how this group decides who pays whom.</p>
                  </div>
                  {group.settlement_mode_locked && (
                    <span className="settlement-mode-state locked">Locked</span>
                  )}
                </div>

                <div className="settlement-mode-options">
                  <label className={`settlement-mode-option ${!groupSettingsForm.simplify_debts ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="settlement_mode"
                      value="pairwise"
                      checked={!groupSettingsForm.simplify_debts}
                      onChange={() => setGroupSettingsForm((prev) => ({ ...prev, simplify_debts: false }))}
                    />
                    <span className="settlement-mode-radio" aria-hidden="true" />
                    <span className="settlement-mode-copy">
                      <strong>Direct payments</strong>
                      <span>Each person repays the member who originally covered their expense.</span>
                      <small>Recommended when the group includes guests.</small>
                    </span>
                    {!groupSettingsForm.simplify_debts && (
                      <span className="settlement-mode-selected">✓ Selected</span>
                    )}
                  </label>

                  <label className={`settlement-mode-option ${groupSettingsForm.simplify_debts ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="settlement_mode"
                      value="simplified"
                      checked={groupSettingsForm.simplify_debts}
                      onChange={() => setGroupSettingsForm((prev) => ({ ...prev, simplify_debts: true }))}
                    />
                    <span className="settlement-mode-radio" aria-hidden="true" />
                    <span className="settlement-mode-copy">
                      <strong>Simplify debts</strong>
                      <span>Reduces transfers by routing payments using everyone’s net balance.</span>
                      <small>The recipient may differ from the person who paid the expense.</small>
                    </span>
                    {groupSettingsForm.simplify_debts && (
                      <span className="settlement-mode-selected">✓ Selected</span>
                    )}
                  </label>
                </div>

                {group.settlement_mode_locked && (
                  <div className="settlement-mode-lock-note">
                    <span aria-hidden="true">🔒</span>
                    This method is locked because the group already has a recorded settlement.
                  </div>
                )}
              </fieldset>

              {canEditGroupDetails && (
                <button type="submit" className="btn btn-primary" disabled={savingGroupSettings}>
                  {savingGroupSettings ? 'Saving...' : 'Save Changes'}
                </button>
              )}
            </form>

            <div className="settings-divider" />

            <div className="settings-lifecycle-section">
              <h4>Archive</h4>
              <p className="text-secondary">
                Archived groups stay visible in the dashboard and become read-only until restored.
              </p>
              {!balancesSettled && (
                <div className="settings-warning">
                  Settle all balances before archiving or deleting this group.
                </div>
              )}

              {isArchived ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleRestoreGroup}
                  disabled={!group.can_restore || restoringGroup}
                >
                  <RotateCcw size={16} /> {restoringGroup ? 'Restoring...' : 'Restore Group'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleArchiveGroup}
                  disabled={!group.can_archive || archivingGroup}
                  title={group.can_archive ? 'Archive group' : 'Only the owner can archive after balances are settled'}
                >
                  <Archive size={16} /> {archivingGroup ? 'Archiving...' : 'Archive Group'}
                </button>
              )}
            </div>

            {isGroupOwner && (
              <>
                <div className="settings-divider" />

                <div className="settings-danger-section">
                  <h4>Delete Permanently</h4>
                  <p>
                    This removes the group, members, invites, expenses, and settlements. It cannot be undone.
                  </p>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Type "{group.name}" to confirm</label>
                    <input
                      value={deleteGroupConfirmInput}
                      onChange={(e) => setDeleteGroupConfirmInput(e.target.value)}
                      disabled={!group.can_delete || deletingGroup}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={handleDeleteGroup}
                    disabled={!group.can_delete || deleteGroupConfirmInput !== group.name || deletingGroup}
                  >
                    <Trash2 size={16} /> {deletingGroup ? 'Deleting...' : 'Delete Group'}
                  </button>
                </div>
              </>
            )}

            {groupSettingsError && <div className="error-text" style={{ marginTop: '0.9rem' }}>{groupSettingsError}</div>}
            {groupSettingsSuccess && <div className="settings-success-text">{groupSettingsSuccess}</div>}

            <div className="flex gap-3" style={{ marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={closeGroupSettings} disabled={savingGroupSettings || archivingGroup || restoringGroup || deletingGroup}>
                Close
              </button>
            </div>
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

              {/* Mode toggle */}
              <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.8rem' }}>
                {['email', 'phone'].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setMemberAddMode(mode);
                      setAddMemberError('');
                      setAddMemberSuccess('');
                      setMemberGuestName('');
                    }}
                    style={{
                      padding: '0.32rem 0.9rem',
                      borderRadius: '8px',
                      border: '1px solid',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.42rem',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.18s ease',
                      borderColor: memberAddMode === mode ? 'var(--primary-color)' : 'var(--surface-border)',
                      background: memberAddMode === mode
                        ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(79,70,229,0.92))'
                        : 'rgba(255,255,255,0.04)',
                      color: memberAddMode === mode ? '#fff' : 'var(--text-secondary)'
                    }}
                    disabled={addingMember}
                  >
                    {mode === 'email' ? <Mail size={16} strokeWidth={2} /> : <Phone size={16} strokeWidth={2} />}
                    <span>{mode === 'email' ? 'Email' : 'Phone'}</span>
                  </button>
                ))}
              </div>

              <form
                onSubmit={handleAddMember}
                autoComplete="off"
                data-lpignore="true"
                data-form-type="other"
                className="flex gap-2 items-center"
                style={{ flexWrap: 'wrap' }}
              >
                {memberAddMode === 'email' ? (
                  <input
                    type="search"
                    name="friend_lookup_query"
                    value={memberEmailInput}
                    onChange={(e) => {
                      setMemberEmailInput(e.target.value);
                      setSelectedSuggestedFriend(null);
                      setAddMemberError('');
                    }}
                    placeholder="Email or name to search"
                    autoComplete="new-password"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    inputMode="email"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    data-form-type="other"
                    style={{
                      flex: 1,
                      minWidth: '200px',
                      background: 'rgba(15, 23, 42, 0.4)',
                      border: '1px solid var(--surface-border)',
                      borderRadius: '10px',
                      padding: '0.62rem 0.78rem',
                      color: 'var(--text-primary)'
                    }}
                    disabled={addingMember}
                  />
                ) : (
                  <input
                    type="tel"
                    name="guest_phone"
                    inputMode="numeric"
                    pattern="\d{10}"
                    maxLength={10}
                    value={memberPhoneInput}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setMemberPhoneInput(v);
                      setAddMemberError('');
                    }}
                    placeholder="10-digit phone number"
                    autoComplete="off"
                    data-lpignore="true"
                    style={{
                      flex: 1,
                      minWidth: '200px',
                      background: 'rgba(15, 23, 42, 0.4)',
                      border: '1px solid var(--surface-border)',
                      borderRadius: '10px',
                      padding: '0.62rem 0.78rem',
                      color: 'var(--text-primary)'
                    }}
                    disabled={addingMember}
                  />
                )}
                <input
                  type="text"
                  name="guest_display_name"
                  value={memberGuestName}
                  onChange={(e) => setMemberGuestName(e.target.value)}
                  placeholder={memberAddMode === 'phone' ? 'Display name (required)' : 'Display name (required for new users)'}
                  autoComplete="off"
                  data-lpignore="true"
                  style={{
                    flex: 1,
                    minWidth: '180px',
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
              <p style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {memberAddMode === 'phone'
                  ? 'Add a guest by their mobile number. If they sign up later with the same number, their account merges automatically.'
                  : 'If the email has no TripSplit account, they\'ll be added as a guest (display name required).'}
              </p>


              {selectedSuggestedFriend && (
                <div style={{ marginTop: '0.55rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Selected: <span style={{ color: 'var(--text-primary)' }}>{selectedSuggestedFriend.name || selectedSuggestedFriend.email}</span>
                  <span style={{ marginLeft: '0.35rem' }}>({selectedSuggestedFriend.email})</span>
                </div>
              )}

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
                        onClick={() => handleSelectSuggestedFriend(person)}
                        disabled={addingMember}
                        title={person.email}
                      >
                        {person.name ? `${person.name} (${person.email})` : person.email}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                memberEmailInput.trim() && !selectedSuggestedFriend && (
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

      {pendingRemoveMember && (
        <div className="modal-overlay">
          <div className="glass-panel animate-fade-in modal-card" style={{ width: '100%', maxWidth: 460 }}>
            <h3 style={{ marginBottom: '0.8rem' }}>Remove Member</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.35rem' }}>
              Remove <strong style={{ color: 'var(--text-primary)' }}>{pendingRemoveMember.name}</strong> from this group?
            </p>
            <p style={{ color: 'var(--danger-color)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              This only removes group access. Members with expenses or settlements cannot be removed.
            </p>

            {removeMemberError && <div className="error-text" style={{ margin: 0 }}>{removeMemberError}</div>}

            <div className="flex gap-3" style={{ marginTop: '0.8rem' }}>
              <button
                type="button"
                className="btn btn-danger"
                style={{ flex: 1 }}
                onClick={handleRemoveMember}
                disabled={removingMemberId === pendingRemoveMember.id}
              >
                {removingMemberId === pendingRemoveMember.id ? 'Removing...' : 'Remove Member'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeRemoveMemberConfirm}
                disabled={Boolean(removingMemberId)}
              >
                Cancel
              </button>
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

      {showSettleModal && (() => {
        const isProxySettle = !!settleForm.from_user_id;
        const guestName = isProxySettle
          ? group.members?.find(m => m.id === settleForm.from_user_id)?.name
          : null;

        // Derive recipient candidates from the backend's suggested settlement list.
        // Proxy: payments where guest is the payer. Normal: payments where current user is the payer.
        const payerId = isProxySettle ? settleForm.from_user_id : user.id;
        const availableSuggestions = isProxySettle ? guestSettlementSuggestions : suggestedSettlements;
        const relevantSuggestions = availableSuggestions.filter(s => s.from.id === payerId);
        const outstandingPaymentTotal = relevantSuggestions
          .reduce((sum, settlement) => sum + settlement.amount, 0);

        // Build a map: recipientId → suggested amount (from backend)
        const suggestedAmountMap = new Map(relevantSuggestions.map(s => [s.to.id, s.amount]));

        // Cross-reference with balances for UPI ID + name lookup
        const activeRecipientCandidates = relevantSuggestions.map(s => {
          const balEntry = balances.find(b => b.user.id === s.to.id);
          return balEntry ?? { user: s.to, balance: 0 };
        });

        const activeRecipientOptions = activeRecipientCandidates.map(entry => {
          const name = entry.user.id === user.id ? 'You' : entry.user.name;
          const suggestedAmt = suggestedAmountMap.get(entry.user.id) ?? 0;
          if (isProxySettle) {
            return { value: entry.user.id, label: `${name} (${currencySym}${suggestedAmt.toFixed(2)})` };
          }
          return { value: entry.user.id, label: `${name} (${currencySym}${suggestedAmt.toFixed(2)})` };
        });

        // Max for the chosen recipient comes directly from the backend suggestion.
        const activeSettleRecipientMaxAmount = suggestedAmountMap.get(settleForm.to_user_id) ?? 0;

        const settleRecipient = activeRecipientCandidates.find((e) => e.user.id === settleForm.to_user_id);
        const recipientUpiId = settleRecipient?.user?.upi_id || null;
        const isInr = group.currency === 'INR';
        const canUseUpi = !isProxySettle && isInr && !!recipientUpiId;
        const amountNum = parseFloat(settleForm.amount || 0);
        const amountValid = amountNum > 0 && amountNum <= activeSettleRecipientMaxAmount + 0.001;

        return (
          <div className="modal-overlay">
            <div className="settle-modal-card glass-panel animate-fade-in modal-card">

              {/* ── Header ── */}
              <div className="settle-modal-header">
                <div>
                  {settleForm.from_user_id ? (
                    <>
                      <h3 className="settle-modal-title">Settle for Guest</h3>
                      <p className="settle-modal-subtitle">
                        <strong>{guestName}</strong> has {currencySym}{outstandingPaymentTotal.toFixed(2)} remaining to pay — choose who received the cash
                      </p>
                    </>
                  ) : (
                    <>
                      <h3 className="settle-modal-title">Settle Up</h3>
                      <p className="settle-modal-subtitle">
                        You have {currencySym}{outstandingPaymentTotal.toFixed(2)} remaining to pay — choose who you paid.
                      </p>
                    </>
                  )}
                </div>
                <div className="settle-modal-debt-pill">
                  {isProxySettle ? (
                    <>
                      <span className="settle-modal-debt-label">{guestName} owes</span>
                      <span className="settle-modal-debt-amount">{currencySym}{outstandingPaymentTotal.toFixed(2)}</span>
                    </>
                  ) : (
                    <>
                      <span className="settle-modal-debt-label">You owe</span>
                      <span className="settle-modal-debt-amount">{currencySym}{outstandingPaymentTotal.toFixed(2)}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="settle-modal-divider" />

              <form onSubmit={handleSettlePayment} className="settle-modal-body">

                {/* Pay To */}
                <div className="form-group settle-form-group">
                  <label>Pay To</label>
                  <CustomSelect
                    value={settleForm.to_user_id}
                    options={activeRecipientOptions}
                    onChange={(nextValue) => updateSettleRecipient(nextValue)}
                    disabled={upiPaymentFired}
                  />
                </div>

                {/* Amount + Date row */}
                <div className="settle-amount-date-row">
                  <div className="form-group settle-form-group" style={{ flex: 1 }}>
                    <label>Amount <span className="settle-currency-tag">{group.currency}</span></label>
                    <input
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={settleForm.amount}
                      disabled={upiPaymentFired}
                      onChange={(e) => setSettleForm((prev) => ({ ...prev, amount: e.target.value }))}
                    />
                    <span className="settle-max-hint">
                      Max {currencySym}{activeSettleRecipientMaxAmount.toFixed(2)}
                    </span>
                  </div>
                  <div className="form-group settle-form-group" style={{ flex: 1 }}>
                    <label>Date</label>
                    <CustomDateInput
                      required
                      value={settleForm.date}
                      disabled={upiPaymentFired}
                      onChange={(nextDate) => setSettleForm((prev) => ({ ...prev, date: nextDate }))}
                    />
                  </div>
                </div>

                {/* UPI block — primary action, shown before Note */}
                {canUseUpi && !upiPaymentFired && (
                  <div className="upi-block">
                    <div className="upi-block-header">
                      <span className="upi-badge">UPI</span>
                      <span className="upi-block-title">Pay instantly via any UPI app</span>
                    </div>
                    <div className="upi-id-row">
                      <span className="upi-id-label">UPI ID</span>
                      <span className="upi-id-value">{recipientUpiId}</span>
                      <button
                        type="button"
                        className="upi-copy-btn"
                        title="Copy UPI ID"
                        onClick={() => navigator.clipboard.writeText(recipientUpiId)}
                      >
                        Copy
                      </button>
                    </div>
                    <button
                      type="button"
                      className="btn upi-pay-btn"
                      disabled={!amountValid || settlingPayment}
                      onClick={handleOpenUpiApp}
                    >
                      <span className="upi-pay-icon">⚡</span>
                      Pay {currencySym}{amountValid ? amountNum.toFixed(2) : '—'} via UPI App
                    </button>
                    <p className="upi-hint">
                      Opens GPay, PhonePe, Paytm or any UPI app pre-filled. Come back and confirm after paying.
                    </p>
                  </div>
                )}

                {/* No-UPI fallback — only for normal settle, not proxy (guest) */}
                {!isProxySettle && !canUseUpi && settleRecipient && (
                  <div className="upi-fallback-block">
                    <span style={{ fontSize: '1rem' }}>ℹ️</span>
                    <span>
                      {isInr
                        ? <>{settleRecipient.user.name} hasn't added a UPI ID. Pay via cash or bank transfer, then record it below.</>
                        : <>UPI is only supported for INR groups.</>}
                    </span>
                  </div>
                )}

                {/* Note */}
                <div className="form-group settle-form-group">
                  <label>Note <span className="field-optional">(optional)</span></label>
                  <textarea
                    rows={2}
                    value={settleForm.note}
                    disabled={upiPaymentFired}
                    onChange={(e) => setSettleForm((prev) => ({ ...prev, note: e.target.value }))}
                    placeholder="e.g. GPay ref #12345, cash handover…"
                  />
                </div>

                {/* Post-UPI confirm panel */}
                {upiPaymentFired && (
                  <div className="upi-confirm-block animate-fade-in">
                    <div className="upi-confirm-icon">✅</div>
                    <p className="upi-confirm-title">Did your UPI payment go through?</p>
                    <p className="upi-confirm-body">
                      If successful, click <strong>Confirm & Record</strong> to mark it settled.
                      If something went wrong, click <strong>Go Back</strong>.
                    </p>
                  </div>
                )}

                {settleError && <div className="error-text" style={{ margin: 0 }}>{settleError}</div>}

                {/* Actions */}
                <div className="settle-modal-actions">
                  {!upiPaymentFired ? (
                    <>
                      <button
                        type="submit"
                        className="btn btn-secondary settle-action-btn"
                        disabled={settlingPayment}
                      >
                        {settlingPayment ? 'Recording…' : canUseUpi ? 'Paid Externally' : 'Record Settlement'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost settle-action-btn"
                        onClick={() => {
                          if (settlingPayment) return;
                          setShowSettleModal(false);
                          setSettleError('');
                          setUpiPaymentFired(false);
                        }}
                        disabled={settlingPayment}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="submit"
                        className="btn btn-primary settle-action-btn"
                        disabled={settlingPayment}
                      >
                        {settlingPayment ? 'Recording…' : 'Confirm & Record'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost settle-action-btn"
                        onClick={() => {
                          setUpiPaymentFired(false);
                          setSettleError('');
                        }}
                        disabled={settlingPayment}
                      >
                        Go Back
                      </button>
                    </>
                  )}
                </div>
              </form>
            </div>
          </div>
        );
      })()}
      
      {/* Receipt lightbox modal */}
      {receiptLightbox && (
        <div
          className="receipt-lightbox-overlay"
          onClick={() => setReceiptLightbox(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setReceiptLightbox(null); }}
          tabIndex={-1}
        >
          <div className="receipt-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="receipt-lightbox-close"
              onClick={() => setReceiptLightbox(null)}
            >
              <X size={20} />
            </button>
            <img src={receiptLightbox} alt="Receipt" className="receipt-lightbox-img" />
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
