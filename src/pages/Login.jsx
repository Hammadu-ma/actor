// pages/Login.jsx
import React, { useState } from 'react';
import { auth, db } from '../config/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const userDoc = await getDoc(doc(db, "members", user.uid));
      
      if (!userDoc.exists()) {
        setError("User not authorized");
        await auth.signOut();
        setLoading(false);
        return;
      }

      const userRole = userDoc.data().role;
      
      if (userRole !== 'admin') {
        setError("Admin access required");
        await auth.signOut();
        setLoading(false);
        return;
      }

      // Success - reload to show main app
      window.location.reload();
    } catch (error) {
      setError("Invalid email or password");
      setLoading(false);
    }
  };

  return (
    <div className="login-screen-light">
      <div className="login-screen-container-light">
        {/* Logo Section */}
        <div className="login-screen-logo-light">
          <div className="login-screen-logo-circle-light">
            <i className="fa fa-shield-hawk"></i>
          </div>
          <h1>JUMJ Admin</h1>
          <p className="login-screen-subtitle-light">Payment Management System</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="login-screen-form-light">
          <div className="login-screen-input-group-light">
            <i className="fa fa-envelope"></i>
            <input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="login-screen-input-group-light">
            <i className="fa fa-lock"></i>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {error && (
            <div className="login-screen-error-light">
              <i className="fa fa-exclamation-circle"></i>
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="login-screen-btn-light" disabled={loading}>
            {loading ? (
              <>
                <i className="fa fa-spinner fa-spin"></i> Signing In...
              </>
            ) : (
              <>
                Sign In <i className="fa fa-arrow-right"></i>
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="login-screen-footer-light">
          <p>Admin Access Only</p>
          <small>Unauthorized access is prohibited</small>
        </div>
      </div>
    </div>
  );
};

export default Login;