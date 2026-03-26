import type { ChatMessage } from "../../core/model";

export interface ChatPageAssets {
	cssHref?: string;
	clientScriptSrc: string;
	viteClientSrc?: string;
}

function serializeInitialMessages(messages: ChatMessage[]): string {
	return JSON.stringify(messages).replace(/</g, "\\u003c");
}

export function renderChatPage(initialMessages: ChatMessage[], assets: ChatPageAssets): string {
	const viteClientScript = assets.viteClientSrc
		? `\n    <script type="module" src="${assets.viteClientSrc}"></script>`
		: "";
	const cssLink = assets.cssHref ? `\n    <link rel="stylesheet" href="${assets.cssHref}" />` : "";

	return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mnemosyne Chat</title>
    <meta name="description" content="Unified chat interface for the Pocket Bot runtime." />
    ${cssLink}
  </head>
  <body>
    <div id="root"></div>
    <script id="initial-chat-state" type="application/json">${serializeInitialMessages(initialMessages)}</script>
    ${viteClientScript}
    <script type="module" src="${assets.clientScriptSrc}"></script>
  </body>
</html>`;
}
