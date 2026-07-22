
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const navigate = useNavigate()

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (session) {
                navigate('/dashboard')
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
        <div className="flex items-center justify-center min-h-screen bg-industrial-dark font-sans text-copper-light">
            <div className="w-full max-w-md p-8 space-y-8 bg-black/40 border border-copper rounded-lg shadow-2xl backdrop-blur-sm">
                <div className="text-center">
                    <h2 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-copper to-gold-aged tracking-wider uppercase">
                        Garagem
                    </h2>
                    <p className="mt-2 text-sm text-copper/80">Sistema de Gestão Premium</p>
                </div>

                <form className="mt-8 space-y-6" onSubmit={handleLogin}>
                    {error && (
                        <div className="p-3 text-sm text-red-500 bg-red-900/20 border border-red-900/50 rounded">
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label htmlFor="email" className="block text-xs font-medium uppercase tracking-widest text-copper">
                                Email
                            </label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                className="w-full px-4 py-3 mt-1 text-gold-aged bg-white/5 border border-white/10 rounded focus:outline-none focus:border-copper focus:ring-1 focus:ring-copper transition-all duration-300 placeholder-white/20"
                                placeholder="seu@email.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-xs font-medium uppercase tracking-widest text-copper">
                                Senha
                            </label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                className="w-full px-4 py-3 mt-1 text-gold-aged bg-white/5 border border-white/10 rounded focus:outline-none focus:border-copper focus:ring-1 focus:ring-copper transition-all duration-300 placeholder-white/20"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full px-4 py-3 text-sm font-bold text-industrial-dark uppercase tracking-widest bg-gradient-to-r from-copper to-gold-aged rounded hover:from-copper-light hover:to-gold-aged focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-copper transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(184,115,51,0.3)]"
                    >
                        {loading ? 'Acessando...' : 'Entrar no Sistema'}
                    </button>
                </form>
            </div>
        </div>
    )
}
