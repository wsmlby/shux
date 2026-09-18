import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";

export default function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <header className="navbar">
      <Link to="/" className="brand">
        Shux
      </Link>
      <nav>
        {user?.role === "ADMIN" && <Link to="/users">Users</Link>}
        <span className="muted">{user?.name}</span>
        <button className="link-button" onClick={handleLogout}>
          Sign out
        </button>
      </nav>
    </header>
  );
}
