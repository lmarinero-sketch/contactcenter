import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Lock, Mail, AlertCircle, Loader2, User } from 'lucide-react'

export default function LoginPage({ isCargaMode = false, isSimonMode = false }) {
    const { signIn, signUp } = useAuth()
    const [isRegistering, setIsRegistering] = useState(false)
    const [fullName, setFullName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            if (isRegistering) {
                await signUp(email, password, fullName)
                // Usualmente signUp loguea de forma automática a menos que se requiera confirmar email.
                // Si la sesión no inicia de inmediato, se podría mostrar un mensaje aquí,
                // pero por ahora el AuthContext debería manejar el cambio de sesión.
            } else {
                await signIn(email, password)
            }
        } catch (err) {
            if (err.message?.includes('Invalid login credentials')) {
                setError('Email o contraseña incorrectos')
            } else if (err.message?.includes('User already registered')) {
                setError('Este correo electrónico ya está registrado')
            } else {
                setError(err.message || (isRegistering ? 'Error al registrar usuario' : 'Error al iniciar sesión'))
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
                        <h1 className="login-title">{isSimonMode ? 'Asistente Documental' : (isCargaMode ? 'Portal de Carga' : 'Contact Center')}</h1>
                        <p className="login-subtitle">
                            {isSimonMode ? 'Consultas a Simon IA' : (isCargaMode ? 'Carga exclusiva de datos — Simon IA' : (isRegistering ? 'Crea una cuenta para acceder' : 'Panel de Analytics y Gestión'))}
                        </p>
                    </div>

                    <form className="login-form" onSubmit={handleSubmit}>
                        {error && (
                            <div className="login-error">
                                <AlertCircle size={16} />
                                <span>{error}</span>
                            </div>
                        )}

                        {isRegistering && (
                            <div className="login-field">
                                <label className="login-label">Nombre Completo</label>
                                <div className="login-input-wrap">
                                    <User size={18} className="login-input-icon" />
                                    <input
                                        id="login-name"
                                        type="text"
                                        className="login-input"
                                        placeholder="Ej: Juan Pérez"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        required
                                        autoComplete="name"
                                        autoFocus
                                    />
                                </div>
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
                                    autoFocus={!isRegistering}
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
                                    autoComplete={isRegistering ? 'new-password' : 'current-password'}
                                    minLength={6}
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
                                    {isRegistering ? 'Registrando...' : 'Ingresando...'}
                                </>
                            ) : (
                                isRegistering ? 'Crear Cuenta' : 'Iniciar Sesión'
                            )}
                        </button>
                    </form>

                    <div className="login-footer" style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <button 
                            type="button" 
                            className="btn btn-secondary"
                            onClick={() => {
                                setIsRegistering(!isRegistering)
                                setError('')
                            }}
                            style={{ background: 'transparent', border: 'none', color: '#3b82f6', fontWeight: 500, cursor: 'pointer' }}
                        >
                            {isRegistering ? '¿Ya tienes cuenta? Inicia Sesión' : '¿No tienes cuenta? Regístrate'}
                        </button>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                            <span>Sistema Contact Center v2.0</span>
                            <span className="login-footer-credit">
                                Innovación y Transformación Digital
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
