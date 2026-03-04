import './globals.css';
import { AuthProvider } from '@/lib/auth';

export const metadata = {
  title: 'Jaklay — AI Data Enrichment',
  description: 'Your personal Clay alternative. Enrich leads with AI, verify emails, build workflows.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
