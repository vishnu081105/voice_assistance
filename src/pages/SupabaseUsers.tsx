import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';

export default function SupabaseUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    const { data, error } = await (supabase as any).from('users').select('*').limit(100);
    setLoading(false);
    if (error) {
      console.error(error);
      return;
    }
    setUsers(data || []);
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-2xl py-8">
        <h2 className="text-2xl font-semibold mb-4">Users</h2>
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
