import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Recycle, Leaf, Package, BarChart4, Calendar, MapPin, ArrowUpRight,
  TrendingUp, Users, Truck, Award, DollarSign, Plus, Loader2, RefreshCw
} from 'lucide-react';
import { useVendorRecycling } from '@/hooks/useVendorRecycling';
import { nigerianDate } from '@/lib/nigerianTime';

const VendorRecyclingPage = () => {
  const { 
    stats, 
    activities, 
    partners, 
    loading, 
    refreshing,
    addRecyclingActivity,
    getImpactMetrics,
    refreshData 
  } = useVendorRecycling();

  const [showAddActivityDialog, setShowAddActivityDialog] = useState(false);
  const [newActivity, setNewActivity] = useState({
    material_type: '',
    weight_kg: '',
    partner_name: '',
    activity_date: nigerianDate()
  });

  const handleAddActivity = async () => {
    if (!newActivity.material_type || !newActivity.weight_kg || !newActivity.partner_name) return;

    try {
      const pointsEarned = Math.floor(parseFloat(newActivity.weight_kg) * 2); // 2 points per kg
      
      await addRecyclingActivity({
        material_type: newActivity.material_type,
        weight_kg: parseFloat(newActivity.weight_kg),
        points_earned: pointsEarned,
        partner_name: newActivity.partner_name,
        activity_date: newActivity.activity_date
      });
      
      setNewActivity({
        material_type: '',
        weight_kg: '',
        partner_name: '',
        activity_date: nigerianDate()
      });
      setShowAddActivityDialog(false);
    } catch (error) {
      // Error handled in hook
    }
  };

  const impactMetrics = getImpactMetrics();

  if (loading) {
    return (
      <DashboardLayout userRole="VENDOR">
        <div className="p-3 sm:p-4 md:p-6 max-w-full mx-auto space-y-4 sm:space-y-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 bg-gray-200 rounded"></div>
              ))}
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="xl:col-span-2 h-96 bg-gray-200 rounded"></div>
              <div className="h-96 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="VENDOR">
      <div className="p-3 sm:p-4 md:p-6 max-w-full mx-auto space-y-4 sm:space-y-6">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-3 sm:gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Recycling Program</h1>
            <p className="text-sm sm:text-base text-gray-600">
              Manage your recycling efforts and track your impact
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={refreshData}
              disabled={refreshing}
              className="text-xs sm:text-sm"
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Refresh
            </Button>
            
            <Dialog open={showAddActivityDialog} onOpenChange={setShowAddActivityDialog}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary-hover text-black text-xs sm:text-sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Activity
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Recycling Activity</DialogTitle>
                  <DialogDescription>
                    Record a new recycling activity to track your environmental impact
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="material-type">Material Type</Label>
                    <Select value={newActivity.material_type} onValueChange={(value) => setNewActivity(prev => ({ ...prev, material_type: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select material type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cardboard">Cardboard</SelectItem>
                        <SelectItem value="plastic">Plastic</SelectItem>
                        <SelectItem value="glass">Glass</SelectItem>
                        <SelectItem value="paper">Paper</SelectItem>
                        <SelectItem value="aluminum">Aluminum</SelectItem>
                        <SelectItem value="metal">Metal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="weight">Weight (kg)</Label>
                    <Input
                      id="weight"
                      type="number"
                      step="0.1"
                      placeholder="Enter weight in kg"
                      value={newActivity.weight_kg}
                      onChange={(e) => setNewActivity(prev => ({ ...prev, weight_kg: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="partner">Recycling Partner</Label>
                    <Select value={newActivity.partner_name} onValueChange={(value) => setNewActivity(prev => ({ ...prev, partner_name: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select partner" />
                      </SelectTrigger>
                      <SelectContent>
                        {partners.map((partner) => (
                          <SelectItem key={partner.id} value={partner.name}>
                            {partner.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="date">Activity Date</Label>
                    <Input
                      id="date"
                      type="date"
                      value={newActivity.activity_date}
                      onChange={(e) => setNewActivity(prev => ({ ...prev, activity_date: e.target.value }))}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAddActivityDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddActivity}>
                    Add Activity
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card>
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-sm sm:text-base font-medium">Total Recycled</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                <span className="text-2xl sm:text-3xl font-bold">{stats?.total_recycled_kg.toFixed(1) || '0'} kg</span>
              </div>
              <p className="text-xs sm:text-sm text-gray-500">Materials this year</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-sm sm:text-base font-medium">Carbon Saved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Leaf className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
                <span className="text-2xl sm:text-3xl font-bold">{stats?.carbon_saved_kg.toFixed(1) || '0'} kg</span>
              </div>
              <p className="text-xs sm:text-sm text-gray-500">CO₂ emissions reduced</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-sm sm:text-base font-medium">Customer Participation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-2">
                <span className="text-2xl sm:text-3xl font-bold">{stats?.customer_participation_rate.toFixed(0) || '0'}%</span>
              </div>
              <Progress value={stats?.customer_participation_rate || 0} className="h-2 bg-gray-100" />
              <p className="text-xs sm:text-sm text-gray-500 mt-2">Customers actively recycling</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-sm sm:text-base font-medium">Vendor Recycling Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" />
                <span className="text-2xl sm:text-3xl font-bold">{stats?.vendor_recycling_rate.toFixed(0) || '0'}%</span>
              </div>
              <p className="text-xs sm:text-sm text-gray-500">Materials recycled by vendor</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
          <div className="col-span-1 xl:col-span-2">
            <Card>
              <CardHeader className="pb-3 sm:pb-6">
                <CardTitle className="text-base sm:text-lg">Recycling Activity</CardTitle>
                <CardDescription className="text-sm">Your recent recycling contributions</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="history" className="w-full">
                  <TabsList className="mb-3 sm:mb-4 w-full sm:w-auto">
                    <TabsTrigger value="history" className="text-xs sm:text-sm">History</TabsTrigger>
                    <TabsTrigger value="partners" className="text-xs sm:text-sm">Partners</TabsTrigger>
                    <TabsTrigger value="impact" className="text-xs sm:text-sm">Impact</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="history" className="mt-3 sm:mt-4">
                    <div className="space-y-3 sm:space-y-4">
                      {activities.length > 0 ? (
                        activities.map((item) => (
                          <RecyclingHistoryCard key={item.id} item={item} />
                        ))
                      ) : (
                        <div className="text-center py-8">
                          <Recycle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                          <h3 className="font-medium text-lg mb-2">No Activities Yet</h3>
                          <p className="text-gray-500 mb-4">Start recording your recycling activities to track your impact</p>
                          <Dialog open={showAddActivityDialog} onOpenChange={setShowAddActivityDialog}>
                            <DialogTrigger asChild>
                              <Button>
                                <Plus className="mr-2 h-4 w-4" />
                                Add First Activity
                              </Button>
                            </DialogTrigger>
                          </Dialog>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="partners" className="mt-3 sm:mt-4">
                    <div className="space-y-3 sm:space-y-4">
                      {partners.map((partner) => (
                        <PartnerCard key={partner.id} partner={partner} />
                      ))}
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="impact" className="mt-3 sm:mt-4">
                    {impactMetrics && <ImpactContent metrics={impactMetrics} />}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
          
          {/* Sidebar */}
          <div className="col-span-1">
            <Card>
              <CardHeader className="pb-3 sm:pb-6">
                <CardTitle className="text-base sm:text-lg">Recycling Rewards</CardTitle>
                <CardDescription className="text-sm">Incentives for recycling</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                <div className="flex items-center p-3 border rounded-lg">
                  <div className="p-1.5 sm:p-2 bg-primary-light rounded-full mr-3">
                    <Award className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  </div>
                  <div className="flex-grow">
                    <h4 className="font-medium text-sm sm:text-base">Points per kg</h4>
                    <p className="text-xs sm:text-sm text-gray-600">Earn points for every kg recycled</p>
                  </div>
                  <span className="font-bold text-base sm:text-lg">2 pts</span>
                </div>
                
                <div className="flex items-center p-3 border rounded-lg">
                  <div className="p-1.5 sm:p-2 bg-primary-light rounded-full mr-3">
                    <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  </div>
                  <div className="flex-grow">
                    <h4 className="font-medium text-sm sm:text-base">Discounts</h4>
                    <p className="text-xs sm:text-sm text-gray-600">Get discounts on packaging materials</p>
                  </div>
                </div>
                
                <Button className="w-full flex items-center justify-center bg-primary hover:bg-primary-hover text-black text-xs sm:text-sm">
                  <span>All Rewards</span>
                  <ArrowUpRight className="ml-2 h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
              </CardContent>
            </Card>
            
            <Card className="mt-3 sm:mt-4">
              <CardHeader className="pb-3 sm:pb-6">
                <CardTitle className="text-base sm:text-lg">Quick Stats</CardTitle>
                <CardDescription className="text-sm">Your recycling summary</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total Activities</span>
                  <span className="font-bold">{activities.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Points Earned</span>
                  <span className="font-bold">{activities.reduce((sum, a) => sum + a.points_earned, 0)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Partners Used</span>
                  <span className="font-bold">{new Set(activities.map(a => a.partner_name)).size}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

// Recycling History Card Component
const RecyclingHistoryCard = ({ item }: { item: any }) => (
  <div className="bg-card border-border border rounded-lg p-3 sm:p-4 hover:shadow-md transition-shadow">
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="p-1.5 sm:p-2 bg-primary-light rounded-full flex-shrink-0">
          <Recycle className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <h3 className="font-medium text-sm sm:text-base capitalize">{item.material_type} Recycling</h3>
            <Badge variant="outline" className="text-xs w-fit">{item.weight_kg} kg</Badge>
          </div>
          <div className="mt-1 text-xs sm:text-sm text-muted-foreground">{new Date(item.activity_date).toLocaleDateString()}</div>
          <div className="mt-2 flex items-center text-xs sm:text-sm text-muted-foreground">
            <Truck className="h-3 w-3 sm:h-4 sm:w-4 mr-1 flex-shrink-0" />
            <span className="truncate">Partner: {item.partner_name}</span>
          </div>
        </div>
      </div>
      
      <div className="flex justify-end">
        <div className="flex items-center bg-green-50 text-green-700 px-2 py-1 rounded text-xs sm:text-sm">
          <Leaf className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
          <span>+{item.points_earned} points</span>
        </div>
      </div>
    </div>
  </div>
);

// Partner Card Component
const PartnerCard = ({ partner }: { partner: any }) => (
  <div className="bg-card border-border border rounded-lg p-3 sm:p-4 hover:shadow-md transition-shadow">
    <div className="flex flex-col sm:flex-row justify-between gap-3">
      <div className="flex items-start gap-3">
        <Avatar className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0">
          <AvatarImage src={partner.logo_url} alt={partner.name} />
          <AvatarFallback className="text-xs sm:text-sm">{partner.name.substring(0, 2)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm sm:text-base">{partner.name}</h3>
          <div className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Materials: {partner.materials.join(', ')}
          </div>
          <div className="mt-2 flex items-center text-xs sm:text-sm text-muted-foreground">
            <Users className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
            <span>Rating: {partner.rating}</span>
          </div>
        </div>
      </div>
      
      <div className="flex sm:items-center">
        <Button variant="outline" className="w-full sm:w-auto text-xs sm:text-sm">Contact</Button>
      </div>
    </div>
  </div>
);

// Impact Content Component
const ImpactContent = ({ metrics }: { metrics: any[] }) => (
  <div className="space-y-3 sm:space-y-4">
    <div className="bg-white border rounded-lg p-3 sm:p-4">
      <h3 className="font-medium mb-3 sm:mb-4 text-sm sm:text-base">Environmental Impact</h3>
      <div className="space-y-3 sm:space-y-4">
        {metrics.map((metric, index) => (
          <ImpactMetric key={index} {...metric} />
        ))}
      </div>
      
      <Button className="w-full mt-4 sm:mt-6 bg-primary hover:bg-primary-hover text-black text-xs sm:text-sm">
        View Detailed Impact Report
      </Button>
    </div>
  </div>
);

// Impact Metric Component
const ImpactMetric = ({ label, value, progress }: { label: string; value: string; progress: number }) => (
  <div>
    <div className="flex justify-between text-xs sm:text-sm mb-1">
      <span>{label}</span>
      <span>{value}</span>
    </div>
    <Progress value={progress} className="h-2" />
  </div>
);

export default VendorRecyclingPage;