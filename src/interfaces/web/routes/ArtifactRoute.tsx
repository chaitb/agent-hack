import { useQuery } from "@tanstack/react-query";
import { Card } from "../components";
import { fetchArtifact, queryKeys } from "./api";

export function ArtifactRoute({ id }: { id: string }) {
	const artifactQuery = useQuery({
		queryKey: queryKeys.artifact(id),
		queryFn: () => fetchArtifact(id),
	});

	if (artifactQuery.error instanceof Error) {
		return (
			<Card>
				<p className="text-red-500">{artifactQuery.error.message}</p>
			</Card>
		);
	}

	if (artifactQuery.isPending) {
		return (
			<Card>
				<p className="text-muted-primary">Loading artifact...</p>
			</Card>
		);
	}

	if (!artifactQuery.data) {
		return (
			<Card>
				<p className="text-muted-primary">Artifact not found.</p>
			</Card>
		);
	}

	const artifact = artifactQuery.data;

	return (
		<div className="flex flex-col gap-4">
			<Card className="space-y-4">
				<div className="flex items-center justify-between">
					<h3 className="text-lg font-semibold text-primary">{artifact.filename}</h3>
					<span className="rounded-full bg-bg-muted px-3 py-1 text-xs uppercase text-muted-primary">
						{artifact.extension}
					</span>
				</div>
				<div className="overflow-x-auto">
					{artifact.extension === ".md" ? (
						<div className="prose prose-sm max-w-none">
							<pre className="whitespace-pre-wrap text-sm text-primary">{artifact.content}</pre>
						</div>
					) : (
						<pre className="whitespace-pre-wrap rounded-lg bg-bg-muted p-4 text-sm text-primary">
							{artifact.content}
						</pre>
					)}
				</div>
			</Card>
		</div>
	);
}
