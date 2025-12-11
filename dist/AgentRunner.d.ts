import { WikiClient } from './integrations/WikiClient';
export interface AgentContext {
    issueUrl?: string;
    issueNumber?: number;
    issueTitle?: string;
    issueBody?: string;
    previousOutput?: string;
    taskId?: string;
    wikiSummary?: string;
    wikiSearchResults?: string;
    [key: string]: any;
}
export interface AgentResult {
    success: boolean;
    output: string;
    error?: string;
    tokensUsed?: number;
    durationMs?: number;
}
export declare class AgentRunner {
    private client;
    private agentsDir;
    private wikiClient;
    constructor(apiKey: string, agentsDir?: string, wikiClient?: WikiClient | null);
    /**
     * Run a specific agent with given context
     */
    runAgent(agentName: string, context: AgentContext): Promise<AgentResult>;
    /**
     * Load agent configuration from markdown file
     */
    private loadAgentConfig;
    /**
     * Build prompt by combining agent config and context
     */
    private buildPrompt;
    /**
     * Format wiki search results for injection into prompt
     */
    private formatSearchResults;
    /**
     * List available agents
     */
    listAgents(): string[];
}
//# sourceMappingURL=AgentRunner.d.ts.map