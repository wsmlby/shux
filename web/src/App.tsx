import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext.js";
import Login from "./pages/Login.js";
import Setup from "./pages/Setup.js";
import Library from "./pages/Library.js";
import BookDetail from "./pages/BookDetail.js";
import Reader from "./pages/Reader.js";
import Users from "./pages/Users.js";
import NavBar from "./components/NavBar.js";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, needsSetup } = useAuth();
  if (loading) return <div className="page-loading">Loading…</div>;
  if (needsSetup) return <Navigate to="/setup" replace />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { needsSetup, loading } = useAuth();

  if (loading) return <div className="page-loading">Loading…</div>;

  return (
    <Routes>
      <Route path="/setup" element={needsSetup ? <Setup /> : <Navigate to="/" replace />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <NavBar />
            <Routes>
              <Route path="/" element={<Library />} />
              <Route path="/books/:id" element={<BookDetail />} />
              <Route path="/reader/:id" element={<Reader />} />
              <Route path="/users" element={<Users />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
