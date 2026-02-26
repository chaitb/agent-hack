import { Client } from "@notionhq/client";
import { z } from "zod";
import { logger } from "../logger";
import type { DB } from "../memory";
import { createToolHandler } from "./createToolHandler";

export function createNotionTools(db: DB) {
	const token = process.env.NOTION_API_TOKEN;
	if (!token) {
		logger.push("system", "Notion: no NOTION_API_TOKEN, tools disabled");
		return {} as Record<string, never>;
	}

	const notion = new Client({ auth: token });

	return {
		notion_search: createToolHandler({
			namespace: "notion",
			name: "search",
			description: "Search Notion workspace for pages and databases by title.",
			db,
			inputSchema: z.object({
				query: z.string().optional().describe("Search query. Omit to list recent items."),
				page_size: z.number().optional().default(10),
			}),
			execute: async ({ query, page_size }) => {
				const params: Parameters<typeof notion.search>[0] = { page_size };
				if (query) params.query = query;
				const response = await notion.search(params);
				const results = response.results.map((r) => ({
					id: r.id,
					type: r.object,
					title: extractTitle(r as Record<string, unknown>),
					url: "url" in r ? r.url : null,
				}));
				return { success: true, results };
			},
		}),

		notion_get_page: createToolHandler({
			namespace: "notion",
			name: "get_page",
			description: "Get a Notion page's properties by its ID.",
			db,
			inputSchema: z.object({
				page_id: z.string(),
			}),
			execute: async ({ page_id }) => {
				const page = await notion.pages.retrieve({ page_id });
				return { success: true, page };
			},
		}),

		notion_create_page: createToolHandler({
			namespace: "notion",
			name: "create_page",
			description: "Create a new page in Notion. Can be a child of a page or database entry. Supports markdown.",
			db,
			inputSchema: z.object({
				parent_type: z.enum(["page", "database"]),
				parent_id: z.string(),
				title: z.string(),
				markdown: z.string().optional().describe("Page content as markdown"),
				properties: z.record(z.string(), z.unknown()).optional().describe("Additional properties for database entries"),
			}),
			execute: async ({ parent_type, parent_id, title, markdown, properties }) => {
				const parent = parent_type === "database" ? { database_id: parent_id } : { page_id: parent_id };
				const props = (properties ?? {}) as Record<string, unknown>;
				props.title = { title: [{ text: { content: title } }] };
				const createParams = {
					parent,
					properties: props,
					...(markdown ? { markdown } : {}),
				} as Parameters<typeof notion.pages.create>[0];
				const page = await notion.pages.create(createParams);
				return { success: true, page_id: page.id };
			},
		}),

		notion_update_page: createToolHandler({
			namespace: "notion",
			name: "update_page",
			description: "Update a Notion page's properties.",
			db,
			inputSchema: z.object({
				page_id: z.string(),
				properties: z.record(z.string(), z.unknown()).describe("Properties to update"),
			}),
			execute: async ({ page_id, properties }) => {
				await notion.pages.update({
					page_id,
					properties: properties as Parameters<typeof notion.pages.update>[0]["properties"],
				});
				return { success: true, page_id };
			},
		}),

		notion_query_database: createToolHandler({
			namespace: "notion",
			name: "query_database",
			description: "Query a Notion database with optional filters and sorts.",
			db,
			inputSchema: z.object({
				database_id: z.string(),
				filter: z.record(z.string(), z.unknown()).optional(),
				sorts: z.array(z.record(z.string(), z.unknown())).optional(),
				page_size: z.number().optional().default(20),
			}),
			execute: async ({ database_id, filter, sorts, page_size }) => {
				const params = {
					data_source_id: database_id,
					page_size,
					...(filter ? { filter } : {}),
					...(sorts ? { sorts } : {}),
				} as Parameters<typeof notion.dataSources.query>[0];
				const response = await notion.dataSources.query(params);
				const results = response.results.map((r) => ({
					id: r.id,
					properties: "properties" in r ? r.properties : null,
					url: "url" in r ? r.url : null,
				}));
				return { success: true, results, has_more: response.has_more };
			},
		}),

		notion_append_blocks: createToolHandler({
			namespace: "notion",
			name: "append_blocks",
			description: "Append content to an existing Notion page.",
			db,
			inputSchema: z.object({
				page_id: z.string(),
				text: z.string().describe("Text content to append as a paragraph"),
			}),
			execute: async ({ page_id, text }) => {
				await notion.blocks.children.append({
					block_id: page_id,
					children: [{ paragraph: { rich_text: [{ text: { content: text } }] } }],
				});
				return { success: true, page_id };
			},
		}),

		notion_get_block_children: createToolHandler({
			namespace: "notion",
			name: "get_block_children",
			description: "Get the content blocks of a Notion page. Use to read page content.",
			db,
			inputSchema: z.object({
				block_id: z.string(),
				page_size: z.number().optional().default(50),
			}),
			execute: async ({ block_id, page_size }) => {
				const response = await notion.blocks.children.list({ block_id, page_size });
				return { success: true, blocks: response.results, has_more: response.has_more };
			},
		}),
	};
}

function extractTitle(obj: Record<string, unknown>): string {
	try {
		const props = obj.properties as Record<string, unknown> | undefined;
		if (props) {
			for (const val of Object.values(props)) {
				const prop = val as Record<string, unknown>;
				if (prop.type === "title") {
					const arr = prop.title as Array<{ plain_text?: string }>;
					return arr?.map((t) => t.plain_text).join("") || "(untitled)";
				}
			}
		}
		if (obj.title && Array.isArray(obj.title)) {
			return (obj.title as Array<{ plain_text?: string }>).map((t) => t.plain_text).join("") || "(untitled)";
		}
	} catch { /* ignore */ }
	return "(untitled)";
}
