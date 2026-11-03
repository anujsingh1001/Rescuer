import { Routes,Route } from 'react-router-dom';
import Nav from './components/Nav';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import { Register,Login } from './pages/Auth';
import Report from './pages/Report';
import { CitizenDashboard,NgoDashboard,AdminDashboard,PendingApproval } from './pages/Dashboard';
import { useAuth } from './context/AuthContext';
function DashboardRouter(){const {user}=useAuth();if(user?.role==='NGO')return <NgoDashboard/>;if(user?.role==='ADMIN')return <AdminDashboard/>;return <CitizenDashboard/>;}
function FindHelp(){return <div className="page narrow"><span className="eyebrow">RESCUE DIRECTORY</span><h1>Find rescue help</h1><p className="muted">The verified partner directory will be expanded with map-based search in the next release. For urgent situations, use the emergency report form and contact local animal welfare services directly.</p><a className="btn primary" href="/report">Report an emergency</a></div>}
export default function App(){return <><Nav/><Routes><Route path="/" element={<Home/>}/><Route path="/register" element={<Register/>}/><Route path="/login" element={<Login/>}/><Route path="/find-help" element={<FindHelp/>}/><Route path="/pending-approval" element={<PendingApproval/>}/><Route path="/report" element={<ProtectedRoute roles={['CITIZEN']}><Report/></ProtectedRoute>}/><Route path="/dashboard" element={<ProtectedRoute><DashboardRouter/></ProtectedRoute>}/><Route path="/ngo" element={<ProtectedRoute roles={['NGO']}><NgoDashboard/></ProtectedRoute>}/><Route path="/admin" element={<ProtectedRoute roles={['ADMIN']}><AdminDashboard/></ProtectedRoute>}/><Route path="*" element={<Home/>}/></Routes><footer>© {new Date().getFullYear()} RescueConnect • Built for animal welfare</footer></>}
