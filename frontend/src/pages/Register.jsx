import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextParam = searchParams.get('next');
  const nextPath = nextParam && nextParam.startsWith('/') ? nextParam : '/';
  const loginLink = nextParam ? `/login?next=${encodeURIComponent(nextParam)}` : '/login';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (password.length < 6) {
      return setError('Password must be at least 6 characters');
    }

    setLoading(true);

    const result = await register(name, email, password, phone);
    
    if (result.success) {
      navigate(nextPath);
    } else {
      setError(result.error || 'Failed to register');
      setLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center" style={{ minHeight: '80vh', padding: '2rem 0' }}>
      <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '480px' }}>
        <div className="text-center" style={{ marginBottom: '2rem' }}>
          <h1 className="text-title heading-gradient">Join Tripsplit</h1>
          <p className="text-subtitle">Create an account to start splitting expenses</p>
        </div>

        {error && <div className="error-text text-center">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Full Name</label>
            <input 
              type="text" 
              required 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
            />
          </div>

          <div className="form-group">
            <label>Email Address</label>
            <input 
              type="email" 
              required 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          
          <div className="form-group">
            <label>Phone Number (Optional)</label>
            <input 
              type="tel" 
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 000-0000"
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input 
              type="password" 
              required 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ width: '100%', marginTop: '1rem' }}
            disabled={loading}
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="text-center" style={{ marginTop: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Already have an account? <Link to={loginLink} style={{ color: 'var(--primary-color)', textDecoration: 'none', fontWeight: '500' }}>Sign in</Link>
        </div>
      </div>
    </div>
  );
};

export default Register;
