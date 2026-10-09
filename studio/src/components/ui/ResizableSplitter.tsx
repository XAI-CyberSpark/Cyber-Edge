import { useState, useCallback, useRef, useEffect } from 'react';

interface ResizableSplitterProps {
  direction: 'horizontal' | 'vertical';
  initialRatio?: number;
  minRatio?: number;
  maxRatio?: number;
  topChild: React.ReactNode;
  bottomChild: React.ReactNode;
  collapsed?: boolean;
  topCollapsed?: boolean;
  className?: string;
}

export function ResizableSplitter({
  direction = 'vertical',
  initialRatio = 0.5,
  minRatio = 0.2,
  maxRatio = 0.8,
  topChild,
  bottomChild,
  collapsed = false,
  topCollapsed = false,
  className = '',
}: ResizableSplitterProps) {
  const [ratio, setRatio] = useState(initialRatio);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (collapsed) return;
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = direction === 'vertical' ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
  }, [direction, collapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let newRatio: number;
      if (direction === 'vertical') {
        newRatio = (e.clientY - rect.top) / rect.height;
      } else {
        newRatio = (e.clientX - rect.left) / rect.width;
      }
      newRatio = Math.max(minRatio, Math.min(maxRatio, newRatio));
      setRatio(newRatio);
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [direction, minRatio, maxRatio]);

  useEffect(() => {
    setRatio((current) => Math.max(minRatio, Math.min(maxRatio, current)));
  }, [minRatio, maxRatio]);

  const isVertical = direction === 'vertical';

  return (
    <div
      ref={containerRef}
      className={`flex ${isVertical ? 'flex-col' : 'flex-row'} ${className}`}
      style={{ height: '100%', width: '100%' }}
    >
      <div style={{ display: topCollapsed ? 'none' : undefined, [isVertical ? 'height' : 'width']: collapsed ? '100%' : `calc(${ratio * 100}% - 2px)` }} className="overflow-hidden">
        {topChild}
      </div>
      <div
        style={{ display: collapsed || topCollapsed ? 'none' : undefined }}
        onMouseDown={handleMouseDown}
        className={`shrink-0 bg-border hover:bg-primary/40 transition-colors ${
          isVertical ? 'h-1 cursor-row-resize w-full' : 'w-1 cursor-col-resize h-full'
        }`}
      />
      <div style={{ display: collapsed ? 'none' : undefined, [isVertical ? 'height' : 'width']: topCollapsed ? '100%' : `calc(${(1 - ratio) * 100}% - 2px)` }} className="overflow-hidden">
        {bottomChild}
      </div>
    </div>
  );
}
