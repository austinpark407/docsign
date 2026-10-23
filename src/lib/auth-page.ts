import { redirect } from 'next/navigation';
import { isAuthenticated } from './session';

/** Call at the top of admin pages: bounces signed-out visitors to the login screen. */
export async function requireAdminPage(): Promise<void> {
  if (!(await isAuthenticated())) redirect('/');
}
