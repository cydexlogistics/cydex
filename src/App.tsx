
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/integrations/supabase/config';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { SupabaseProvider } from '@/contexts/SupabaseContext';
import { AuthProvider } from "@/contexts/SupabaseAuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import AppRoutes from "@/routes/AppRoutes";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Toaster as ShadcnToaster } from "@/components/ui/toaster";
import InstallBanner from "@/components/pwa/InstallBanner";
import { ConfirmProvider } from "@/contexts/ConfirmContext";

const queryClient = new QueryClient();

function App() {
  const supabaseUrl = SUPABASE_URL;
  const supabaseAnonKey = SUPABASE_ANON_KEY;
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <SupabaseProvider supabaseUrl={supabaseUrl} supabaseKey={supabaseAnonKey}>
          <AuthProvider>
            <CartProvider>
              <TooltipProvider>
               <ConfirmProvider>
                <Toaster />
                <ShadcnToaster />
                <BrowserRouter>
                  <div className="min-h-screen bg-background font-sans antialiased ">
                    <AppRoutes />
                  </div>
                  <InstallBanner />
                </BrowserRouter>
               </ConfirmProvider>
              </TooltipProvider>
            </CartProvider>
          </AuthProvider>
                </SupabaseProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
