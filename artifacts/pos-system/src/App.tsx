import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import POS from "@/pages/POS";
import Analytics from "@/pages/Analytics";
import AddProduct from "@/pages/AddProduct";
import SettingsPage from "@/pages/Settings";
import NotificationsPage from "@/pages/Notifications";
import CartHistory from "@/pages/CartHistory";
import { StoreProvider } from "@/lib/store";
import { CartProvider } from "@/lib/cart";
import { SettingsProvider } from "@/lib/settings";
import { ShortcutsProvider } from "@/lib/shortcuts";
import { NotificationsProvider } from "@/lib/notifications-store";
import { NotificationToaster } from "@/components/NotificationToaster";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={POS} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/add-product" component={AddProduct} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/notifications" component={NotificationsPage} />
      <Route path="/cart-history" component={CartHistory} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300} skipDelayDuration={0}>
        <SettingsProvider>
          <StoreProvider>
            <CartProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <NotificationsProvider>
                  <ShortcutsProvider>
                    <Router />
                  </ShortcutsProvider>
                  <NotificationToaster />
                </NotificationsProvider>
              </WouterRouter>
              <Toaster />
            </CartProvider>
          </StoreProvider>
        </SettingsProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
