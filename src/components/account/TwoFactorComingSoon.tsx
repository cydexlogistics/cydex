import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

// Two-factor authentication isn't available yet: shown, switched off, marked "Coming soon"
const TwoFactorComingSoon = ({ className }: { className?: string }) => (
  <Card className={cn('shadow-none', className)}>
    <CardHeader>
      <CardTitle className="flex flex-wrap items-center gap-2 text-base sm:text-lg">
        Two-Factor Authentication
        <Badge variant="secondary">Coming soon</Badge>
      </CardTitle>
      <CardDescription>Add an extra layer of security to your account.</CardDescription>
    </CardHeader>
    <CardContent className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">Enable two-factor authentication</span>
      <Switch checked={false} disabled aria-label="Two-factor authentication (coming soon)" />
    </CardContent>
  </Card>
);

export default TwoFactorComingSoon;
