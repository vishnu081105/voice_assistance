import React, { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { listUsers } from '@/lib/db';

export default function SupabaseUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
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
        <h2 className="text-2xl font-semibold mb-4">User</h2>
        {loading ? (
          <div>Loading...</div>
        ) : (
          <ul className="space-y-2">
            {users.map((u) => (
              <li key={u.id} className="p-2 border rounded">
                <div className="text-sm">{u.email}</div>
                <div className="text-xs text-muted-foreground">{u.full_name}</div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
