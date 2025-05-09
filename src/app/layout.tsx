
import type {Metadata} from 'next';
import { Inter } from 'next/font/google'; // Import Inter font
import { Toaster } from "@/components/ui/toaster"; // Import Toaster
import { ThemeProvider } from "@/components/theme-provider"; // Import ThemeProvider
import './globals.css';

// Initialize Inter font
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'CoralGuard',
  description: 'Analyze sensor data for coral suitability.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable}`} suppressHydrationWarning> {/* Add suppressHydrationWarning */}
      {/* Ensure no whitespace between <html> and <body> */}
      <body className={`font-sans antialiased`}> {/* Use font-sans utility class */}
         <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <Toaster /> {/* Add Toaster component here */}
         </ThemeProvider>
      </body>
    </html>
  );
}

