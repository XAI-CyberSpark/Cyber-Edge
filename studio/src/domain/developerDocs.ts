export interface DocPage { slug: string; title: string; group: string; source: string; markdown: string }
export interface DocHeading { title: string; id: string; level: number; line: number }

export function documentHeadings(markdown: string): DocHeading[] {
  const used = new Map<string, number>();
  let fence = '';
  return markdown.split('\n').flatMap((line, index) => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && line.trim() === marker[1]) fence = '';
      return [];
    }
    if (fence) return [];
    const match = line.match(/^(#{1,3})\s+(.+?)\s*#*$/);
    if (!match) return [];
    const title = match[2].replace(/[`*]/g, '');
    const base = title.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    return [{ title, id: count ? `${base}-${count}` : base, level: match[1].length, line: index + 1 }];
  });
}

export function docHref(slug: string, hash = '') {
  return `/docs${slug === 'overview' ? '' : `?doc=${encodeURIComponent(slug)}`}${hash}`;
}

export function resolveDocLink(href: string, source: string, pages: DocPage[]): { href: string; reference?: string } {
  if (/^https?:\/\//i.test(href) || href.startsWith('mailto:')) return { href };
  if (href.startsWith('#')) return { href };
  try {
    const url = new URL(href, `https://repository.local/${source}`);
    const file = decodeURIComponent(url.pathname.slice(1));
    const page = pages.find(item => item.source === file);
    return page ? { href: docHref(page.slug, url.hash) } : { href: '#repository-reference', reference: file };
  } catch { return { href: '#repository-reference', reference: href }; }
}

export function searchDocuments(pages: DocPage[], query: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return pages.flatMap(page => {
    const content = `${page.title}\n${page.markdown}`.toLocaleLowerCase();
    if (!terms.every(term => content.includes(term))) return [];
    const plain = page.markdown.replace(/```[\s\S]*?```/g, ' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[#*`|>]/g, '').replace(/\s+/g, ' ');
    const index = plain.toLocaleLowerCase().indexOf(terms[0]);
    const start = Math.max(0, index - 30);
    return [{ page, excerpt: `${start ? '…' : ''}${plain.slice(start, start + 140)}…`, rank: terms.filter(term => page.title.toLocaleLowerCase().includes(term)).length }];
  }).sort((a, b) => b.rank - a.rank).slice(0, 20);
}

// Curated weekly entries: one H2 per period, one single-line Markdown bullet per change.
export function updateSummaries(markdown: string) {
  const lines = markdown.split('\n');
  const sections = documentHeadings(markdown).filter(heading => heading.level === 2);
  return sections.flatMap((heading, index) => {
    const match = heading.title.match(/^(\d{4}-\d{2}-\d{2}) · (.+)$/);
    if (!match) return [];
    const body = lines.slice(heading.line, sections[index + 1] ? sections[index + 1].line - 1 : lines.length);
    return [{ id: heading.id, date: match[1], title: match[2],
      status: body.find(line => line.trim()) || '',
      items: body.filter(line => line.startsWith('- ')).map(line => line.slice(2)),
    }];
  });
}
