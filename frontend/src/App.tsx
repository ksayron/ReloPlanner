import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './api/AuthContext';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import OAuthGithubCallback from './pages/OAuthGithubCallback';
import OAuthGithubCompleteEmail from './pages/OAuthGithubCompleteEmail';
import Settings from './pages/Settings';
import ProfileWizard from './pages/ProfileWizard';
import Dashboard from './pages/Dashboard';
import ProgressTracker from './pages/ProgressTracker';
import CostOfLiving from './pages/CostOfLiving';
import Profiles from './pages/Profiles';
import KnowledgeList from './pages/KnowledgeList';
import KnowledgeArticle from './pages/KnowledgeArticle';
import TaxonomyManager from './pages/admin/TaxonomyManager';
import MarketImport from './pages/admin/MarketImport';
import UserList from './pages/admin/UserList';
import SyncManager from './pages/admin/SyncManager';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return user ? <>{children}</> : <Navigate to="/login" />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  if (user.role !== 'ADMIN') return <Navigate to="/" />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="oauth/github/callback" element={<OAuthGithubCallback />} />
        <Route
          path="oauth/github/complete-email"
          element={<OAuthGithubCompleteEmail />}
        />
        <Route path="knowledge" element={<KnowledgeList />} />
        <Route path="knowledge/:slug" element={<KnowledgeArticle />} />
        <Route path="settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="profiles" element={<ProtectedRoute><Profiles /></ProtectedRoute>} />
        <Route path="wizard" element={<ProtectedRoute><ProfileWizard /></ProtectedRoute>} />
        <Route path="dashboard/:profileId" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="progress/:profileId" element={<ProtectedRoute><ProgressTracker /></ProtectedRoute>} />
        <Route path="cost-of-living" element={<ProtectedRoute><CostOfLiving /></ProtectedRoute>} />
        <Route path="admin/taxonomy" element={<AdminRoute><TaxonomyManager /></AdminRoute>} />
        <Route path="admin/market" element={<AdminRoute><MarketImport /></AdminRoute>} />
        <Route path="admin/users" element={<AdminRoute><UserList /></AdminRoute>} />
        <Route path="admin/sync" element={<AdminRoute><SyncManager /></AdminRoute>} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
