import './globals.css';

export const metadata = {
  title: 'Jaklay — AI Data Enrichment',
  description: 'Your personal Clay alternative. Enrich leads with AI, verify emails, build workflows.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
