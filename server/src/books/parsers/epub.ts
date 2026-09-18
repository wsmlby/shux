import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";

export interface EpubMetadata {
  title?: string;
  author?: string;
  description?: string;
  isbn?: string;
  publishedAt?: string;
  cover?: Buffer;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  isArray: (name) => name === "item" || name === "meta" || name === "creator" || name === "identifier",
});

function asText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "object" && "#text" in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)["#text"]).trim() || undefined;
  }
  return undefined;
}

export function parseEpub(filePath: string): EpubMetadata {
  const zip = new AdmZip(filePath);

  const containerXml = zip.readAsText("META-INF/container.xml");
  if (!containerXml) return {};
  const container = parser.parse(containerXml);
  const rootfilePath: string | undefined =
    container?.container?.rootfiles?.rootfile?.["@_full-path"];
  if (!rootfilePath) return {};

  const opfXml = zip.readAsText(rootfilePath);
  if (!opfXml) return {};
  const opf = parser.parse(opfXml);
  const pkg = opf?.package;
  const metadata = pkg?.metadata ?? {};
  const manifest = pkg?.manifest ?? {};

  const title = asText(metadata.title);
  const creators = Array.isArray(metadata.creator) ? metadata.creator : metadata.creator ? [metadata.creator] : [];
  const author = creators.map(asText).filter(Boolean).join(", ") || undefined;
  const description = asText(metadata.description);

  const identifiers = Array.isArray(metadata.identifier)
    ? metadata.identifier
    : metadata.identifier
      ? [metadata.identifier]
      : [];
  const isbn = identifiers
    .map((id: unknown) => asText(id))
    .find((val: string | undefined) => !!val && /^[0-9Xx-]{9,17}$/.test(val.replace(/^urn:isbn:/i, "")));

  const dateRaw = asText(metadata.date);

  // Resolve cover: EPUB3 uses manifest item with properties="cover-image";
  // EPUB2 uses a <meta name="cover" content="ID"> pointing at a manifest item id.
  const items = Array.isArray(manifest.item) ? manifest.item : manifest.item ? [manifest.item] : [];
  let coverItem = items.find((item: Record<string, string>) =>
    (item["@_properties"] ?? "").includes("cover-image")
  );

  if (!coverItem) {
    const metas = Array.isArray(metadata.meta) ? metadata.meta : metadata.meta ? [metadata.meta] : [];
    const coverMeta = metas.find((m: Record<string, string>) => m["@_name"] === "cover");
    const coverId = coverMeta?.["@_content"];
    if (coverId) {
      coverItem = items.find((item: Record<string, string>) => item["@_id"] === coverId);
    }
  }

  let cover: Buffer | undefined;
  if (coverItem?.["@_href"]) {
    const baseDir = rootfilePath.includes("/") ? rootfilePath.slice(0, rootfilePath.lastIndexOf("/") + 1) : "";
    const coverPath = baseDir + coverItem["@_href"];
    const entry = zip.getEntry(coverPath);
    if (entry) cover = entry.getData();
  }

  return {
    title,
    author,
    description,
    isbn: isbn?.replace(/^urn:isbn:/i, ""),
    publishedAt: dateRaw,
    cover,
  };
}
