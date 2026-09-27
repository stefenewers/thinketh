/**
 * The discovery sources for the AI-agents domain Thinketh covers today. Chosen for
 * documented, reliable access (checked 2026-09-26), not breadth:
 *
 *   OpenAI News          official RSS           https://openai.com/news/rss.xml
 *   Google DeepMind      official RSS           https://deepmind.google/blog/rss.xml
 *   Hugging Face blog    official RSS           https://huggingface.co/blog/feed.xml
 *   arXiv                documented query API   https://info.arxiv.org/help/api (one request per run,
 *                        well under its "one request every three seconds" guidance)
 *   MCP specification    GitHub releases Atom   the protocol's own release notes
 *
 * Anthropic's news page has no feed, so it isn't scraped. Adding a source is one entry here.
 */
import type { Source } from "../contracts.ts";

export type DiscoverySource = {
  id: string;
  name: string;
  publisher: string;
  url: string;
  sourceType: Source["sourceType"];
  /** Prior on the publisher's reliability for factual claims (0..1). */
  credibility: number;
  /** Feed summaries are too short to ground claims: read the linked page (bounded, hardened reader). */
  readArticle: boolean;
};

const ARXIV_QUERY =
  "(cat:cs.AI OR cat:cs.CL OR cat:cs.LG) AND (abs:\"LLM agent\" OR abs:\"LLM agents\" OR abs:\"language agent\" OR abs:\"tool use\" OR abs:\"agent memory\" OR abs:\"Model Context Protocol\")";

export const DISCOVERY_SOURCES: DiscoverySource[] = [
  { id: "openai-news", name: "OpenAI News", publisher: "OpenAI", url: "https://openai.com/news/rss.xml", sourceType: "announcement", credibility: 0.8, readArticle: true },
  { id: "deepmind-blog", name: "Google DeepMind blog", publisher: "Google DeepMind", url: "https://deepmind.google/blog/rss.xml", sourceType: "announcement", credibility: 0.8, readArticle: true },
  { id: "huggingface-blog", name: "Hugging Face blog", publisher: "Hugging Face", url: "https://huggingface.co/blog/feed.xml", sourceType: "article", credibility: 0.7, readArticle: true },
  {
    id: "arxiv-agents",
    name: "arXiv (agents, tool use, agent memory)",
    publisher: "arXiv",
    url: `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(ARXIV_QUERY)}&sortBy=submittedDate&sortOrder=descending&max_results=25`,
    sourceType: "paper",
    credibility: 0.65,
    readArticle: false,
  },
  {
    id: "mcp-releases",
    name: "Model Context Protocol releases",
    publisher: "Model Context Protocol",
    url: "https://github.com/modelcontextprotocol/modelcontextprotocol/releases.atom",
    sourceType: "github",
    credibility: 0.85,
    readArticle: false,
  },
];
