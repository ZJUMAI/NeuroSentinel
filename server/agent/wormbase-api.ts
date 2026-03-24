/**
 * WormBase REST API integration for querying C. elegans data.
 *
 * Two API types:
 * 1. Main REST API: https://rest.wormbase.org/rest/field/{class}/{object}/{field}
 *    - Gene description: /rest/field/gene/{gene_id}/concise_description
 * 2. ParaSite API (Ensembl-based): https://parasite.wormbase.org/rest/
 *    - Symbol lookup: /rest/xrefs/symbol/caenorhabditis_elegans/{symbol}
 *
 * Rate limit: ~15 requests/second recommended. We add 100ms delay between requests.
 */

const WORMBASE_MAIN_API = "https://rest.wormbase.org/rest";
const WORMBASE_PARASITE_API = "https://parasite.wormbase.org/rest";
const WORMBASE_SPECIES = "caenorhabditis_elegans"; // C. elegans

// Rate limiting: delay between requests (ms)
const REQUEST_DELAY_MS = 100;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type WormBaseGeneInfo = {
  id: string;
  symbol?: string;
  name?: string;
  description?: string;
  location?: string;
  url?: string;
};

export type WormBaseStrainInfo = {
  id: string;
  name?: string;
  genotype?: string;
  description?: string;
  url?: string;
};

export type WormBasePhenotypeInfo = {
  id: string;
  name?: string;
  description?: string;
  genes?: string[];
  url?: string;
};

export type WormBaseSearchResult = {
  query: string;
  genes?: WormBaseGeneInfo[];
  strains?: WormBaseStrainInfo[];
  phenotypes?: WormBasePhenotypeInfo[];
  totalResults: number;
};

/**
 * Resolve gene symbol to WBGene ID via ParaSite API.
 * URL: https://parasite.wormbase.org/rest/xrefs/symbol/caenorhabditis_elegans/{symbol}?content-type=application/json
 */
async function symbolToGeneId(symbol: string): Promise<string | null> {
  try {
    const url = `${WORMBASE_PARASITE_API}/xrefs/symbol/${WORMBASE_SPECIES}/${symbol}?content-type=application/json`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type");
    if (!contentType?.includes("application/json")) return null;

    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      if (first?.id && typeof first.id === "string") {
        return first.id; // e.g. "WBGene00006789"
      }
    }
    return null;
  } catch (e) {
    console.warn(`[WormBase] ParaSite symbol lookup failed for ${symbol}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Get gene concise description from Main REST API.
 * URL: https://rest.wormbase.org/rest/field/gene/{gene_id}/concise_description
 * Response: { concise_description: { data: { text: "..." } } }
 */
async function getGeneConciseDescription(geneId: string): Promise<string | null> {
  try {
    const url = `${WORMBASE_MAIN_API}/field/gene/${geneId}/concise_description`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type");
    if (!contentType?.includes("application/json")) return null;

    const data = await response.json();
    const text =
      data?.concise_description?.data?.text ??
      data?.concise_description?.data?.description ??
      null;
    return typeof text === "string" ? text : null;
  } catch (e) {
    console.warn(`[WormBase] Main API concise_description failed for ${geneId}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Query WormBase for a single gene by symbol or WBGene ID.
 * Uses ParaSite for symbol->ID, then Main API for description.
 */
async function queryGene(identifier: string): Promise<WormBaseGeneInfo | null> {
  let geneId: string;
  let symbol: string;

  if (identifier.startsWith("WBGene")) {
    geneId = identifier;
    symbol = identifier;
  } else {
    // Symbol: resolve to WBGene ID first
    const resolved = await symbolToGeneId(identifier);
    if (!resolved) return null;
    geneId = resolved;
    symbol = identifier;
    await delay(REQUEST_DELAY_MS); // Rate limiting
  }

  const description = await getGeneConciseDescription(geneId);
  if (!description && !geneId) return null;

  return {
    id: geneId,
    symbol,
    name: symbol,
    description: description ?? undefined,
    url: `https://wormbase.org/species/c_elegans/gene/${geneId}`,
  };
}

/**
 * Search WormBase for genes matching the query.
 */
export async function searchWormBase(query: string): Promise<WormBaseSearchResult> {
  const result: WormBaseSearchResult = {
    query,
    genes: [],
    strains: [],
    phenotypes: [],
    totalResults: 0,
  };

  try {
    const genePatterns = [
      /WBGene\d+/gi,
      /\b([a-z]+-\d+)\b/g,
      /\b([A-Z][a-z]+-\d+)\b/g,
      /\b([a-z]+\d+)\b/g,
    ];

    const potentialGenes = new Set<string>();
    for (const pattern of genePatterns) {
      const matches = query.match(pattern);
      if (matches) {
        matches.forEach((m) => {
          const normalized = m.toLowerCase().replace(/([a-z]+)(\d+)/, "$1-$2");
          potentialGenes.add(normalized);
        });
      }
    }

    let genesToQuery = Array.from(potentialGenes).slice(0, 5);

    if (genesToQuery.length === 0) {
      const queryLower = query.toLowerCase();
      const commonGenes = [
        "unc-54", "let-7", "lin-4", "daf-2", "age-1", "daf-16",
        "egl-1", "ced-3", "ced-4", "ced-9", "mec-4", "mec-7",
        "unc-119", "myo-3", "act-1", "skn-1", "dais-1",
      ];
      genesToQuery = commonGenes
        .filter((g) => {
          const gn = g.replace("-", "");
          return queryLower.includes(g) || queryLower.includes(gn) || queryLower.includes(g.split("-")[0]);
        })
        .slice(0, 3);
    }

    for (const gene of genesToQuery) {
      const info = await queryGene(gene);
      if (info && !result.genes?.find((g) => g.id === info.id)) {
        if (!result.genes) result.genes = [];
        result.genes.push(info);
      }
      await delay(REQUEST_DELAY_MS); // Rate limiting between genes
    }

    result.totalResults = (result.genes?.length || 0) + (result.strains?.length || 0) + (result.phenotypes?.length || 0);
    return result;
  } catch (error) {
    console.error("[WormBase] Search error:", error);
    return result;
  }
}

/**
 * Format WormBase search results for LLM consumption.
 */
export function formatWormBaseResults(result: WormBaseSearchResult): string {
  if (result.totalResults === 0) {
    return `No WormBase API results found for "${result.query}".`;
  }

  let output = `WormBase API results for "${result.query}":\n\n`;

  if (result.genes && result.genes.length > 0) {
    output += `Genes (${result.genes.length}):\n`;
    for (const gene of result.genes) {
      output += `- ${gene.symbol || gene.id}`;
      if (gene.name && gene.name !== gene.symbol) output += ` (${gene.name})`;
      if (gene.description) output += `: ${gene.description.substring(0, 400)}${gene.description.length > 400 ? "..." : ""}`;
      if (gene.url) output += `\n  URL: ${gene.url}`;
      output += "\n\n";
    }
  }

  if (result.strains && result.strains.length > 0) {
    output += `Strains (${result.strains.length}):\n`;
    for (const strain of result.strains) {
      output += `- ${strain.name || strain.id}`;
      if (strain.genotype) output += ` (${strain.genotype})`;
      if (strain.description) output += `: ${strain.description.substring(0, 200)}`;
      if (strain.url) output += `\n  URL: ${strain.url}`;
      output += "\n\n";
    }
  }

  if (result.phenotypes && result.phenotypes.length > 0) {
    output += `Phenotypes (${result.phenotypes.length}):\n`;
    for (const phenotype of result.phenotypes) {
      output += `- ${phenotype.name || phenotype.id}`;
      if (phenotype.description) output += `: ${phenotype.description.substring(0, 200)}`;
      if (phenotype.genes?.length) output += `\n  Related genes: ${phenotype.genes.join(", ")}`;
      if (phenotype.url) output += `\n  URL: ${phenotype.url}`;
      output += "\n\n";
    }
  }

  return output;
}
