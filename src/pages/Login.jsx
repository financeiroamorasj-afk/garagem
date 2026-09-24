
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import garagemLogo from '../assets/brand/garagem-logo-full.png'
import { homeRouteForRole } from '../lib/auth/homeRoute'

async function homeRouteForUser(userId) {
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, ativo')
        .eq('id', userId)
        .maybeSingle()

    if (error) throw error
    if (!profile) throw new Error('Este usuário ainda não está vinculado a um perfil do Garagem.')
    if (profile.ativo === false) throw new Error('Este acesso foi desativado pelo administrador da barbearia.')
    return homeRouteForRole(profile.role)
}

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const navigate = useNavigate()

    useEffect(() => {
        let active = true

        async function redirectExistingSession() {
            try {
                const { data: { session }, error: sessionError } = await supabase.auth.getSession()
                if (sessionError) throw sessionError
                if (!session || !active) return
                const route = await homeRouteForUser(session.user.id)
                if (active) navigate(route, { replace: true })
            } catch (sessionError) {
                if (active) setError(sessionError.message)
            }
        }

        redirectExistingSession()
        return () => { active = false }
    }, [navigate])

    const handleLogin = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            })
            if (error) throw error
            if (!data.user) throw new Error('Não foi possível identificar o usuário autenticado.')
            const route = await homeRouteForUser(data.user.id)
            navigate(route, { replace: true })
        } catch (error) {
            setError(error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-0 p-6 font-sans">
            <div className="atmosphere-vignette absolute inset-0" aria-hidden="true" />
            <div className="relative w-full max-w-md space-y-8 rounded-md border border-line bg-surface-1 p-8">
                <div className="flex justify-center">
                    <img
                        src={garagemLogo}
                        alt="Garagem System — Sistema de gestão para barbearias"
                        className="w-64 max-w-full object-contain"
                    />
                </div>

                <form className="mt-8 space-y-6" onSubmit={handleLogin}>
                    {error && (
                        <div className="p-3 text-body-sm text-danger bg-danger/12 border border-danger/40 rounded-sm">
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            label="Email"
                            placeholder="seu@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />

                        <Input
                            id="password"
                            name="password"
                            type="password"
                            autoComplete="current-password"
                            required
                            label="Senha"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    <Button
                        type="submit"
                        disabled={loading}
                        size="lg"
                        className="w-full shadow-[0_0_15px_rgba(184,115,51,0.3)]"
                    >
                        {loading ? 'Acessando...' : 'Entrar no Sistema'}
                    </Button>
                </form>
            </div>
        </div>
    )
}
