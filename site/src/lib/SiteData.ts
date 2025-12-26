import yaml from 'js-yaml';
import fs from 'node:fs';
import path from 'node:path';

export interface NotebookConfig {
    id: string;
    title: string;
    description: string;
    source: string;
    order: number;
    icon?: string;
}

export interface NotebookData {
    html_path: string;
    rendered_at?: string;
    notebook_hash?: string;
}

export interface Manifest {
    latest_date?: string;
    dates?: Record<string, Record<string, NotebookData>>;
}

export interface PipelineConfig {
    notebooks: NotebookConfig[];
}

/**
 * Centralized data access for the site.
 * Load once in layouts and pass to components as props.
 */
export class SiteData {
    private readonly manifest: Manifest;
    private readonly config: PipelineConfig;

    private constructor(manifest: Manifest, config: PipelineConfig) {
        this.manifest = manifest;
        this.config = config;
    }

    /**
     * Load site data from filesystem. Call once per request in layout.
     */
    static load(): SiteData {
        const manifest = SiteData.loadManifest();
        const config = SiteData.loadConfig();
        return new SiteData(manifest, config);
    }

    private static loadManifest(): Manifest {
        const manifestPath = path.join(process.cwd(), 'rendered', 'manifest.json');
        try {
            if (fs.existsSync(manifestPath)) {
                const content = fs.readFileSync(manifestPath, 'utf-8');
                return JSON.parse(content);
            }
        } catch (e) {
            console.error('Failed to load manifest.json', e);
        }
        return { dates: {} };
    }

    private static loadConfig(): PipelineConfig {
        const configPath = path.join(process.cwd(), '..', 'pipeline.yaml');
        try {
            const configContent = fs.readFileSync(configPath, 'utf-8');
            return yaml.load(configContent) as PipelineConfig;
        } catch (e) {
            console.error('Failed to load pipeline.yaml', e);
            return { notebooks: [] };
        }
    }

    /** The most recent date with rendered data */
    get latestDate(): string {
        return this.manifest.latest_date || '';
    }

    /** All available dates, sorted newest first */
    get availableDates(): string[] {
        if (!this.manifest.dates) return [];
        return Object.keys(this.manifest.dates).sort().reverse();
    }

    /** Historical dates (excluding latest), sorted newest first */
    get historicalDates(): string[] {
        return this.availableDates.filter((d) => d !== this.latestDate);
    }

    /** Notebook configs sorted by order */
    get notebooks(): NotebookConfig[] {
        return [...this.config.notebooks].sort((a, b) => a.order - b.order);
    }

    /** Get notebook data for a specific date and notebook ID */
    getNotebookData(date: string, notebookId: string): NotebookData | undefined {
        return this.manifest.dates?.[date]?.[notebookId];
    }

    /** Check if a date has data */
    hasDate(date: string): boolean {
        return !!this.manifest.dates?.[date];
    }

    /** Get notebook config by ID */
    getNotebook(id: string): NotebookConfig | undefined {
        return this.config.notebooks.find((n) => n.id === id);
    }
}

// Singleton instance for helper function compatibility
let siteDataInstance: SiteData | null = null;

function getSiteData(): SiteData {
    if (!siteDataInstance) {
        siteDataInstance = SiteData.load();
    }
    return siteDataInstance;
}

// Legacy helper functions - delegate to SiteData for backwards compatibility
export function getNotebooks(): NotebookConfig[] {
    return getSiteData().notebooks;
}

export function getLatestDate(): string {
    return getSiteData().latestDate;
}

export function getAvailableDates(): string[] {
    return getSiteData().availableDates;
}

export function getManifest(): Manifest {
    // For backwards compatibility with pages that access manifest directly
    return getSiteData()['manifest'];
}
