import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, ProtectedRoute } from '@reloplanner/shared-frontend';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import OAuthGithubCallback from './pages/OAuthGithubCallback';
import OAuthGoogleCallback from './pages/OAuthGoogleCallback';
import OAuthGithubCompleteEmail from './pages/OAuthGithubCompleteEmail';
import Settings from './pages/Settings';
import ProfileWizard from './pages/ProfileWizard';
import Dashboard from './pages/Dashboard';
import ProgressTracker from './pages/ProgressTracker';
import CostOfLiving from './pages/CostOfLiving';
import Jobs from './pages/Jobs';
import Profiles from './pages/Profiles';
import KnowledgeList from './pages/KnowledgeList';
import KnowledgeArticle from './pages/KnowledgeArticle';
import InDevelopment from './pages/InDevelopment';
import Plan from './pages/Plan';
import Cases from './pages/Cases';
import CaseDetail from './pages/CaseDetail';
import Chats from './pages/Chats';
import ChatDetail from './pages/ChatDetail';
import { AppLanguageProvider } from './i18n/AppLanguageProvider';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="oauth/github/callback" element={<OAuthGithubCallback />} />
        <Route path="oauth/google/callback" element={<OAuthGoogleCallback />} />
        <Route
          path="oauth/github/complete-email"
          element={<OAuthGithubCompleteEmail />}
        />
        <Route path="knowledge" element={<KnowledgeList />} />
        <Route path="knowledge/:slug" element={<KnowledgeArticle />} />
        <Route path="settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="plan" element={<ProtectedRoute><Plan /></ProtectedRoute>} />
        <Route path="profiles" element={<ProtectedRoute><Profiles /></ProtectedRoute>} />
        <Route path="cases" element={<ProtectedRoute><Cases /></ProtectedRoute>} />
        <Route path="cases/:caseId" element={<ProtectedRoute><CaseDetail /></ProtectedRoute>} />
        <Route path="chats" element={<ProtectedRoute><Chats /></ProtectedRoute>} />
        <Route path="chats/:caseId" element={<ProtectedRoute><ChatDetail /></ProtectedRoute>} />
        <Route path="wizard" element={<ProtectedRoute><ProfileWizard /></ProtectedRoute>} />
        <Route path="wizard/:profileId" element={<ProtectedRoute><ProfileWizard /></ProtectedRoute>} />
        <Route path="dashboard/:profileId" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="progress/:profileId" element={<ProtectedRoute><ProgressTracker /></ProtectedRoute>} />
        <Route path="cost-of-living" element={<ProtectedRoute><CostOfLiving /></ProtectedRoute>} />
        <Route path="jobs" element={<ProtectedRoute><Jobs /></ProtectedRoute>} />
        <Route path="in-development" element={<ProtectedRoute><InDevelopment /></ProtectedRoute>} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppLanguageProvider>
          <AppRoutes />
        </AppLanguageProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
