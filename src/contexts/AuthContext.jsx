import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [profile, setProfile] = useState(null)
    const [loading, setLoading] = useState(true)

    const fetchProfile = async (userId) => {
        const { data, error } = await supabase
            .from('cc_profiles')
            .select('*')
            .eq('id', userId)
            .single()

        if (error) {
            console.error('Error fetching profile:', error)
            return null
        }
        return data
    }

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            setUser(session?.user ?? null)
            if (session?.user) {
                const prof = await fetchProfile(session.user.id)
                setProfile(prof)
            }
            setLoading(false)
        })

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                setUser(session?.user ?? null)
                if (session?.user) {
                    const prof = await fetchProfile(session.user.id)
                    setProfile(prof)
                } else {
                    setProfile(null)
                }
                setLoading(false)
            }
        )

        return () => subscription.unsubscribe()
    }, [])

    const signIn = async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        })
        if (error) throw error
        return data
    }

    const signOut = async () => {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
        setUser(null)
        setProfile(null)
    }

    const isCoordinador = profile?.role === 'coordinador'
    const isAgente = profile?.role === 'agente'
    const isRefuerzo = profile?.role === 'refuerzo'

    const canEditShifts = isCoordinador
    const canWriteLogbook = isCoordinador || isAgente

    const value = {
        user,
        profile,
        loading,
        signIn,
        signOut,
        isCoordinador,
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
