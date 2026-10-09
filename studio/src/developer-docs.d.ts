declare module 'virtual:developer-docs' {
  const documentation: {
    version: string;
    pages: Array<{ slug: string; title: string; group: string; source: string; markdown: string }>;
  };
  export default documentation;
}
