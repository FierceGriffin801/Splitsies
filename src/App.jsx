import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import GroupDetails from './pages/GroupDetails';
import { LogOut, Home } from 'lucide-react';
import { Link } from 'react-router-dom';
import OneSignal from 'react-onesignal';
import { useEffect } from 'react';

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  return children;
}

function MainLayout({ children }) {
  const { user, signOut } = useAuth();

  useEffect(() => {
    if (user && import.meta.env.VITE_ONESIGNAL_APP_ID) {
      try {
        OneSignal.login(user.id);
      } catch(e) { console.error('OneSignal login error', e); }
    }
  }, [user]);

  return (
    <>
      <header className="p-4 flex items-center justify-between border-b" style={{ backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 10 }}>
        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Home size={24} className="text-primary" />
          <h2 className="font-bold text-primary m-0" style={{ marginBottom: 0 }}>Splitsies</h2>
        </Link>
        {user && (
          <button onClick={signOut} className="btn" style={{ padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
            <LogOut size={18} className="text-muted" />
          </button>
        )}
      </header>
      <main className="flex-1">
        {children}
      </main>
    </>
  );
}

function App() {
  useEffect(() => {
    const appId = import.meta.env.VITE_ONESIGNAL_APP_ID;
    if (appId) {
      try {
        OneSignal.init({
          appId: appId,
          allowLocalhostAsSecureOrigin: true,
        }).then(() => {
          OneSignal.Slidedown.promptPush();
        });
      } catch(e) { console.error('OneSignal init error', e); }
    }
  }, []);

  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/auth" element={<MainLayout><Auth /></MainLayout>} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <Dashboard />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/group/:id"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <GroupDetails />
                </MainLayout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
