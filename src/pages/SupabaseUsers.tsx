import React, { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set')
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export default function SupabaseUsers() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')

  useEffect(() => {
    fetchUsers()
  }, [])

  async function fetchUsers() {
    setLoading(true)
    const { data, error } = await supabase.from('users').select('*').limit(100)
    setLoading(false)
    if (error) {
      console.error(error)
      return
    }
    setUsers(data || [])
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    const { data, error } = await supabase.from('users').insert([{ email }])
    setLoading(false)
    if (error) {
      console.error(error)
      return
    }
    setEmail('')
    fetchUsers()
  }

  return (
    <div className="p-4">
      <h2 className="text-2xl font-semibold mb-4">Supabase Users Demo</h2>
      <form onSubmit={createUser} className="flex gap-2 mb-4">
        <input
          className="border p-2 rounded"
          placeholder="email@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="btn" type="submit" disabled={loading}>
          Create
        </button>
      </form>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <ul className="space-y-2">
          {users.map((u) => (
            <li key={u.id} className="p-2 border rounded">
              <div className="text-sm">{u.email}</div>
              <div className="text-xs text-muted-foreground">id: {u.id}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
