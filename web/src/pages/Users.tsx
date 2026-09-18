import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { api, ApiError } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";

export default function Users() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "USER">("USER");
  const [error, setError] = useState<string | null>(null);

  const { data: users } = useQuery({ queryKey: ["users"], queryFn: api.users });

  if (user?.role !== "ADMIN") return <Navigate to="/" replace />;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.register({ email, name, password, role });
      setEmail("");
      setName("");
      setPassword("");
      setRole("USER");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this user?")) return;
    await api.deleteUser(id);
    queryClient.invalidateQueries({ queryKey: ["users"] });
  }

  return (
    <main className="container">
      <h1>Users</h1>
      <table className="user-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {users?.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>{u.role}</td>
              <td>
                {u.id !== user.id && (
                  <button className="link-button danger" onClick={() => handleDelete(u.id)}>
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Add user</h2>
      <form className="inline-form" onSubmit={handleCreate}>
        {error && <div className="error">{error}</div>}
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        <select value={role} onChange={(e) => setRole(e.target.value as "ADMIN" | "USER")}>
          <option value="USER">User</option>
          <option value="ADMIN">Admin</option>
        </select>
        <button type="submit">Add</button>
      </form>
    </main>
  );
}
