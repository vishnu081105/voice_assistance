import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  History, 
  Settings, 
  LogOut,
  User,
  Home,
  FileText,
  Building2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { getSetting } from '@/lib/db';

export function Header() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [doctorName, setDoctorName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const name = await getSetting<string>('doctorName');
        const avatar = await getSetting<string>('avatarUrl');
        if (name) setDoctorName(name);
        if (avatar) setAvatarUrl(avatar);
      } catch (error) {
        console.error('Failed to load profile:', error);
      }
    };
    loadProfile();
  }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="container flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/80 shadow-md">
            <Building2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/70">
              KMCH Hospital
            </span>
            <span className="text-[10px] text-muted-foreground -mt-1 hidden sm:block">Voice Recording System</span>
          </div>
        </Link>

        {/* Right side - Navigation + Profile grouped together */}
        <div className="flex items-center gap-1">
          {/* Navigation buttons */}
          <Button
            variant={isActive('/') ? 'default' : 'ghost'}
            size="sm"
            onClick={() => navigate('/')}
            className={cn('gap-2', isActive('/') && 'bg-primary')}
          >
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">Home</span>
          </Button>
          
          <Button
            variant={isActive('/history') ? 'default' : 'ghost'}
            size="sm"
            onClick={() => navigate('/history')}
            className={cn('gap-2', isActive('/history') && 'bg-primary')}
          >
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">History</span>
          </Button>
          
          <Button
            variant={isActive('/settings') ? 'default' : 'ghost'}
            size="sm"
            onClick={() => navigate('/settings')}
            className={cn('gap-2', isActive('/settings') && 'bg-primary')}
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </Button>

          <Button
            variant={isActive('/supabase-users') ? 'default' : 'ghost'}
            size="sm"
            onClick={() => navigate('/supabase-users')}
            className={cn('gap-2', isActive('/supabase-users') && 'bg-primary')}
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Users</span>
          </Button>

          <ThemeToggle />

          {/* Profile dropdown */}
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0 ml-1">
                  <Avatar className="h-10 w-10 border-2 border-primary/20">
                    <AvatarImage src={avatarUrl} alt={doctorName || 'Doctor'} />
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {doctorName ? getInitials(doctorName) : <User className="h-5 w-5" />}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={avatarUrl} alt={doctorName || 'Doctor'} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {doctorName ? getInitials(doctorName) : <User className="h-4 w-4" />}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{doctorName || 'Doctor'}</p>
                      <p className="text-xs leading-none text-muted-foreground truncate max-w-[140px]">
                        {user.email}
                      </p>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <User className="mr-2 h-4 w-4" />
                  Edit Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/settings')}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}