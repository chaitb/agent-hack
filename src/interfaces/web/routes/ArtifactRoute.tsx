import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { Link } from "wouter";
import { Card } from "../components";
import { fetchArtifact, queryKeys } from "./api";

export function ArtifactRoute({ id }: { id: string }) {
	const artifactQuery = useQuery({
		queryKey: queryKeys.artifact(id),
		queryFn: () => fetchArtifact(id),
	});

	if (artifactQuery.isError) {
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
		<div className="max-w-5xl mx-auto pt-2 px-2 md:px-10">
			<div className="flex items-center gap-4 justify-between">
				<Link href="/" className="text-sm text-primary">
					&larr; Back
				</Link>
				<div className="text-center pr-8">
					<h3 className="pt-4 text-xl font-semibold text-primary">{artifact.filename}</h3>
					<span className="text-sm text-muted-primary">
						{new Date(artifact.created_at).toLocaleString()}
					</span>
				</div>
				<span className="rounded-full bg-bg-muted px-3 py-1 text-sm uppercase text-muted-primary">
					{artifact.extension}
				</span>
			</div>
			<Card className="space-y-4 my-4 border-none shadow-xl">
				<div className="overflow-x-auto">
					{artifact.extension === ".md" ? (
						<div className="prose prose-sm max-w-none text-primary">
							<ReactMarkdown>{artifact.content}</ReactMarkdown>
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
