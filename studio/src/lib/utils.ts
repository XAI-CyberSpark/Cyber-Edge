import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ type: ["page","panel","section","item-title","body","label","caption","tag","code","metric","hmi-title","hmi-body","hmi-label","hmi-caption"] }] } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
