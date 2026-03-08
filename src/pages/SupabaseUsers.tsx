import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { listUsers } from '@/lib/db';

type AdminUser = {
  id: string;
  email: string;
  full_name?: string | null;
  role?: string | null;
};

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const data = await listUsers(100);
      setUsers(data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-2xl py-8">
        <h2 className="mb-4 text-2xl font-semibold">Users</h2>
        {loading ? (
          <div>Loading...</div>
        ) : (
          <ul className="space-y-2">
            {users.map((user) => (
              <li key={user.id} className="rounded border p-2">
                <div className="text-sm">{user.email}</div>
                <div className="text-xs text-muted-foreground">
                  {user.full_name} {user.role ? `| ${user.role}` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
