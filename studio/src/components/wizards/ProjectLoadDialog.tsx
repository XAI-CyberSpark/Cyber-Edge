import { uiLocale  } from '@/i18n';
import { uiText, useUiLanguage } from '@/i18n';
import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileJson, Clock, HardDrive, Trash2 } from "lucide-react";
import { apiUrl } from "@/lib/api";

interface ProjectLoadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoad: (project: any) => void;
}

export const ProjectLoadDialog = ({ open, onOpenChange, onLoad }: ProjectLoadDialogProps) => {
  useUiLanguage();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchProjects = async () => {
      setLoading(true);
      try {
          const res = await fetch(apiUrl('/v1/projects/'));
          if (res.ok) {
              const data = await res.json();
              setProjects(data);
          }
      } catch (e) {
          console.error("Failed to list projects", e);
      } finally {
          setLoading(false);
      }
  };

  useEffect(() => {
      if (open) {
          fetchProjects();
      }
  }, [open]);

  const handleLoad = async (id: string) => {
      try {
          const res = await fetch(apiUrl(`/v1/projects/${encodeURIComponent(id)}`));
          if (res.ok) {
              const project = await res.json();
              onLoad(project);
              onOpenChange(false);
          }
      } catch (e) {
          console.error("Failed to load project", e);
      }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (!confirm("Are you sure you want to delete this project?")) return;
      
      try {
          await fetch(apiUrl(`/v1/projects/${encodeURIComponent(id)}`), { method: 'DELETE' });
          fetchProjects(); // Refresh
      } catch (e) {
          console.error("Failed to delete", e);
      }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-background border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="w-5 h-5 text-blue-500" />
            Open Project
          </DialogTitle>
          <DialogDescription className="text-foreground">
            Select a saved workflow to load into the workspace.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-2">
                {projects.map((proj) => (
                    <div 
                        key={proj.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-border bg-background hover:bg-background cursor-pointer transition-colors group"
                        onClick={() => handleLoad(proj.id)}
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-blue-500/10 flex items-center justify-center">
                                <FileJson className="w-4 h-4 text-blue-400" />
                            </div>
                            <div>
                                <div className=" type-item-title text-foreground">{proj.name}</div>
                                <div className="type-code text-foreground font-mono">{proj.file_name || `${proj.id}.json`}</div>
                                <div className="flex items-center gap-3 type-caption text-foreground">
                                    <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {uiText(new Date(proj.updated_at * 1000).toLocaleDateString(uiLocale()))}</span>
                                    <span className="flex items-center gap-1"><HardDrive className="w-3 h-3"/> {uiText(Math.round(proj.size / 1024))} KB</span>
                                </div>
                            </div>
                        </div>
                        
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => handleDelete(e, proj.id)}
                        >
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                ))}
                
                {!loading && projects.length === 0 && (
                    <div className="text-center text-foreground py-10 type-body">
                        No saved projects found.
                    </div>
                )}
            </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
