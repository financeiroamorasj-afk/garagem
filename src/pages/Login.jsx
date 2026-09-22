
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import garagemLogo from '../assets/brand/garagem-logo-full.png'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const navigate = useNavigate()

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (session) {
                navigate('/admin/dashboard')
            }
        })

        return () => subscription.unsubscribe()
    }, [navigate])

    const handleLogin = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            })
            if (error) throw error
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
