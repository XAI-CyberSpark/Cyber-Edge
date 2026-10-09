import { uiText, useUiLanguage  } from '@/i18n';
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LayoutGrid, Play } from 'lucide-react';
import { SCENARIO_TREE, type ScenarioItem } from '@/data/scenarios';
import { useApp } from '@/context/AppContext';

interface ScenarioSelectorProps {
    onSelectScenario: (scenario: ScenarioItem) => void;
    currentScenarioId?: string;
}

export function ScenarioSelector({ onSelectScenario, currentScenarioId }: ScenarioSelectorProps) {
  useUiLanguage();
    const { t } = useApp();
    const [open, setOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('driving');

    const handleSelect = (scenario: ScenarioItem) => {
        onSelectScenario(scenario);
        setOpen(false);
    };

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 type-label bg-background backdrop-blur border-border">
                    <LayoutGrid className="w-3.5 h-3.5 mr-2 text-foreground" />
                    {uiText(t('sidebar.library'))}
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[400px] sm:w-[540px] p-0 flex flex-col bg-background">
                <SheetHeader className="p-6 pb-2 bg-white border-b">
                    <SheetTitle className="flex items-center gap-2 type-panel">
                        <LayoutGrid className="w-5 h-5 text-purple-600" />
                        {uiText(t('sidebar.library'))}
                    </SheetTitle>
                    <SheetDescription>
                        {uiText(t('selector.desc'))}
                    </SheetDescription>
                </SheetHeader>
                
                <div className="flex-1 overflow-hidden flex flex-col">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
                        <div className="px-6 pt-4 bg-white border-b">
                            <TabsList className="w-full justify-start h-10 p-0 bg-transparent gap-6">
                                {Object.entries(SCENARIO_TREE).map(([key, category]) => {
                                    const Icon = category.icon;
                                    return (
                                        <TabsTrigger 
                                            key={key} 
                                            value={key}
                                            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-purple-600 rounded-none h-full px-0 pb-2 text-foreground data-[state=active]:text-purple-700 transition-none"
                                        >
                                            <Icon className="w-4 h-4 mr-2" />
                                            {uiText(category.label)}
                                        </TabsTrigger>
                                    );
                                })}
                            </TabsList>
                        </div>

                        <ScrollArea className="flex-1 p-6">
                            {Object.entries(SCENARIO_TREE).map(([key, category]) => (
                                <TabsContent key={key} value={key} className="mt-0 space-y-6">
                                    <div className="grid grid-cols-1 gap-4">
                                        {category.items.map((item) => {
                                            const ItemIcon = item.icon;
                                            const isActive = currentScenarioId === item.id;
                                            return (
                                                <Card 
                                                    key={item.id} 
                                                    className={`cursor-pointer transition-all hover:shadow-md border-l-4 ${isActive ? 'border-l-purple-500 ring-1 ring-purple-500/20' : 'border-l-transparent hover:border-l-border'}`}
                                                    onClick={() => handleSelect(item)}
                                                >
                                                    <CardHeader className="p-4 pb-2 flex flex-row items-start justify-between space-y-0">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`p-2 rounded-lg ${isActive ? 'bg-purple-100 text-purple-600' : 'bg-background text-foreground'}`}>
                                                                <ItemIcon className="w-5 h-5" />
                                                            </div>
                                                            <div>
                                                                <CardTitle className="type-item-title ">{uiText(item.title)}</CardTitle>
                                                                <CardDescription className="type-caption mt-0.5">{uiText(item.subcategory)}</CardDescription>
                                                            </div>
                                                        </div>
                                                        {isActive && <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-purple-600"><Play className="w-3 h-3 fill-current" /></Button>}
                                                    </CardHeader>
                                                    <CardContent className="p-4 pt-2">
                                                        <p className="type-body text-foreground line-clamp-2">{uiText(item.description)}</p>
                                                        
                                                        {/* Config Preview Chips */}
                                                        <div className="flex flex-wrap gap-1 mt-3">
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded type-tag  bg-background text-foreground">
                                                                {item.config.scenario.name}
                                                            </span>
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded type-tag  bg-background text-foreground">
                                                                {uiText(item.config.car.ac_temp)}
                                                            </span>
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded type-tag  bg-background text-foreground">
                                                                {uiText(item.config.hmi.music !== 'off' ? '🎵 Music' : '🔇 Silent')}
                                                            </span>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            );
                                        })}
                                    </div>
                                </TabsContent>
                            ))}
                        </ScrollArea>
                    </Tabs>
                </div>
            </SheetContent>
        </Sheet>
    );
}
