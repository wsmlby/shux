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
        <img src="/icon.svg" alt="" className="brand-icon" />
        Shux
      </Link>
      <nav>
        {user?.role === "ADMIN" && <Link to="/users">Users</Link>}
        <Link to="/account">{user?.name}</Link>
        <button className="link-button" onClick={handleLogout}>
          Sign out
        </button>
      </nav>
    </header>
  );
}
