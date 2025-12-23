/**
 * Cloudflare Worker for serving the site from R2 with content-addressed storage.
 *
 * Architecture:
 * - Blobs stored in R2 at blobs/{hash}.{ext}
 * - Manifests stored at manifests/{name}.json mapping paths to blob keys
 * - Manifest name determined by subdomain: pr-14.example.com → pr-14, example.com → main
 */

interface Env {
  R2_BUCKET: R2Bucket;
  SITE_DOMAIN: string;
}

interface ManifestEntry {
  hash: string;
  blob: string;
  size: number;
}

type Manifest = Record<string, ManifestEntry>;

// In-memory cache for manifests (per Worker isolate)
const manifestCache = new Map<
  string,
  { manifest: Manifest; expires: number }
>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return handleCORS();
    }

    // Determine manifest name from subdomain
    const manifestName = getManifestName(url.hostname, env.SITE_DOMAIN);

    // Get manifest (with caching)
    const manifest = await getManifest(env.R2_BUCKET, manifestName);
    if (!manifest) {
      return new Response(`Site not found: ${manifestName}`, {
        status: 404,
        headers: corsHeaders(),
      });
    }

    // Resolve path to manifest entry
    const entry = resolvePath(url.pathname, manifest);
    if (!entry) {
      return new Response("Not found", {
        status: 404,
        headers: corsHeaders(),
      });
    }

    // Serve blob
    return serveBlob(env.R2_BUCKET, entry.blob, request);
  },
};

/**
 * Determine manifest name from hostname.
 * pr-14.example.com → pr-14
 * example.com → main
 * www.example.com → main
 */
function getManifestName(hostname: string, siteDomain: string): string {
  // Remove port if present
  const host = hostname.split(":")[0];

  // Check for PR preview subdomain
  if (host.startsWith("pr-")) {
    const parts = host.split(".");
    if (parts.length > 1) {
      return parts[0]; // pr-14
    }
  }

  // Check for www subdomain
  if (host.startsWith("www.")) {
    return "main";
  }

  // Default to main
  return "main";
}

/**
 * Resolve URL path to manifest entry.
 * Handles trailing slashes and directory indexes.
 */
function resolvePath(
  pathname: string,
  manifest: Manifest
): ManifestEntry | null {
  // Normalize path
  let path = pathname;

  // Try exact match first
  if (manifest[path]) {
    return manifest[path];
  }

  // Try with trailing slash removed
  if (path.endsWith("/") && path.length > 1) {
    const withoutSlash = path.slice(0, -1);
    if (manifest[withoutSlash]) {
      return manifest[withoutSlash];
    }
  }

  // Try as directory (add /index.html)
  if (path.endsWith("/")) {
    const indexPath = path + "index.html";
    if (manifest[indexPath]) {
      return manifest[indexPath];
    }
  } else {
    // Try adding /index.html
    const indexPath = path + "/index.html";
    if (manifest[indexPath]) {
      return manifest[indexPath];
    }
  }

  // For paths without extension, try .html
  if (!path.includes(".") || !path.split("/").pop()?.includes(".")) {
    const htmlPath = path + ".html";
    if (manifest[htmlPath]) {
      return manifest[htmlPath];
    }
  }

  return null;
}

/**
 * Get manifest from R2, with in-memory caching.
 */
async function getManifest(
  bucket: R2Bucket,
  name: string
): Promise<Manifest | null> {
  // Check cache
  const cached = manifestCache.get(name);
  if (cached && cached.expires > Date.now()) {
    return cached.manifest;
  }

  // Fetch from R2
  const key = `manifests/${name}.json`;
  const obj = await bucket.get(key);
  if (!obj) {
    return null;
  }

  const manifest = await obj.json<Manifest>();

  // Cache it
  manifestCache.set(name, {
    manifest,
    expires: Date.now() + CACHE_TTL_MS,
  });

  return manifest;
}

/**
 * Serve a blob from R2 with appropriate headers.
 */
async function serveBlob(
  bucket: R2Bucket,
  blobKey: string,
  request: Request
): Promise<Response> {
  // Check for conditional request
  const ifNoneMatch = request.headers.get("If-None-Match");
  if (ifNoneMatch === blobKey) {
    return new Response(null, {
      status: 304,
      headers: corsHeaders(),
    });
  }

  const obj = await bucket.get(blobKey);
  if (!obj) {
    return new Response("Blob not found", {
      status: 500,
      headers: corsHeaders(),
    });
  }

  const headers = new Headers();

  // Content type from R2 metadata
  headers.set(
    "Content-Type",
    obj.httpMetadata?.contentType || "application/octet-stream"
  );

  // Blobs are immutable, cache forever
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  // Use blob key as ETag for conditional requests
  headers.set("ETag", blobKey);

  // Content length
  headers.set("Content-Length", obj.size.toString());

  // CORS headers
  headers.set("Access-Control-Allow-Origin", "*");

  return new Response(obj.body, { headers });
}

/**
 * Handle CORS preflight requests.
 */
function handleCORS(): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

/**
 * Standard CORS headers.
 */
function corsHeaders(): Headers {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}
