import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { Link } from 'react-router-dom';
import { Users, Plus } from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    setLoading(true);
    // groups table is protected by RLS, so it automatically returns only groups the user is member of.
    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (data) setGroups(data);
    setLoading(false);
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    // 1. Create Group with a client-generated UUID
    // This avoids RLS errors where Supabase tries to return the created row via `.select()` 
    // before the user is actually added to `group_members`.
    const newGroupId = crypto.randomUUID();
    const { error: groupError } = await supabase
      .from('groups')
      .insert([{ id: newGroupId, name: newGroupName, created_by: user.id }]);

    if (groupError) {
      console.error(groupError);
      return;
    }

    // 2. Add current user as member
    const { error: memberError } = await supabase
      .from('group_members')
      .insert([{ group_id: newGroupId, user_id: user.id }]);

    if (memberError) {
      console.error(memberError);
    } else {
      setNewGroupName('');
      setShowCreate(false);
      fetchGroups();
    }
  };

  return (
    <div className="p-4 animate-slide-up">
      <div className="flex justify-between items-center mb-4">
        <h1 className="m-0 text-primary">My Groups</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)} style={{ padding: '0.5rem 1rem' }}>
          <Plus size={18} />
          New
        </button>
      </div>

      {showCreate && (
        <div className="card mb-4">
          <h3>Create a New Group</h3>
          <form onSubmit={handleCreateGroup} className="flex gap-2 mt-4">
            <input
              type="text"
              className="form-input flex-1"
              placeholder="e.g. Trip to Hawaii"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-primary">Create</button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center p-4">Loading groups...</div>
      ) : groups.length === 0 ? (
        <div className="text-center p-4 card">
          <Users size={48} className="mx-auto text-muted mb-4" />
          <p>You don't have any groups yet.</p>
          <button className="btn btn-outline mt-4" onClick={() => setShowCreate(true)}>Create your first group</button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <Link to={`/group/${group.id}`} key={group.id} style={{ textDecoration: 'none' }}>
              <div className="card flex items-center justify-between" style={{ padding: '1rem 1.5rem' }}>
                <div className="flex items-center gap-4">
                  <div style={{ backgroundColor: 'var(--primary)', color: 'white', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                    {group.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="m-0" style={{ fontSize: '1.25rem', color: 'var(--text-main)' }}>{group.name}</h3>
                  </div>
                </div>
                <Users size={20} className="text-muted" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
