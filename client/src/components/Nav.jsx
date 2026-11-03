import { Link, useNavigate } from 'react-router-dom';
import { PawPrint, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
export default function Nav() {
 const {user,logout}=useAuth(); const nav=useNavigate();
 return <header className="nav"><Link to="/" className="brand"><PawPrint/> Rescue<span>Connect</span></Link><nav><Link to="/report">Report emergency</Link><Link to="/find-help">Find help</Link>{user ? <><Link to="/dashboard">Dashboard</Link><button className="linkbtn" onClick={()=>{logout();nav('/')}}><LogOut size={16}/> Logout</button></> : <><Link to="/login">Login</Link><Link className="nav-cta" to="/register">Register</Link></>}</nav></header>;
}
