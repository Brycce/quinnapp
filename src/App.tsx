import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Landing } from './pages/Landing';
import { Dashboard } from './pages/Dashboard';
import { ServiceRequestDetail } from './pages/ServiceRequestDetail';
import { TrackingPage } from './pages/TrackingPage';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-50">
          <Routes>
            {/* Public */}
            <Route path="/" element={<Landing />} />
            <Route path="/track/:token" element={<TrackingPage />} />

            {/* Admin */}
            <Route path="/admin" element={<Dashboard />} />
            <Route path="/admin/requests/:id" element={<ServiceRequestDetail />} />
          </Routes>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
