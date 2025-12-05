import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
            <Route path="/" element={<Dashboard />} />
            <Route path="/requests/:id" element={<ServiceRequestDetail />} />
            <Route path="/track/:token" element={<TrackingPage />} />
          </Routes>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
