import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Lock, Mail, AlertCircle, Loader2 } from 'lucide-react'

export default function LoginPage() {
    const { signIn } = useAuth()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            await signIn(email, password)
        } catch (err) {
            if (err.message?.includes('Invalid login credentials')) {
                setError('Email o contraseña incorrectos')
            } else {
                setError(err.message || 'Error al iniciar sesión')
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="login-page">
            <div className="login-bg-pattern"></div>
            <div className="login-container">
                <div className="login-card">
                    <div className="login-header">
                        <div className="login-logo">
                            <img src="/logosanatorio.png" alt="Sanatorio Argentino" />
                        </div>
                        <h1 className="login-title">Contact Center</h1>
                        <p className="login-subtitle">Panel de Analytics y Gestión</p>
                    </div>

                    <form className="login-form" onSubmit={handleSubmit}>
                        {error && (
                            <div className="login-error">
                                <AlertCircle size={16} />
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="login-field">
                            <label className="login-label">Correo Electrónico</label>
                            <div className="login-input-wrap">
                                <Mail size={18} className="login-input-icon" />
                                <input
                                    id="login-email"
                                    type="email"
                                    className="login-input"
                                    placeholder="ejemplo@sanatorio.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    autoComplete="email"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div className="login-field">
                            <label className="login-label">Contraseña</label>
                            <div className="login-input-wrap">
                                <Lock size={18} className="login-input-icon" />
                                <input
                                    id="login-password"
                                    type="password"
                                    className="login-input"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    autoComplete="current-password"
                                />
                            </div>
                        </div>

                        <button
                            id="login-submit"
                            type="submit"
                            className="login-btn"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={18} className="spin" />
                                    Ingresando...
                                </>
                            ) : (
                                'Iniciar Sesión'
                            )}
                        </button>
                    </form>

                    <div className="login-footer">
                        <span>Sistema Contact Center v2.0</span>
                        <span className="login-footer-credit">
                            Innovación y Transformación Digital
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}
