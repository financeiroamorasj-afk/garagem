import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function useAdminProfile() {
  const [state, setState] = useState({ loading: true, session: null, profile: null, error: null })

  const loadProfile = useCallback(async (session) => {
    if (!session) {
      setState({ loading: false, session: null, profile: null, error: null })
      return
    }

    setState({ loading: true, session, profile: null, error: null })
    const { data, error } = await supabase
      .from('profiles')
      .select('role, nome')
      .eq('id', session.user.id)
      .maybeSingle()

    setState({ loading: false, session, profile: data ?? null, error: error ?? null })
  }, [])

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) setState({ loading: false, session: data.session, profile: null, error })
      else loadProfile(data.session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) loadProfile(session)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  return state
}
