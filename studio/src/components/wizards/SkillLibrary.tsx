import { uiText, useUiLanguage } from '@/i18n';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useApp } from '@/context/AppContext';
import { Search, Plus, Box, Code } from 'lucide-react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiUrl } from '@/lib/api';

interface SkillParameter {
  name: string;
  type_: string;
  description: string;
  required: boolean;
}

interface SkillManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  category: string;
  parameters: SkillParameter[];
  execution: any;
}

export const SkillLibrary = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
  useUiLanguage();
  const { t } = useApp();
  const [skills, setSkills] = useState<SkillManifest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [jsonImport, setJsonImport] = useState('');
  const [activeTab, setActiveTab] = useState('browse');

  const fetchSkills = async () => {
    try {
      const res = await fetch(apiUrl('/v1/skills'));
      if (res.ok) {
        const data = await res.json();
        setSkills(data);
      }
    } catch (e) {
      console.error("Failed to fetch skills", e);
    }
  };

  useEffect(() => {
    if (open) {
      fetchSkills();
    }
  }, [open]);

  const handleImport = async () => {
    try {
      const manifest = JSON.parse(jsonImport);
      const res = await fetch(apiUrl('/v1/skills/import'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manifest)
      });
      if (res.ok) {
        setJsonImport('');
        setActiveTab('browse');
        fetchSkills();
      } else {
        alert("Failed to import skill");
      }
    } catch (e) {
      alert("Invalid JSON");
    }
  };

  const filteredSkills = skills.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[700px] flex flex-col p-0 overflow-hidden">
        <div className="p-6 border-b bg-muted/10">
          <DialogHeader>
            <DialogTitle className="type-panel flex items-center gap-2">
              <Box className="w-6 h-6 text-primary" />
              {uiText(t('cat.skills'))} Library
            </DialogTitle>
          </DialogHeader>
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="px-6 py-2 border-b flex justify-between items-center bg-card">
            <TabsList>
              <TabsTrigger value="browse" className="flex items-center gap-2"><Search className="w-4 h-4" /> Browse</TabsTrigger>
              <TabsTrigger value="import" className="flex items-center gap-2"><Plus className="w-4 h-4" /> Import JSON</TabsTrigger>
            </TabsList>
            
            {activeTab === 'browse' && (
              <div className="relative w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search skills..." 
                  className="pl-8" 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            )}
          </div>

          <TabsContent value="browse" className="flex-1 overflow-hidden p-0 m-0 bg-muted/5">
            <ScrollArea className="h-full p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredSkills.map(skill => (
                  <Card key={skill.id} className="flex flex-col h-full hover:border-primary/50 transition-all cursor-pointer group">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <Badge variant="secondary" className="mb-2 uppercase type-tag tracking-wider">{uiText(skill.category)}</Badge>
                        <Badge variant="outline" className="text-muted-foreground">{uiText(skill.version)}</Badge>
                      </div>
                      <CardTitle className="type-item-title group-hover:text-primary transition-colors">{uiText(skill.name)}</CardTitle>
                      <CardDescription className="type-body">by {uiText(skill.author)}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <p className="type-body text-muted-foreground line-clamp-3">{uiText(skill.description)}</p>
                      
                      <div className="mt-4 space-y-2">
                        {skill.parameters.slice(0, 2).map(p => (
                          <div key={p.name} className="type-body bg-muted/50 p-1.5 rounded flex justify-between">
                            <span className="font-mono text-primary">{uiText(p.name)}</span>
                            <span className="text-muted-foreground">{uiText(p.type_)}</span>
                          </div>
                        ))}
                        {skill.parameters.length > 2 && (
                          <div className="type-body text-center text-muted-foreground">+{uiText(skill.parameters.length - 2)} more params</div>
                        )}
                      </div>
                    </CardContent>
                    <CardFooter className="pt-0">
                      <Button className="w-full" variant="secondary">
                        <Plus className="w-4 h-4 mr-2" /> Add to Workspace
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="import" className="flex-1 p-6 space-y-4">
            <div className="space-y-2">
              <h3 className="type-section ">Import Skill Manifest</h3>
              <p className="type-body text-muted-foreground">Paste a JSON manifest to register a new custom skill.</p>
            </div>
            <Textarea 
              className="flex-1 font-mono type-code min-h-[400px]" 
              placeholder='{
  "id": "my-custom-skill",
  "name": "My Custom Skill",
  "version": "1.0.0",
  ...
}'
              value={jsonImport}
              onChange={e => setJsonImport(e.target.value)}
            />
            <div className="flex justify-end">
              <Button onClick={handleImport}>
                <Code className="w-4 h-4 mr-2" />
                Validate & Import
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
