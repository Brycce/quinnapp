import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { ServiceRequestDetail } from './pages/ServiceRequestDetail';
import { TrackingPage } from './pages/TrackingPage';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <div className="min-h-screen bg-gray-50">
            <Routes>
              {/* Public */}
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/track/:token" element={<TrackingPage />} />

              {/* Protected Admin */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/requests/:id"
                element={
                  <ProtectedRoute>
                    <ServiceRequestDetail />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </div>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
