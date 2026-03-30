import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { Layout } from "./components/Layout";
import { AuthGuard } from "./components/AuthGuard";
import { AdminGuard } from "./components/AdminGuard";
import { LoginPage } from "./pages/LoginPage";
import { JoinPage } from "./pages/JoinPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AccountPage } from "./pages/AccountPage";
import { HubPage } from "./pages/tournament/HubPage";
import { VotePage } from "./pages/tournament/VotePage";
import { DraftPage } from "./pages/tournament/DraftPage";
import { StandingsPage } from "./pages/tournament/StandingsPage";
import { AdminOverview } from "./pages/admin/AdminOverview";
import { AdminTournament } from "./pages/admin/AdminTournament";
import { AdminCubes } from "./pages/admin/AdminCubes";

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/join" element={<JoinPage />} />
        <Route element={<Layout />}>
          <Route path="/" element={<AuthGuard><DashboardPage /></AuthGuard>} />
          <Route path="/account" element={<AuthGuard><AccountPage /></AuthGuard>} />
          <Route path="/tournament/:id" element={<AuthGuard><HubPage /></AuthGuard>} />
          <Route path="/tournament/:id/vote" element={<AuthGuard><VotePage /></AuthGuard>} />
          <Route path="/tournament/:id/draft/:round" element={<AuthGuard><DraftPage /></AuthGuard>} />
          <Route path="/tournament/:id/standings" element={<AuthGuard><StandingsPage /></AuthGuard>} />
          <Route path="/admin" element={<AdminGuard><AdminOverview /></AdminGuard>} />
          <Route path="/admin/tournament/:id" element={<AdminGuard><AdminTournament /></AdminGuard>} />
          <Route path="/admin/cubes" element={<AdminGuard><AdminCubes /></AdminGuard>} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
