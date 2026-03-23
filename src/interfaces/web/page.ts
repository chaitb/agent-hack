import type { ChatMessage } from "../../core/chat";

function serializeInitialMessages(messages: ChatMessage[]): string {
	return JSON.stringify(messages).replace(/</g, "\\u003c");
}

export function renderChatPage(initialMessages: ChatMessage[]): string {
	return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mnemosyne Chat</title>
    <meta name="description" content="Unified chat interface for the Pocket Bot runtime." />
    <link rel="stylesheet" href="/assets/app.css" />
  </head>
  <body>
    <div id="root"></div>
    <script id="initial-chat-state" type="application/json">${serializeInitialMessages(initialMessages)}</script>
    <script type="module" src="/assets/client.js"></script>
  </body>
</html>`;
}
