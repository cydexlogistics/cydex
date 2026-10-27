
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, Lock, Eye, AlertTriangle, UserX, Activity } from 'lucide-react';

export function Security() {
  // Mock security events
  const securityEvents = [
    { id: 1, event: 'Failed Login Attempt', user: 'john@example.com', ip: '192.168.1.1', timestamp: '2023-05-10 14:23', severity: 'Medium' },
    { id: 2, event: 'Password Changed', user: 'admin@cydex.com', ip: '192.168.1.5', timestamp: '2023-05-09 11:45', severity: 'Low' },
    { id: 3, event: 'Suspicious Activity', user: 'vendor12@example.com', ip: '192.168.1.8', timestamp: '2023-05-08 23:12', severity: 'High' },
    { id: 4, event: 'New Admin Added', user: 'admin@cydex.com', ip: '192.168.1.5', timestamp: '2023-05-07 10:30', severity: 'Medium' },
    { id: 5, event: 'Account Locked', user: 'user56@example.com', ip: '192.168.1.12', timestamp: '2023-05-06 08:15', severity: 'Medium' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Security Status</CardTitle>
            <Shield className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Good</div>
            <p className="text-xs text-muted-foreground">System security is stable</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">189</div>
            <p className="text-xs text-muted-foreground">Currently logged in</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Blocked Attempts</CardTitle>
            <UserX className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">24</div>
            <p className="text-xs text-muted-foreground">In the last 24 hours</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Password Security</CardTitle>
            <Lock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Strong</div>
            <p className="text-xs text-muted-foreground">Policy enforced</p>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Security & Compliance Settings</CardTitle>
          <CardDescription>
            Configure security protocols and permissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-medium mb-4">Authentication</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Password Policy</p>
                    <p className="text-sm text-muted-foreground">Minimum 8 characters with complexity</p>
                  </div>
                  <div className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">Enabled</div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Session Timeout</p>
                    <p className="text-sm text-muted-foreground">Automatically log out after 30 minutes</p>
                  </div>
                  <div className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">Enabled</div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Account Lockout</p>
                    <p className="text-sm text-muted-foreground">Lock account after 5 failed attempts</p>
                  </div>
                  <div className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">Enabled</div>
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-medium mb-4">Data Protection</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Data Encryption</p>
                    <p className="text-sm text-muted-foreground">End-to-end encryption for sensitive data</p>
                  </div>
                  <div className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">Enabled</div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">GDPR Compliance</p>
                    <p className="text-sm text-muted-foreground">Data handling follows GDPR requirements</p>
                  </div>
                  <div className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">Compliant</div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Audit Logging</p>
                    <p className="text-sm text-muted-foreground">Log all admin actions for review</p>
                  </div>
                  <div className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">Enabled</div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-8">
            <h3 className="text-lg font-medium mb-4">Recent Security Events</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left border-b">
                    <th className="pb-2 font-medium">Event</th>
                    <th className="pb-2 font-medium">User</th>
                    <th className="pb-2 font-medium">IP Address</th>
                    <th className="pb-2 font-medium">Timestamp</th>
                    <th className="pb-2 font-medium">Severity</th>
                    <th className="pb-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {securityEvents.map((event) => (
                    <tr key={event.id} className="border-b">
                      <td className="py-4">{event.event}</td>
                      <td className="py-4">{event.user}</td>
                      <td className="py-4">{event.ip}</td>
                      <td className="py-4">{event.timestamp}</td>
                      <td className="py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          event.severity === 'High' ? 'bg-red-100 text-red-800' : 
                          event.severity === 'Medium' ? 'bg-yellow-100 text-yellow-800' : 
                          'bg-green-100 text-green-800'
                        }`}>
                          {event.severity}
                        </span>
                      </td>
                      <td className="py-4 text-right">
                        <Button variant="ghost" size="sm" className="gap-1">
                          <Eye className="h-4 w-4" />
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button variant="outline" className="gap-1.5">
              <Shield className="h-4 w-4" />
              Security Audit
            </Button>
            <Button className="gap-1.5">
              <Lock className="h-4 w-4" />
              Update Security Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
