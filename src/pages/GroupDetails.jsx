import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { ArrowLeft, UserPlus, Plus, Receipt, Wallet, CheckCircle, Settings, LogOut, Trash2 } from 'lucide-react';
import NotificationBell from '../components/NotificationBell';

export default function GroupDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState('expenses'); 
  
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMsg, setInviteMsg] = useState({ text: '', type: '' });

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expensePayer, setExpensePayer] = useState(''); 
  const [splitType, setSplitType] = useState('equal'); // 'equal', 'exact', 'single'
  
  const [equalSplitMembers, setEqualSplitMembers] = useState({}); // { [userId]: boolean }
  const [singleOwer, setSingleOwer] = useState(''); // userId
  const [exactSplits, setExactSplits] = useState({}); // { [userId]: "value" }
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Settlement state
  const [showSettleUp, setShowSettleUp] = useState(false);
  const [settlePayer, setSettlePayer] = useState('');
  const [settleReceiver, setSettleReceiver] = useState('');
  const [settleAmount, setSettleAmount] = useState('');

  useEffect(() => {
    fetchGroupData();
  }, [id, user.id]);

  const fetchGroupData = async () => {
    setLoading(true);
    
    // Group
    const { data: gData } = await supabase.from('groups').select('*').eq('id', id).single();
    if (gData) setGroup(gData);

    // Members
    const { data: mData } = await supabase
      .from('group_members')
      .select('user_id, joined_at')
      .eq('group_id', id);

    let fetchedMembers = [];
    if (mData && mData.length > 0) {
      const userIds = mData.map(m => m.user_id);
      const { data: pData, error: pError } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', userIds);
      
      if (pData) {
        fetchedMembers = pData;
      } else {
        console.error("Error fetching profiles:", pError);
      }
    }
    
    setMembers(fetchedMembers);
    if (!expensePayer) setExpensePayer(user.id);
    if (!settlePayer) setSettlePayer(user.id);
    
    if (fetchedMembers.length > 0) {
      // Default single Ower to someone else
      if (!singleOwer) {
        const other = fetchedMembers.find(m => m.id !== user.id);
        if (other) setSingleOwer(other.id);
      }

      // Initialize equal split toggles so everyone is checked by default
      setEqualSplitMembers(prev => {
        const toggles = { ...prev };
        fetchedMembers.forEach(m => {
          if (toggles[m.id] === undefined) toggles[m.id] = true;
        });
        return toggles;
      });
    }

    // Expenses
    const { data: eData } = await supabase
      .from('expenses')
      .select('*, expense_splits(*)')
      .eq('group_id', id)
      .order('created_at', { ascending: false });

    if (eData) {
      setExpenses(eData);
      calculateBalances(fetchedMembers, eData);
    }
    
    setLoading(false);
  };

  const calculateBalances = (groupMembers, groupExpenses) => {
    const bals = {};
    groupMembers.forEach(m => {
      bals[m.id] = { id: m.id, name: m.full_name || m.email, net: 0, paid: 0, owed: 0 };
    });

    groupExpenses.forEach(exp => {
      if (bals[exp.paid_by]) {
        bals[exp.paid_by].paid += Number(exp.amount);
        bals[exp.paid_by].net += Number(exp.amount);
      }
      exp.expense_splits.forEach(split => {
        if (bals[split.user_id]) {
          bals[split.user_id].owed += Number(split.amount);
          bals[split.user_id].net -= Number(split.amount);
        }
      });
    });

    setBalances(Object.values(bals).sort((a,b) => b.net - a.net));
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviteMsg({ text: '', type: '' });
    
    const { data: profileData, error: profileError } = await supabase.from('profiles').select('*').eq('email', inviteEmail.trim()).single();

    if (profileError || !profileData) return setInviteMsg({ text: 'User not found. They must sign up first.', type: 'error' });
    if (members.find(m => m.id === profileData.id)) return setInviteMsg({ text: 'User is already in this group.', type: 'error' });

    const { error: addError } = await supabase.from('group_members').insert([{ group_id: id, user_id: profileData.id }]);

    if (addError) {
      setInviteMsg({ text: addError.message, type: 'error' });
    } else {
      setInviteMsg({ text: 'User added successfully!', type: 'success' });
      setInviteEmail('');
      fetchGroupData();
    }
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!expenseDesc || !expenseAmount || !expensePayer || members.length === 0) return;
    setIsSubmitting(true);

    const amountNum = parseFloat(expenseAmount);
    if (isNaN(amountNum) || amountNum <= 0) { setIsSubmitting(false); return; }

    let splitsToInsert = [];

    // Calculate splits
    if (splitType === 'equal') {
      const activeMembers = members.filter(m => equalSplitMembers[m.id] !== false);
      if (activeMembers.length === 0) {
        alert("Please select at least one person to split the expense with.");
        setIsSubmitting(false); return;
      }

      const splitAmount = (amountNum / activeMembers.length).toFixed(2);
      splitsToInsert = activeMembers.map(m => ({ user_id: m.id, amount: splitAmount }));

      const totalSplit = (splitAmount * activeMembers.length).toFixed(2);
      if (totalSplit !== amountNum.toFixed(2)) {
        const diff = amountNum - totalSplit;
        splitsToInsert[0].amount = (parseFloat(splitsToInsert[0].amount) + diff).toFixed(2);
      }
    } else if (splitType === 'single') {
      if (!singleOwer) {
        alert("Please specific who owes the full amount.");
        setIsSubmitting(false); return;
      }
      splitsToInsert = [{ user_id: singleOwer, amount: amountNum.toFixed(2) }];
    } else if (splitType === 'exact') {
      let customTotal = 0;
      const parsedSplits = [];
      
      for (const member of members) {
        const val = parseFloat(exactSplits[member.id] || "0");
        if (val > 0) {
          customTotal += val;
          parsedSplits.push({ user_id: member.id, amount: val.toFixed(2) });
        }
      }

      if (Math.abs(customTotal - amountNum) > 0.02) {
        alert(`The exact amounts entered (₹${customTotal.toFixed(2)}) must sum up precisely to the total expense (₹${amountNum.toFixed(2)}).`);
        setIsSubmitting(false);
        return;
      }

      splitsToInsert = parsedSplits;
    }

    const { data: expenseData, error: expError } = await supabase
      .from('expenses')
      .insert([{ group_id: id, paid_by: expensePayer, amount: amountNum, description: expenseDesc }])
      .select().single();

    if (expError) { setIsSubmitting(false); return; }

    // Map expense_id into splits
    splitsToInsert = splitsToInsert.map(s => ({ ...s, expense_id: expenseData.id }));

    await supabase.from('expense_splits').insert(splitsToInsert);

    // Create notifications
    const me = members.find(m => m.id === user.id);
    const myName = me?.full_name || me?.email || 'Someone';
    
    const notificationsToInsert = splitsToInsert
      .filter(s => s.user_id !== user.id) // don't notify self
      .map(s => ({
        user_id: s.user_id,
        group_id: id,
        expense_id: expenseData.id,
        message: `${myName} added an expense: "${expenseDesc}" for ₹${amountNum.toFixed(2)}.`
      }));

    if (notificationsToInsert.length > 0) {
      await supabase.from('notifications').insert(notificationsToInsert);
    }

    setShowAddExpense(false);
    setExpenseDesc('');
    setExpenseAmount('');
    setExactSplits({});
    setSplitType('equal');
    fetchGroupData();
    setIsSubmitting(false);
  };

  const handleExactSplitChange = (userId, value) => {
    setExactSplits(prev => ({ ...prev, [userId]: value }));
  };

  const handleEqualSplitToggle = (userId, isChecked) => {
    setEqualSplitMembers(prev => ({ ...prev, [userId]: isChecked }));
  };

  const handleSettleUp = async (e) => {
    e.preventDefault();
    if (!settlePayer || !settleReceiver || !settleAmount) return;
    if (settlePayer === settleReceiver) {
      alert("Payer and receiver cannot be the same person.");
      return;
    }
    setIsSubmitting(true);

    const amountNum = parseFloat(settleAmount);
    if (isNaN(amountNum) || amountNum <= 0) { setIsSubmitting(false); return; }

    const { data: expenseData, error: expError } = await supabase
      .from('expenses')
      .insert([{ group_id: id, paid_by: settlePayer, amount: amountNum, description: 'Settlement' }])
      .select().single();

    if (!expError) {
      await supabase.from('expense_splits').insert([{
        expense_id: expenseData.id,
        user_id: settleReceiver,
        amount: amountNum
      }]);
      
      const me = members.find(m => m.id === user.id);
      const myName = me?.full_name || me?.email || 'Someone';
      const payerName = members.find(m => m.id === settlePayer)?.full_name || 'Someone';
      const receiverName = members.find(m => m.id === settleReceiver)?.full_name || 'Someone';

      // Notify anyone involved who didn't click the button
      const notifs = [];
      if (settleReceiver !== user.id) {
         notifs.push({ user_id: settleReceiver, group_id: id, expense_id: expenseData.id, message: `${myName} recorded a settlement: ${payerName} paid ₹${amountNum.toFixed(2)} to ${receiverName}.` });
      }
      if (settlePayer !== user.id && settlePayer !== settleReceiver) {
         notifs.push({ user_id: settlePayer, group_id: id, expense_id: expenseData.id, message: `${myName} recorded a settlement: ${payerName} paid ₹${amountNum.toFixed(2)} to ${receiverName}.` });
      }
      if (notifs.length > 0) {
        await supabase.from('notifications').insert(notifs);
      }

      setShowSettleUp(false);
      setSettleAmount('');
      fetchGroupData();
    }
    setIsSubmitting(false);
  };

  const handleLeaveGroup = async () => {
    if (!window.confirm("Are you sure you want to leave this group?")) return;
    await supabase.from('group_members').delete().eq('group_id', id).eq('user_id', user.id);
    window.location.href = '/';
  };

  const handleDeleteGroup = async () => {
    if (!window.confirm("WARNING: Are you sure you want to PERMANENTLY delete this group and all its expenses for everyone?")) return;
    await supabase.from('groups').delete().eq('id', id);
    window.location.href = '/';
  };

  if (loading) return <div className="p-4 text-center mt-4">Loading group details...</div>;
  if (!group) return <div className="p-4 text-center text-danger mt-4">Group not found.</div>;

  return (
    <div className="p-4 animate-slide-up pb-24">
      <div className="flex items-center gap-2 mb-4">
        <Link to="/" className="btn" style={{ padding: '0.25rem' }}>
          <ArrowLeft size={20} className="text-primary" />
        </Link>
        <h1 className="m-0 flex-1 truncate">{group.name}</h1>
        <NotificationBell />
        <button 
          className="btn" 
          style={{ padding: '0.25rem' }} 
          onClick={() => setActiveTab(activeTab === 'settings' ? 'expenses' : 'settings')}
        >
          <Settings size={20} className={activeTab === 'settings' ? 'text-primary' : 'text-muted'} />
        </button>
      </div>

      <div className="tabs-container">
        <button className={`tab-btn ${activeTab === 'expenses' ? 'active' : ''}`} onClick={() => setActiveTab('expenses')}>
          Expenses
        </button>
        <button className={`tab-btn ${activeTab === 'balances' ? 'active' : ''}`} onClick={() => setActiveTab('balances')}>
          Balances
        </button>
        <button className={`tab-btn ${activeTab === 'members' ? 'active' : ''}`} onClick={() => setActiveTab('members')}>
          Members
        </button>
      </div>

      {activeTab === 'expenses' && (
        <div>
          {!showAddExpense && !showSettleUp && (
            <div className="flex justify-between items-center mb-4">
              <h3 className="m-0" style={{ fontSize: '1.1rem' }}>Latest Expenses</h3>
              <button 
                className="btn btn-primary shadow-sm" 
                style={{ padding: '0.65rem 1.25rem' }}
                onClick={() => setShowAddExpense(true)}
              >
                <Plus size={20} /> Add Expense
              </button>
            </div>
          )}

          {showAddExpense && (
            <div className="card mb-4 border-primary">
              <h3 className="mb-4 text-primary">Add Expense</h3>
              <form onSubmit={handleAddExpense}>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <input type="text" className="form-input" placeholder="Dinner, Groceries..." value={expenseDesc} onChange={e => setExpenseDesc(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Amount (₹)</label>
                  <input type="number" step="0.01" className="form-input" placeholder="0.00" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Paid By</label>
                  <select className="form-input" value={expensePayer} onChange={e => {
                    setExpensePayer(e.target.value);
                    if (singleOwer === e.target.value) {
                      const other = members.find(m => m.id !== e.target.value);
                      if (other) setSingleOwer(other.id);
                    }
                  }} style={{ appearance: 'auto' }} required>
                    {members.map(m => (
                      <option key={m.id} value={m.id}>{m.id === user.id ? 'Me' : m.full_name || m.email}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group mt-2 border-t border-slate-200 pt-4" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                  <label className="form-label">How to split?</label>
                  <div className="flex gap-2 mt-2">
                    <button 
                      type="button" 
                      className={`btn flex-1 ${splitType === 'equal' ? 'btn-primary' : 'btn-outline'}`}
                      style={{ padding: '0.4rem', fontSize: '0.8rem' }}
                      onClick={() => setSplitType('equal')}
                    >
                      Equally
                    </button>
                    <button 
                      type="button" 
                      className={`btn flex-1 ${splitType === 'single' ? 'btn-primary' : 'btn-outline'}`}
                      style={{ padding: '0.4rem', fontSize: '0.8rem' }}
                      onClick={() => setSplitType('single')}
                    >
                      Someone Owes
                    </button>
                    <button 
                      type="button" 
                      className={`btn flex-1 ${splitType === 'exact' ? 'btn-primary' : 'btn-outline'}`}
                      style={{ padding: '0.4rem', fontSize: '0.8rem' }}
                      onClick={() => setSplitType('exact')}
                    >
                      Exact Amounts
                    </button>
                  </div>
                </div>

                {splitType === 'equal' && (
                  <div className="mb-4 p-4 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)' }}>
                    <p className="text-muted mb-3" style={{ fontSize: '0.85rem' }}>Select who should be included in the split:</p>
                    <div className="flex flex-wrap gap-2">
                      {members.map(m => {
                        const isChecked = equalSplitMembers[m.id] !== false;
                        return (
                          <div
                            key={m.id}
                            onClick={() => handleEqualSplitToggle(m.id, !isChecked)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '0.5rem 1.25rem',
                              borderRadius: '2rem',
                              cursor: 'pointer',
                              fontWeight: isChecked ? 'bold' : 'normal',
                              background: isChecked ? 'var(--primary)' : 'transparent',
                              color: isChecked ? '#fff' : 'var(--text-muted)',
                              border: `1.5px solid ${isChecked ? 'var(--primary)' : 'var(--border-color)'}`,
                              transition: 'all 0.2s ease',
                              userSelect: 'none',
                              fontSize: '0.875rem',
                              boxShadow: isChecked ? '0 4px 12px rgba(16, 185, 129, 0.2)' : 'none'
                            }}
                          >
                            {m.id === user.id ? 'Me' : m.full_name || m.email}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {splitType === 'single' && (
                  <div className="form-group mb-4 p-4 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)' }}>
                    <label className="form-label" style={{ color: 'var(--primary)', marginBottom: '10px', display: 'block' }}>Who owes the full amount?</label>
                    <div style={{ position: 'relative' }}>
                      <select className="form-input" value={singleOwer} onChange={e => setSingleOwer(e.target.value)} style={{ appearance: 'auto', backgroundColor: 'var(--bg-color)', border: '1.5px solid var(--border-color)', fontSize: '1rem', padding: '0.75rem 1rem' }} required>
                         {members.filter(m => m.id !== expensePayer).map(m => (
                           <option key={m.id} value={m.id}>{m.id === user.id ? 'Me' : m.full_name || m.email}</option>
                         ))}
                      </select>
                    </div>
                    <p className="mt-3 text-muted" style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>
                      🎯 <strong style={{ color: 'var(--text-main)' }}>{singleOwer === user.id ? 'You' : members.find(m => m.id === singleOwer)?.full_name || members.find(m => m.id === singleOwer)?.email}</strong> will owe the entire <strong style={{ color: 'var(--text-main)' }}>₹{expenseAmount || '0.00'}</strong>.
                    </p>
                  </div>
                )}

                {splitType === 'exact' && (
                  <div className="mb-4 p-4 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)' }}>
                    <p className="text-muted mb-4 pb-3 border-b" style={{ fontSize: '0.85rem', borderColor: 'var(--border-color)' }}>
                      Enter exact amounts owed by each person. Must sum perfectly to <strong style={{color:'var(--text-main)'}}>₹{expenseAmount || '0.00'}</strong>.
                    </p>
                    <div className="flex flex-col gap-3">
                      {members.map(m => (
                        <div key={m.id} className="flex items-center justify-between gap-3">
                          <span className="flex-1 truncate font-semibold" style={{ fontSize: '0.9rem' }}>
                            {m.id === user.id ? 'Me' : m.full_name || m.email}
                          </span>
                          <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.9rem' }}>₹</span>
                            <input 
                              type="number" 
                              step="0.01" 
                              className="form-input" 
                              style={{ width: '120px', paddingLeft: '28px', textAlign: 'right', fontSize: '1rem', border: '1.5px solid var(--border-color)', backgroundColor: 'var(--bg-color)', transition: 'border-color 0.2s', borderRadius: '1.5rem' }} 
                              placeholder="0.00"
                              value={exactSplits[m.id] || ''}
                              onChange={(e) => handleExactSplitChange(m.id, e.target.value)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button type="button" className="btn btn-outline flex-1" onClick={() => setShowAddExpense(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary flex-1" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save'}</button>
                </div>
              </form>
            </div>
          )}

          {expenses.length === 0 ? (
            <div className="card text-center p-8 mt-4">
              <Receipt size={48} className="mx-auto text-muted mb-4" />
              <p className="text-muted">No expenses recorded yet.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {expenses.map(exp => {
                const payer = members.find(m => m.id === exp.paid_by);
                const isMe = exp.paid_by === user.id;
                const d = new Date(exp.created_at);
                const isSettlement = exp.description === 'Settlement';
                
                return (
                  <div key={exp.id} className="card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="flex items-center gap-3">
                      <div style={{ backgroundColor: isSettlement ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-color)', width: '40px', height: '40px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isSettlement ? <CheckCircle size={20} className="text-primary" /> : <Receipt size={20} className="text-muted" />}
                      </div>
                      <div>
                        <div className="font-bold">{exp.description}</div>
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                          {payer ? (isMe ? 'You paid' : `${payer.full_name} paid`) : 'Unknown paid'} • {d.toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="font-bold" style={{ fontSize: '1.25rem', color: isSettlement ? 'var(--primary)' : 'var(--text-main)' }}>
                      ₹{Number(exp.amount).toFixed(2)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

        </div>
      )}

      {activeTab === 'balances' && (
        <div>
          {/* Balances Content */}
          {showSettleUp && (
            <div className="card mb-4 border-primary">
              <h3 className="mb-4 text-primary">Settle Up</h3>
              <form onSubmit={handleSettleUp}>
                <div className="form-group">
                  <label className="form-label">Who is paying?</label>
                  <select className="form-input" value={settlePayer} onChange={e => setSettlePayer(e.target.value)} style={{ appearance: 'auto' }} required>
                    {members.map(m => <option key={m.id} value={m.id}>{m.id === user.id ? 'Me' : m.full_name || m.email}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Who is receiving?</label>
                  <select className="form-input" value={settleReceiver} onChange={e => setSettleReceiver(e.target.value)} style={{ appearance: 'auto' }} required>
                    <option value="">Select receiver...</option>
                    {members.filter(m => m.id !== settlePayer).map(m => (
                      <option key={m.id} value={m.id}>{m.id === user.id ? 'Me' : m.full_name || m.email}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Amount (₹)</label>
                  <input type="number" step="0.01" className="form-input" placeholder="0.00" value={settleAmount} onChange={e => setSettleAmount(e.target.value)} required />
                </div>
                <div className="flex gap-2 mt-4">
                  <button type="button" className="btn btn-outline flex-1" onClick={() => setShowSettleUp(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary flex-1" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Record Payment'}</button>
                </div>
              </form>
            </div>
          )}

          {!showSettleUp && (
             <div className="flex justify-end mb-4">
              <button className="btn btn-primary" style={{ padding: '0.5rem 1rem' }} onClick={() => { setShowSettleUp(true); setSettleReceiver(''); }}>
                <Wallet size={18} /> Settle Up
              </button>
            </div>
          )}

          {balances.length === 0 ? (
            <p className="text-muted text-center pt-8">No balances to calculate.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {balances.map(b => {
                const isMe = b.id === user.id;
                const net = Math.round(b.net * 100) / 100;
                
                let textClass = "font-bold ";
                let textMsg = "";
                if (net > 0) {
                  textClass += "text-primary";
                  textMsg = `gets back ₹${Math.abs(net).toFixed(2)}`;
                } else if (net < 0) {
                  textClass += "text-danger";
                  textMsg = `owes ₹${Math.abs(net).toFixed(2)}`;
                } else {
                  textClass += "text-muted";
                  textMsg = "is settled up";
                }

                return (
                  <div key={b.id} className="card flex justify-between items-center" style={{ padding: '1rem' }}>
                    <div className="flex items-center gap-3">
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--bg-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                        {(b.name || '?').substring(0,2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold">{isMe ? 'You' : b.name}</div>
                        <div style={{ fontSize: '0.875rem' }} className={textClass}>{textMsg}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'members' && (
        <div className="card" style={{ padding: '1rem' }}>
          <div className="mb-4">
            <h3 className="m-0 mb-4 flex items-center gap-2">
              <UserPlus size={18} /> Add Member
            </h3>
            <form onSubmit={handleInvite} className="flex gap-2">
              <input type="email" className="form-input flex-1" placeholder="friend@email.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required />
              <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem 1rem' }}>Add</button>
            </form>
            {inviteMsg.text && (
              <div className={`mt-2 ${inviteMsg.type === 'error' ? 'text-danger' : 'text-primary'}`} style={{ fontSize: '0.875rem' }}>
                {inviteMsg.text}
              </div>
            )}
          </div>
          
          <div className="border-t" style={{ borderTop: '1px solid var(--border-color)', margin: '1rem -1rem 0' }} />
          
          <h3 className="mt-4 mb-3">Group Members</h3>
          <div className="flex flex-col gap-2">
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-3 p-2 rounded hover:bg-slate-50 transition-colors" style={{ backgroundColor: 'var(--bg-color)' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--surface)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.75rem' }}>
                  {(m.full_name || '?').substring(0,2).toUpperCase()}
                </div>
                <div>
                  <span className="font-bold block" style={{ fontSize: '0.875rem' }}>{m.id === user.id ? 'You' : (m.full_name || 'Anonymous')}</span>
                  <span className="text-muted" style={{ fontSize: '0.75rem' }}>{m.email}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="card text-center" style={{ padding: '2rem 1rem' }}>
          <h3 className="mb-4">Group Options</h3>
          <div className="flex flex-col gap-4">
            <button className="btn btn-outline" onClick={handleLeaveGroup} style={{ color: 'var(--text-main)', borderColor: 'var(--text-muted)' }}>
              <LogOut size={18} /> Leave Group
            </button>
            <p className="text-muted" style={{ fontSize: '0.75rem' }}>Leave the group and remove your membership.</p>

            {group.created_by === user.id && (
              <>
                <div className="border-t border-slate-200 mt-4 mb-4" />
                <button className="btn btn-danger" onClick={handleDeleteGroup}>
                  <Trash2 size={18} /> Delete Group For Everyone
                </button>
                <p className="text-danger" style={{ fontSize: '0.75rem', opacity: 0.8 }}>This action is Permanent and will delete all expenses inside the group!</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
