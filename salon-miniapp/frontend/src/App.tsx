import { Navigate, Route, Routes } from 'react-router-dom';

import { NavBar } from './components/NavBar';
import { Spinner } from './components/Ui';
import { useMe } from './hooks/useMe';
import AdminPage from './pages/AdminPage';
import BookingFlowPage from './pages/BookingFlowPage';
import BookingHistoryPage from './pages/BookingHistoryPage';
import CategoryPage from './pages/CategoryPage';
import HomePage from './pages/HomePage';
import MasterPage from './pages/MasterPage';
import MasterPanelPage from './pages/MasterPanelPage';
import ServicePage from './pages/ServicePage';

export default function App() {
  const state = useMe();

  if (state.status === 'loading') return <Spinner />;
  if (state.status === 'error')
    return (
      <div className="p-6 text-tg-text">
        <h1 className="text-lg font-semibold mb-2">Ошибка авторизации</h1>
        <p className="text-tg-hint text-[14px] whitespace-pre-wrap">
          {state.error}
        </p>
        <p className="text-tg-hint text-[13px] mt-3">
          Откройте приложение через Telegram — авторизация работает только
          внутри Telegram Web App.
        </p>
      </div>
    );

  const me = state.me;

  return (
    <div className="min-h-full pb-16">
      <Routes>
        <Route path="/" element={<HomePage me={me} />} />
        <Route path="/category/:id" element={<CategoryPage />} />
        <Route path="/service/:id" element={<ServicePage />} />
        <Route
          path="/service/:serviceId/master/:masterId"
          element={<BookingFlowPage me={me} />}
        />
        <Route path="/master/:id" element={<MasterPage me={me} />} />
        <Route path="/history" element={<BookingHistoryPage me={me} />} />
        <Route path="/master" element={<MasterPanelPage me={me} onChange={state.refresh} />} />
        <Route path="/admin" element={<AdminPage me={me} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <NavBar me={me} />
    </div>
  );
}
