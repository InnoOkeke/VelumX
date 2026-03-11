"use client"

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

type SupabaseContext = {
  user: User | null
  loading: boolean
}

const Context = createContext<SupabaseContext>({ user: null, loading: true })

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase])

  return (
    <Context.Provider value={{ user, loading }}>
      {children}
    </Context.Provider>
  )
}

export const useUser = () => {
  const context = useContext(Context)
  if (context === undefined) {
    throw new Error('useUser must be used within a SessionProvider')
  }
  return context
}
