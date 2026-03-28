import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, StatusPill, uiFontClass } from "../components";
import { fetchArtifacts, queryKeys } from "./api";

export function ArtifactsListRoute() {
	const artifactsQuery = useQuery({
		queryKey: queryKeys.artifacts(),
		queryFn: fetchArtifacts,
	});

	const artifacts = artifactsQuery.data ?? [];

	if (artifactsQuery.isError) {
		return (
			<Card>
				<p className="text-red-500">{artifactsQuery.error.message}</p>
			</Card>
		);
	}

	if (artifactsQuery.isPending) {
		return (
			<Card>
				<p className="text-muted-primary">Loading artifacts...</p>
			</Card>
		);
	}

	if (artifacts.length === 0) {
		return (
			<Card>
				<p className="text-muted-primary">No artifacts yet. Use the agent to create some!</p>
			</Card>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			{artifacts.map((artifact) => {
				const ext = artifact.filename.substring(artifact.filename.lastIndexOf(".")).toLowerCase();
				return (
					<Link key={artifact.id} href={`/artifacts/${artifact.id}`}>
						<Card className="cursor-pointer space-y-2 transition-colors hover:border-accent">
							<div className="flex items-center justify-between">
								<p className={`text-2xl text-primary ${uiFontClass}`}>{artifact.filename}</p>
								<StatusPill>{ext.replace(".", "")}</StatusPill>
							</div>
							{/*{artifact.created_at}*/}
						</Card>
					</Link>
				);
			})}
		</div>
	);
}
