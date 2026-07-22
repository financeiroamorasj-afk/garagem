
import { Navigate, Outlet } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function ProtectedRoute() {
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
            setLoading(false)
        })

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
            setLoading(false)
        })

        return () => subscription.unsubscribe()
    }, [])

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-industrial-dark font-sans text-copper-light">
                <div className="animate-pulse text-xl font-bold tracking-widest uppercase">
                    Carregando...
                </div>
            </div>
        )
    }

    if (!session) {
        return <Navigate to="/" replace />
    }

    return <Outlet />
}
