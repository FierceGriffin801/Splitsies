import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function NotificationBell() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (!user) return;
    
    fetchNotifications();

    // Subscribe to real-time new notifications
    const channel = supabase
      .channel('custom-all-channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          setNotifications(prev => [payload.new, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchNotifications = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_read', false)
      .order('created_at', { ascending: false });
    
    if (data) setNotifications(data);
  };

  const markAsRead = async (id) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const markAllAsRead = async () => {
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    setNotifications([]);
    setShowDropdown(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      <button 
        className="btn btn-outline" 
        style={{ padding: '0.4rem', position: 'relative', border: 'none', background: 'transparent' }}
        onClick={() => setShowDropdown(!showDropdown)}
      >
        <Bell size={24} className="text-muted" />
        {notifications.length > 0 && (
          <span 
            style={{ 
              position: 'absolute', 
              top: '2px', 
              right: '2px', 
              backgroundColor: 'var(--danger)', 
              color: 'white', 
              borderRadius: '50%', 
              width: '18px', 
              height: '18px', 
              fontSize: '0.7rem', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              fontWeight: 'bold'
            }}
          >
            {notifications.length}
          </span>
        )}
      </button>

      {showDropdown && (
        <div 
          className="card shadow-lg" 
          style={{ 
            position: 'absolute', 
            top: '100%', 
            right: '0', 
            width: '300px', 
            zIndex: 1000, 
            marginTop: '0.5rem',
            padding: '1rem',
            maxHeight: '400px',
            overflowY: 'auto'
          }}
        >
          <div className="flex justify-between items-center mb-3">
            <h4 className="m-0">Notifications</h4>
            {notifications.length > 0 && (
              <button className="text-primary" style={{ background: 'none', border: 'none', fontSize: '0.8rem', cursor: 'pointer' }} onClick={markAllAsRead}>
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="text-muted text-center py-4 m-0" style={{ fontSize: '0.875rem' }}>No new notifications</p>
          ) : (
            <div className="flex flex-col gap-2">
              {notifications.map(n => (
                <div key={n.id} className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-hover)', fontSize: '0.875rem' }}>
                  <p className="m-0 mb-2">{n.message}</p>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                      {new Date(n.created_at).toLocaleDateString()}
                    </span>
                    <div className="flex gap-2">
                      {n.group_id && (
                        <Link to={`/group/${n.group_id}`} className="text-primary" onClick={() => markAsRead(n.id)}>View</Link>
                      )}
                      <button className="text-muted" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => markAsRead(n.id)}>Dismiss</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
