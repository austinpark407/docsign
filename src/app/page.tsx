import { isAuthenticated } from '@/lib/session';
import { config } from '@/lib/config';
import AppHeader from '@/components/AppHeader';
import Login from './login';
import Dashboard from './dashboard';

export const dynamic = 'force-dynamic';

export default async function Home() {
  if (!(await isAuthenticated())) return <Login appName={config.appName} />;
  return (
    <>
      <AppHeader appName={config.appName} />
      <Dashboard />
    </>
  );
}
