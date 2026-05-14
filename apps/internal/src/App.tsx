import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import {
  AdminRoute,
  AuthProvider,
  InternalRoute,
  ProtectedRoute,
  useAuth,
} from '@reloplanner/shared-frontend';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import OAuthGithubCallback from './pages/OAuthGithubCallback';
import OAuthGoogleCallback from './pages/OAuthGoogleCallback';
import OAuthGithubCompleteEmail from './pages/OAuthGithubCompleteEmail';
import Settings from './pages/Settings';
import Plan from './pages/Plan';
import TaxonomyManager from './pages/admin/TaxonomyManager';
import MarketImport from './pages/admin/MarketImport';
import UserList from './pages/admin/UserList';
import SyncManager from './pages/admin/SyncManager';
import SystemMonitoring from './pages/admin/SystemMonitoring';
import Cases from './pages/Cases';
import CaseDetail from './pages/CaseDetail';
import Chats from './pages/Chats';
import ChatDetail from './pages/ChatDetail';

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role === 'SPECIALIST') {
    return <Navigate to="/cases" replace />;
  }
  return <Navigate to="/sync" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<HomeRedirect />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="oauth/github/callback" element={<OAuthGithubCallback />} />
        <Route path="oauth/google/callback" element={<OAuthGoogleCallback />} />
        <Route
          path="oauth/github/complete-email"
          element={<OAuthGithubCompleteEmail />}
        />
        <Route
          path="settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="plan"
          element={
            <ProtectedRoute>
              <Plan />
            </ProtectedRoute>
          }
        />
        <Route
          path="taxonomy"
          element={
            <AdminRoute>
              <TaxonomyManager />
            </AdminRoute>
          }
        />
        <Route
          path="market"
          element={
            <AdminRoute>
              <MarketImport />
            </AdminRoute>
          }
        />
        <Route
          path="users"
          element={
            <AdminRoute>
              <UserList />
            </AdminRoute>
          }
        />
        <Route
          path="sync"
          element={
            <AdminRoute>
              <SyncManager />
            </AdminRoute>
          }
        />
        <Route
          path="system"
          element={
            <AdminRoute>
              <SystemMonitoring />
            </AdminRoute>
          }
        />
        <Route
          path="cases"
          element={
            <InternalRoute>
              <Cases />
            </InternalRoute>
          }
        />
        <Route
          path="cases/:caseId"
          element={
            <InternalRoute>
              <CaseDetail />
            </InternalRoute>
          }
        />
        <Route
          path="chats"
          element={
            <InternalRoute>
              <Chats />
            </InternalRoute>
          }
        />
        <Route
          path="chats/:caseId"
          element={
            <InternalRoute>
              <ChatDetail />
            </InternalRoute>
          }
        />
      </Route>
    </Routes>
  );
}

export default function App() {
  const isInternalPath = window.location.pathname.startsWith('/internal');
  const basename = !import.meta.env.DEV || isInternalPath ? '/internal' : '/';
  return (
    <BrowserRouter basename={basename}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
