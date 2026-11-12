import { Navigate, Route, Routes, Link } from "react-router-dom";
import "./App.css";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { SubmitFirPage } from "./pages/SubmitFirPage";
import { OfficerQueuePage } from "./pages/OfficerQueuePage";
import { FirDetailPage } from "./pages/FirDetailPage";
import { ChainPage } from "./pages/ChainPage";
import { MyFirsPage } from "./pages/MyFirsPage";
import { MyFirDetailPage } from "./pages/MyFirDetailPage";
import { VerifyReceiptPage } from "./pages/VerifyReceiptPage";
import { useAuth } from "./auth/AuthContext";
import { RequireAuth } from "./routes/RequireAuth";

export default function App() {
  const { user, logout } = useAuth();

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">FIR integrity — thesis system</div>
        <nav className="nav">
          {!user && (
            <>
              <Link to="/login">Sign in</Link>
              <Link to="/register">Register</Link>
              <Link to="/verify-receipt">Verify receipt</Link>
            </>
          )}
          {user?.role === "CITIZEN" && (
            <>
              <Link to="/submit">Submit FIR</Link>
              <Link to="/my-firs">My FIRs</Link>
              <Link to="/verify-receipt">Verify receipt</Link>
            </>
          )}
          {(user?.role === "OFFICER" || user?.role === "ADMIN") && (
            <>
              <Link to="/queue">Queue</Link>
              <Link to="/chain">Chain</Link>
              <Link to="/verify-receipt">Verify receipt</Link>
            </>
          )}
          {user && (
            <button type="button" className="linkish" onClick={logout}>
              Sign out
            </button>
          )}
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-receipt" element={<VerifyReceiptPage />} />
        <Route
          path="/submit"
          element={
            <RequireAuth roles={["CITIZEN"]}>
              <SubmitFirPage />
            </RequireAuth>
          }
        />
        <Route
          path="/my-firs"
          element={
            <RequireAuth roles={["CITIZEN"]}>
              <MyFirsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/my-firs/:id"
          element={
            <RequireAuth roles={["CITIZEN"]}>
              <MyFirDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/queue"
          element={
            <RequireAuth roles={["OFFICER", "ADMIN"]}>
              <OfficerQueuePage />
            </RequireAuth>
          }
        />
        <Route
          path="/chain"
          element={
            <RequireAuth roles={["OFFICER", "ADMIN"]}>
              <ChainPage />
            </RequireAuth>
          }
        />
        <Route
          path="/firs/:id"
          element={
            <RequireAuth roles={["OFFICER", "ADMIN"]}>
              <FirDetailPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "CITIZEN") return <Navigate to="/my-firs" replace />;
  return <Navigate to="/queue" replace />;
}
