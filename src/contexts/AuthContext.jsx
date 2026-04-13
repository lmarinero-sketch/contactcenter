import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { trackLogin, trackLogout } from '../lib/hubTracker'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [profile, setProfile] = useState(null)
    const [loading, setLoading] = useState(true)

    const fetchProfile = useCallback(async (userId) => {
        try {
            // Race fetchProfile against a 4s timeout to prevent hanging
            const result = await Promise.race([
                supabase.from('cc_profiles').select('*').eq('id', userId).single(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Profile fetch timeout')), 4000))
            ])
            if (result.error) {
                console.error('Error fetching profile:', result.error)
                return null
            }
            return result.data
        } catch (err) {
            console.error('Profile fetch failed:', err.message)
            return null
        }
    }, [])

    useEffect(() => {
        let mounted = true

        // Get initial session with resilient error handling
        const initAuth = async () => {
            try {
                // Race getSession against a 3s timeout
                const sessionResult = await Promise.race([
                    supabase.auth.getSession(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Session timeout')), 3000))
                ])

                if (!mounted) return

                const { data: { session }, error } = sessionResult
                if (error) {
                    console.error('Error getting session:', error)
                    // Clear potentially corrupted auth storage
                    try {
                        const storageKeys = Object.keys(localStorage)
                        storageKeys.forEach(key => {
                            if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
                                localStorage.removeItem(key)
                            }
                        })
                    } catch (_) { /* ignore storage errors */ }
                    setLoading(false)
                    return
                }

                if (session?.user) {
                    const prof = await fetchProfile(session.user.id)
                    if (!mounted) return
                    if (prof) {
                        setUser(session.user)
                        setProfile(prof)
                    } else {
                        console.warn('No profile found for user, signing out')
                        await supabase.auth.signOut().catch(() => {})
                        setUser(null)
                        setProfile(null)
                    }
                } else {
                    setUser(null)
                }
            } catch (err) {
                console.error('Auth init error:', err.message)
                // On timeout or any error, clear state and show login
                if (mounted) {
                    setUser(null)
                    setProfile(null)
                }
            } finally {
                if (mounted) setLoading(false)
            }
        }

        initAuth()

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (!mounted) return

                // Handle sign out and token expiry events immediately
                if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' && !session) {
                    setUser(null)
                    setProfile(null)
                    setLoading(false)
                    return
                }

                setUser(session?.user ?? null)
                if (session?.user) {
                    const prof = await fetchProfile(session.user.id)
                    if (mounted) setProfile(prof)
                } else {
                    setProfile(null)
                }
                setLoading(false)
            }
        )

        // Safety timeout — NEVER stay loading more than 3s
        const timeout = setTimeout(() => {
            if (mounted && loading) {
                console.warn('Auth loading timeout — forcing login screen')
                setLoading(false)
            }
        }, 3000)

        return () => {
            mounted = false
            subscription.unsubscribe()
            clearTimeout(timeout)
        }
    }, [])

    const signIn = async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        })
        if (error) throw error
        // Track in Hub Monitor (non-blocking)
        trackLogin(supabase, data.user.id)
        return data
    }

    const signOut = async () => {
        const userId = user?.id
        const { error } = await supabase.auth.signOut()
        if (error) throw error
        if (userId) trackLogout(supabase, userId)
        setUser(null)
        setProfile(null)
    }

    const isCoordinador = profile?.role === 'coordinador'
    const isGerente = profile?.role === 'gerente'
    const isAgente = profile?.role === 'agente'
    const isRefuerzo = profile?.role === 'refuerzo'

    const canEditShifts = isCoordinador || isGerente
    const canWriteLogbook = isCoordinador || isGerente || isAgente

    const value = {
        user,
        profile,
        loading,
        signIn,
        signOut,
        isCoordinador,
        isGerente,
        isAgente,
        isRefuerzo,
        canEditShifts,
        canWriteLogbook,
    }

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}
