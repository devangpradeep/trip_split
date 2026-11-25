import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/useAuth';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import GroupDetails from './pages/GroupDetails';
import JoinGroup from './pages/JoinGroup';
import Profile from './pages/Profile';
import InstallPrompt from './components/InstallPrompt';
import PhoneSetupModal from './components/PhoneSetupModal';
import Landing from './pages/Landing';
import { getAuthReturnPath } from './lib/authRedirect';

// Protected Route Wrapper
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  
  if (loading) return <div className="container text-center pt-20">Loading...</div>;
  if (!user) {
    const nextPath = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(nextPath)}`} replace />;
  }
  
  return children;
};

const AuthEntryRoute = ({ children }) => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  return user ? <Navigate to={getAuthReturnPath(searchParams.get('next'))} replace /> : children;
};

// Main App Router
const AppRoutes = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="container text-center pt-20">Initializing app...</div>;
  }

  // Show the phone-setup modal for any authenticated, non-guest user who has
  // no phone number yet (fresh registration or just claimed a guest account).
  const needsPhoneSetup = user && !user.is_guest && !user.phone;

  return (
    <>
      {needsPhoneSetup && <PhoneSetupModal />}
      <Routes>
        <Route path="/login" element={<AuthEntryRoute><Login /></AuthEntryRoute>} />
        <Route path="/register" element={<AuthEntryRoute><Register /></AuthEntryRoute>} />
        <Route path="/join/:token" element={<JoinGroup />} />
        
        <Route path="/" element={user ? <Dashboard /> : <Landing />} />
        
        <Route path="/groups/:id" element={
          <ProtectedRoute>
            <GroupDetails />
          </ProtectedRoute>
        } />

        <Route path="/profile" element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        } />
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <InstallPrompt enabled={Boolean(user)} />
    </>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
        <Analytics />
        <SpeedInsights />
      </Router>
    </AuthProvider>
  );
};

export default App;
