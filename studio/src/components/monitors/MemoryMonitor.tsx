import { uiText } from '@/i18n';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, Database, Search, Sparkles, Network } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export interface MemoryState {
    workingMemory: {
        tokensUsed: number;
        limit: number;
        items: string[];
    };
    longTermMemory: {
        totalEntries: number;
        vectorSize: number;
        recentRetrievals: { query: string; match: string; score: number }[];
    };
    knowledgeGraph: {
        nodes: number;
        edges: number;
        activeContext: string[];
    };
}

interface MemoryMonitorProps {
    state: MemoryState;
}

import { useApp } from "@/context/AppContext";

export const MemoryMonitor = ({ state }: MemoryMonitorProps) => {
    const { t } = useApp();
    return (
        <div className="h-full flex flex-col gap-4 bg-background p-4">
            {/* Top Stats */}
            <div className="grid grid-cols-2 gap-3 h-28 shrink-0">
                <Card className="bg-background border-border">
                    <CardHeader className="pb-2 pt-3 px-4">
                        <CardTitle className="type-item-title  text-foreground uppercase flex items-center gap-2">
                            <Brain className="w-3.5 h-3.5 text-pink-500" /> {uiText(t('memory.working'))}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                        <div className="flex items-end gap-2 mb-2">
                            <span className="type-metric font-mono  text-foreground">{uiText(state.workingMemory.tokensUsed)}</span>
                            <span className="type-caption text-foreground mb-1">/ {uiText(state.workingMemory.limit)} tokens</span>
                        </div>
                        <Progress value={(state.workingMemory.tokensUsed / state.workingMemory.limit) * 100} className="h-1.5 bg-background [&>div]:bg-pink-600" />
                        <div className="mt-2 type-caption text-foreground flex gap-2">
                            <Badge variant="outline" className="type-tag min-h-5 border-pink-500/30 text-pink-400">{uiText(t('memory.context_window'))}</Badge>
                            <span>{uiText(t('memory.active'))}</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-background border-border">
                    <CardHeader className="pb-2 pt-3 px-4">
                        <CardTitle className="type-item-title  text-foreground uppercase flex items-center gap-2">
                            <Database className="w-3.5 h-3.5 text-cyan-500" /> {uiText(t('memory.vector_db'))}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                        <div className="flex items-end gap-2 mb-2">
                            <span className="type-metric font-mono  text-foreground">{uiText(state.longTermMemory.totalEntries)}</span>
                            <span className="type-caption text-foreground mb-1">{uiText(t('memory.entries'))}</span>
                        </div>
                        <div className="flex items-center gap-2 type-caption text-foreground mt-2">
                            <Badge variant="outline" className="type-tag min-h-5 border-cyan-500/30 text-cyan-400">Milvus</Badge>
                            <span>Dim: {uiText(state.longTermMemory.vectorSize)}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* RAG Retrieval Stream */}
            <div className="flex-1 flex flex-col min-h-0 border border-border rounded-lg bg-background overflow-hidden">
                <div className="h-8 border-b border-border bg-background px-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Search className="w-3.5 h-3.5 text-amber-500" />
                        <span className="type-section  text-foreground">{uiText(t('memory.rag_stream'))}</span>
                    </div>
                </div>
                <ScrollArea className="flex-1 p-0">
                    <div className="flex flex-col">
                        {state.longTermMemory.recentRetrievals.length === 0 && (
                            <div className="p-4 text-center type-body text-foreground">{uiText(t('memory.no_retrievals'))}</div>
                        )}
                        {state.longTermMemory.recentRetrievals.map((item, i) => (
                            <div key={i} className="p-3 border-b border-border hover:bg-background transition-colors">
                                <div className="flex justify-between mb-1">
                                    <span className="type-code font-mono text-foreground">{uiText(t('memory.query'))}</span>
                                    <span className="type-code font-mono text-green-400">{uiText((item.score * 100).toFixed(1))}% {uiText(t('memory.match'))}</span>
                                </div>
                                <div className="type-body text-foreground mb-1 font-medium">"{uiText(item.query)}"</div>
                                <div className="flex gap-2 items-start">
                                    <Sparkles className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                                    <div className="type-body text-foreground bg-background p-2 rounded border border-border w-full">
                                        {uiText(item.match)}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </div>

            {/* Knowledge Graph Context */}
            <div className="h-40 shrink-0 border border-border rounded-lg bg-background overflow-hidden flex flex-col">
                 <div className="h-8 border-b border-border bg-background px-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Network className="w-3.5 h-3.5 text-violet-500" />
                        <span className="type-section  text-foreground">{uiText(t('memory.graph'))}</span>
                    </div>
                    <span className="type-caption text-foreground">{uiText(state.knowledgeGraph.nodes)} Nodes</span>
                </div>
                <div className="p-2 flex flex-wrap gap-2 content-start overflow-y-auto">
                    {state.knowledgeGraph.activeContext.map((ctx, i) => (
                        <Badge key={i} variant="secondary" className="bg-background text-foreground hover:bg-accent border border-border type-tag">
                            {uiText(ctx)}
                        </Badge>
                    ))}
                    {state.knowledgeGraph.activeContext.length === 0 && (
                        <div className="w-full text-center type-body text-foreground mt-4">{uiText(t('memory.no_context'))}</div>
                    )}
                </div>
            </div>
        </div>
    );
};
