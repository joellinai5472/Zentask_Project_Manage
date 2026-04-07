import { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, doc, setDoc, getDoc } from './firebase';
import { User } from 'firebase/auth';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  loginWithEmail: async () => {},
  registerWithEmail: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          // Force refresh the token to ensure Firestore has the latest auth state
          await currentUser.getIdToken(true);
        } catch (e) {
          console.warn("Failed to refresh token", e);
        }

        // Sync user to Firestore
        const userRef = doc(db, 'users', currentUser.uid);
        try {
          let userDoc;
          let retries = 3;
          while (retries > 0) {
            try {
              userDoc = await getDoc(userRef);
              break; // Success
            } catch (error: any) {
              if (error.code === 'permission-denied' || error.message?.includes('Missing or insufficient permissions')) {
                retries--;
                if (retries === 0) throw error;
                // Wait 1 second before retrying to allow auth token to propagate
                await new Promise(resolve => setTimeout(resolve, 1000));
              } else {
                throw error;
              }
            }
          }
          
          if (userDoc && !userDoc.exists()) {
            try {
              await setDoc(userRef, {
                uid: currentUser.uid,
                email: currentUser.email || '',
                displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Unknown User',
                photoURL: currentUser.photoURL || '',
                createdAt: new Date().toISOString()
              });
            } catch (error) {
              console.error("Failed to create user document:", error);
              // Do not crash the app, just log the error
            }
          }
        } catch (error) {
          console.error("Failed to fetch user document:", error);
          // Do not crash the app, just log the error
        }
      }
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Error signing in with Google", error);
      throw error;
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
      console.error("Error logging in with email", error);
      throw error;
    }
  };

  const registerWithEmail = async (email: string, pass: string) => {
    try {
      await createUserWithEmailAndPassword(auth, email, pass);
    } catch (error) {
      console.error("Error registering with email", error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, loginWithEmail, registerWithEmail, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
