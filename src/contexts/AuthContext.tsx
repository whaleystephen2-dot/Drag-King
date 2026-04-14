import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
  currency: number;
  careerLeague: number;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: { currency?: number; careerLeague?: number }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState(0);
  const [careerLeague, setCareerLeague] = useState(1);

  const refreshProfile = async () => {
    if (!auth.currentUser) return;
    const docRef = doc(db, 'users', auth.currentUser.uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      setCurrency(data.currency || 0);
      setCareerLeague(data.careerLeague || 1);
    } else {
      // Create initial profile
      await setDoc(docRef, {
        uid: auth.currentUser.uid,
        displayName: auth.currentUser.displayName,
        currency: 1000, // Starting currency
        careerLeague: 1,
        createdAt: new Date().toISOString()
      });
      setCurrency(1000);
      setCareerLeague(1);
    }
  };

  const updateProfile = async (updates: { currency?: number; careerLeague?: number }) => {
    if (!auth.currentUser) return;
    const docRef = doc(db, 'users', auth.currentUser.uid);
    await updateDoc(docRef, updates);
    if (updates.currency !== undefined) setCurrency(updates.currency);
    if (updates.careerLeague !== undefined) setCareerLeague(updates.careerLeague);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        await refreshProfile();
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, logout, currency, careerLeague, refreshProfile, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
