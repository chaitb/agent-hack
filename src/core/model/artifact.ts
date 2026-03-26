export const ALLOWED_EXTENSIONS = [
	".html",
	".css",
	".json",
	".csv",
	".ts",
	".tsx",
	".js",
	".jsx",
	".md",
	".txt",
] as const;

export type ArtifactExtension = (typeof ALLOWED_EXTENSIONS)[number];

export interface ArtifactMeta {
	id: string;
	filename: string;
	extension: ArtifactExtension;
	path: string;
	url: string;
	created_at: string;
}

export interface ArtifactListItem {
	id: string;
	filename: string;
	url: string;
}

export interface ArtifactContent extends ArtifactMeta {
	content: string;
}

export function isValidExtension(ext: string): ext is ArtifactExtension {
	return ALLOWED_EXTENSIONS.includes(ext as ArtifactExtension);
}

export function generateArtifactId(filename: string): string {
	const timestamp = Date.now().toString(36);
	const random = Math.random().toString(36).substring(2, 8);
	const baseName = filename.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]/g, "-");
	return `${baseName}-${timestamp}-${random}`;
}

export function getExtension(filename: string): string {
	const lastDot = filename.lastIndexOf(".");
	return lastDot >= 0 ? filename.substring(lastDot) : ".txt";
}
