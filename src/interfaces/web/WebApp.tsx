import type { ComponentType, ReactNode } from "react";
import { Route, Switch } from "wouter";
import { Card, DefaultLayout } from "./components";
import { ArtifactRoute } from "./routes/ArtifactRoute";
import { ArtifactsListRoute } from "./routes/ArtifactsListRoute";
import { ChatRoute } from "./routes/ChatRoute";
import { LogsRoute } from "./routes/LogsRoute";
import { MemoryRoute } from "./routes/MemoryRoute";
import { RecallRoute } from "./routes/RecallRoute";

function RouteWithLayout({
	path,
	component: Component,
	layout: Layout,
}: {
	path: string;
	component: ComponentType;
	layout: ComponentType<{ children: ReactNode }>;
}) {
	return (
		<Route path={path}>
			<Layout>
				<Component />
			</Layout>
		</Route>
	);
}

export function WebApp() {
	return (
		<div className="min-h-screen">
			<Switch>
				<RouteWithLayout path="/" component={ChatRoute} layout={DefaultLayout} />
				<RouteWithLayout path="/chat" component={ChatRoute} layout={DefaultLayout} />
				<RouteWithLayout path="/memory" component={MemoryRoute} layout={DefaultLayout} />
				<RouteWithLayout path="/recall" component={RecallRoute} layout={DefaultLayout} />
				<RouteWithLayout path="/logs" component={LogsRoute} layout={DefaultLayout} />
				<RouteWithLayout path="/artifacts" component={ArtifactsListRoute} layout={DefaultLayout} />
				<Route path="/artifacts/:id">{(params) => <ArtifactRoute id={params.id} />}</Route>
				<Route>
					<Card>
						<p className="text-muted-primary">Unknown route.</p>
					</Card>
				</Route>
			</Switch>
		</div>
	);
}
