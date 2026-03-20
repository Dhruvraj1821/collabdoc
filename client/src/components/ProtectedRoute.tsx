import { Navigate } from 'react-router-dom';
import { isLoggedIn } from '../services/authService.js';

// Wraps routes that require authentication
// If not logged in, redirect to /login
export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}