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

export interface PipelineConfig {
    notebooks: NotebookConfig[];
}

export interface Manifest {
    latest_date?: string;
    dates?: Record<string, Record<string, { html_path: string }>>;
}

let cachedConfig: PipelineConfig | null = null;
let cachedManifest: Manifest | null = null;

// The data loader is designed to be used in Astro server-side code (getStaticPaths, etc.)
// so we use simple file reading.

export function getPipelineConfig(): PipelineConfig {
    if (cachedConfig) return cachedConfig;

    const configPath = path.join(process.cwd(), '..', 'pipeline.yaml');
    try {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        cachedConfig = yaml.load(configContent) as PipelineConfig;
        return cachedConfig;
    } catch (e) {
        console.error('Failed to load pipeline.yaml', e);
        return { notebooks: [] };
    }
}

export function getNotebooks(): NotebookConfig[] {
    const config = getPipelineConfig();
    return config.notebooks;
}

export function getManifest(): Manifest {
    if (cachedManifest) return cachedManifest;

    const manifestPath = path.join(process.cwd(), 'rendered', 'manifest.json');
    try {
        if (fs.existsSync(manifestPath)) {
            const content = fs.readFileSync(manifestPath, 'utf-8');
            cachedManifest = JSON.parse(content);
            return cachedManifest!;
        }
    } catch (e) {
        console.error('Failed to load manifest.json', e);
    }

    return { dates: {} };
}

export function getLatestDate(): string {
    const manifest = getManifest();
    return manifest.latest_date || '';
}

export function getAvailableDates(): string[] {
    const manifest = getManifest();
    if (!manifest.dates) return [];
    return Object.keys(manifest.dates).sort().reverse();
}
