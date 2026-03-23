import { Box, Spacer, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import React, { useEffect } from "react";
import { getEmbedding } from "../../persistence/embeddings";
import type { DB } from "../../persistence/database";
import type { Memory, ScoredMemory } from "../../core/model";

type MaybeScoredMemory = Memory & { score?: ScoredMemory["score"] };

export const MemoryPanel = ({
  db,
  onBack,
}: {
  db?: DB;
  onBack: () => void;
}) => {
  const [memories, setMemories] = React.useState<MaybeScoredMemory[]>([]);
  const [query, setQuery] = React.useState("");

  const retreiveMemories = async () => {
    if (!db) return;
    const queryEmbedding = await getEmbedding(query);
    const mem = await db.vectorSearch(queryEmbedding);
    setMemories(mem);
  };

  useInput((input, key) => {
    if (key.escape) {
      onBack();
    }
  });

  useEffect(() => {
    async function fetchMemories() {
      if (!db) return;
      const mem = await db.getAllMemories();
      setMemories(mem);
    }
    if (query === "") {
      fetchMemories();
    }
  }, [db, query]);

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Text>Memory Panel</Text>
      <Box borderStyle="single" paddingX={1}>
        <TextInput
          value={query}
          onChange={setQuery}
          onSubmit={retreiveMemories}
          placeholder={"Test recall..."}
        />
      </Box>
      <Spacer />
      {memories.map((memory) => (
        <MemCard memory={memory} key={memory.id} />
      ))}
    </Box>
  );
};

function MemCard({ memory }: { memory: MaybeScoredMemory }) {
  return (
    <Box
      borderStyle="single"
      borderColor="blue"
      borderBottom={false}
      borderTop={true}
      borderLeft={false}
      borderRight={false}
      flexDirection="row"
    >
      <Box flexDirection="column" width={"30%"}>
        <Text color="cyan">
          [{memory.id.slice(0, 8)}]
          {memory.score ? ` Score: (${memory.score.toFixed(2)})` : ""}
        </Text>
        <Text color="yellow">{memory.key}</Text>
        <Text color="greenBright" dimColor>
          #{memory.category}
        </Text>
        <Text dimColor>Used {memory.access_count} times</Text>
      </Box>
      <Box flexGrow={1} width={"70%"} flexDirection="column" paddingX={1}>
        <Text>{memory.value}</Text>
        <Spacer />
        <Text dimColor>
          Last Updated: {new Date(memory.updated_at).toLocaleString()}
        </Text>
      </Box>
    </Box>
  );
}
