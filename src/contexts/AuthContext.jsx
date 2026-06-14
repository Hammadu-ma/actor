// contexts/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        try {
          // Check if user exists in members collection
          const userDoc = await getDoc(doc(db, "members", firebaseUser.uid));
          
          if (!userDoc.exists()) {
            // User not found in members collection - not authorized
            setAuthError("User not authorized");
            await signOut(auth);
            setUser(null);
            setUserRole(null);
            setIsAdmin(false);
            setLoading(false);
            return;
          }
          
          const role = userDoc.data().role || 'viewer';
          setUserRole(role);
          setIsAdmin(role === 'admin');
          
          // If not admin, sign them out
          if (role !== 'admin') {
            setAuthError("Admin access required");
            await signOut(auth);
            setUser(null);
            setUserRole(null);
            setIsAdmin(false);
          }
        } catch (error) {
          console.error("Error fetching user role:", error);
          setAuthError("Error verifying user permissions");
          await signOut(auth);
          setUser(null);
          setUserRole(null);
          setIsAdmin(false);
        }
      } else {
        setUserRole(null);
        setIsAdmin(false);
        setAuthError(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setUserRole(null);
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider value={{ user, userRole, isAdmin, loading, authError, logout }}>
      {children}
    </AuthContext.Provider>
  );
};